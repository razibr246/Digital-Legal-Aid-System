/**
 * Assigning a panel lawyer to a case by hand.
 *
 * The consultation already appoints a lawyer automatically, but a DLAO has to be able
 * to choose: match a case to a lawyer's specialisation, move a case off a lawyer who
 * is not working, or cover a district with no lawyer on the roster. So this is a
 * first-class operation, not a database edit.
 *
 * Two rules are enforced here rather than in the screen, because both are the kind of
 * thing that quietly corrupts a case file if they are only checked in the UI:
 *
 *  - An appointment is exclusive per case. A case has at most one active panel
 *    lawyer; reassigning closes the previous assignment rather than leaving two live
 *    rows, which would make "who is this case's lawyer" ambiguous.
 *  - The applicant's deadline clock starts at the new appointment, not at the first
 *    one. A reassignment must not hand the incoming lawyer a fresh 45 days to do
 *    nothing, so the plan is re-seeded from the new date and the old rows are closed.
 *
 * The applicant is never notified by this path. Contact goes through
 * `lib/case/audit.ts` `decideSend`, which fails closed.
 */

import { actionsForTrack, deadlineFrom } from "./lawyer-tracker";
import type { D1Database } from "@/lib/auth/d1-session";
import { AUDIT_KINDS, writeAudit } from "../audit/log";

export interface LawyerSummary {
  id: string;
  name: string;
  kind: "lawyer" | "mediator";
  barRegistration: string | null;
  specialisations: string | null;
  jurisdiction: string | null;
  phone: string | null;
  email: string | null;
  listStatus: string;
  /** Live appointments, so a DLAO can see who is already carrying work. */
  activeAssignments: number;
  /** Appointments with at least one overdue action. */
  overdueActions: number;
  /** True when the lawyer is on the panel and can therefore be assigned. */
  assignable: boolean;
}

/**
 * Pure search over a fetched roster. Kept pure so matching can be tested without a
 * database — substring, case-insensitive, and tolerant of the Bangla digits that
 * appear in bar numbers.
 */
export function filterLawyers(rows: LawyerSummary[], query: string): LawyerSummary[] {
  const q = query.trim();
  if (!q) return rows;
  const needle = q.toLowerCase();
  return rows.filter((r) =>
    [r.name, r.barRegistration, r.specialisations, r.jurisdiction]
      .filter((v): v is string => Boolean(v))
      .some((v) => v.toLowerCase().includes(needle)),
  );
}

/**
 * Orders the roster so the DLAO is offered the least loaded assignable lawyer first.
 * Only among equals: someone who is not on the panel never sorts above someone who
 * is, however idle they are.
 */
export function rankLawyers(rows: LawyerSummary[]): LawyerSummary[] {
  return [...rows].sort((a, b) => {
    if (a.assignable !== b.assignable) return a.assignable ? -1 : 1;
    if (a.activeAssignments !== b.activeAssignments) return a.activeAssignments - b.activeAssignments;
    if (a.overdueActions !== b.overdueActions) return a.overdueActions - b.overdueActions;
    return a.name.localeCompare(b.name, "bn");
  });
}

/** Seeds (or re-seeds) the expected-action plan for an appointment. */
export async function seedLawyerActionPlan(
  db: D1Database,
  args: { caseId: string; assignmentId: string; panelLawyerId: string; assignedAt: string },
): Promise<void> {
  const rid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
  for (const action of actionsForTrack("all")) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO lawyer_action_log
          (id, case_id, assignment_id, panel_lawyer_id, action_code, label_bn, due_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        rid("LAL"),
        args.caseId,
        args.assignmentId,
        args.panelLawyerId,
        action.code,
        action.labelBn,
        deadlineFrom(args.assignedAt, action.days),
      )
      .run();
  }
}

export interface AssignResult {
  assignmentId: string;
  caseId: string;
  lawyerName: string;
  /** True when an existing appointment was replaced rather than created. */
  replaced: boolean;
  previousLawyerName: string | null;
}

export class AssignmentError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "not_assignable" | "closed_case",
  ) {
    super(message);
    this.name = "AssignmentError";
  }
}

export async function assignPanelLawyer(
  db: D1Database,
  args: {
    caseId: string;
    panelLawyerId: string;
    officerUserId: string;
    officerName: string;
    noteBn?: string;
  },
): Promise<AssignResult> {
  const lawyer = await db
    .prepare(
      `SELECT id, name_bn, kind, list_status FROM panel_lawyers WHERE id = ?`,
    )
    .bind(args.panelLawyerId)
    .first<{ id: string; name_bn: string | null; kind: string; list_status: string }>();
  if (!lawyer) throw new AssignmentError("আইনজীবী পাওয়া যায়নি।", "not_found");
  if (lawyer.list_status !== "on_panel") {
    throw new AssignmentError("এই আইনজীবী প্যানেল তালিকায় নেই, তাই নিয়োগ করা যায়নি।", "not_assignable");
  }

  const target = await db
    .prepare(`SELECT id, docket_id, stage FROM cases WHERE id = ?`)
    .bind(args.caseId)
    .first<{ id: string; docket_id: string; stage: string }>();
  if (!target) throw new AssignmentError("কেস পাওয়া যায়নি।", "not_found");
  if (target.stage === "settled" || target.stage === "unresolved") {
    throw new AssignmentError("বন্ধ কেসে আইনজীবী নিয়োগ করা যাবে না।", "closed_case");
  }

  const previous = await db
    .prepare(
      `SELECT p.id, p.panel_lawyer_id, pl.name_bn AS lawyer_name
       FROM panel_assignments p
       LEFT JOIN panel_lawyers pl ON pl.id = p.panel_lawyer_id
       WHERE p.case_id = ? AND p.status = 'active'
       LIMIT 1`,
    )
    .bind(args.caseId)
    .first<{ id: string; panel_lawyer_id: string | null; lawyer_name: string | null }>();

  const assignedAt = new Date().toISOString();
  const assignmentId = `PA-${crypto.randomUUID()}`;

  if (previous) {
    // Close the old appointment rather than leaving two live rows, and close its open
    // action rows so the old lawyer stops counting as overdue on the roster.
    await db
      .prepare(
        `UPDATE panel_assignments
         SET status = 'reassigned', ended_at = ?
         WHERE id = ?`,
      )
      .bind(assignedAt, previous.id)
      .run();
    await db
      .prepare(
        `UPDATE lawyer_action_log
         SET note_bn = COALESCE(note_bn, 'আইনজীবী পরিবর্তিত হয়েছে')
         WHERE assignment_id = ? AND done_at IS NULL`,
      )
      .bind(previous.id)
      .run();
  }

  const caseRow = await db
    .prepare(`SELECT citizen_user_id, district, problem_category FROM cases WHERE id = ?`)
    .bind(args.caseId)
    .first<{ citizen_user_id: string; district: string | null; problem_category: string | null }>();

  await db
    .prepare(
      `INSERT INTO panel_assignments
        (id, case_id, citizen_user_id, panel_lawyer_id, lawyer_name_bn,
         assigned_by_user_id, assigned_by_name_bn, district, eligibility_basis, act_bn,
         status, note_bn, assigned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .bind(
      assignmentId,
      args.caseId,
      caseRow?.citizen_user_id ?? null,
      lawyer.id,
      lawyer.name_bn,
      args.officerUserId,
      args.officerName,
      caseRow?.district ?? null,
      caseRow?.problem_category ?? null,
      null,
      args.noteBn?.trim() || null,
      assignedAt,
    )
    .run();

  await seedLawyerActionPlan(db, {
    caseId: args.caseId,
    assignmentId,
    panelLawyerId: lawyer.id,
    assignedAt,
  });

  // The case only becomes a lawyer case once a lawyer is genuinely on it.
  //
  // `cases.assigned_lawyer_id` is deliberately NOT written here. It is a foreign key to
  // `users(id)` — the older panel-login accounts — whereas the roster lives in
  // `panel_lawyers`, so writing a roster id into it fails the constraint. The
  // authoritative case-to-lawyer link is `panel_assignments`, which the panel lawyer's
  // own case list now reads, so there is one link rather than two that can disagree.
  await db
    .prepare(`UPDATE cases SET stage = 'lawyer', lawyer_requested = 1, stage_changed_at = ? WHERE id = ?`)
    .bind(assignedAt, args.caseId)
    .run();

  await db
    .prepare(
      `INSERT INTO case_stage_history (id, case_id, from_stage, to_stage, changed_by, changed_by_role, note)
       VALUES (?, ?, ?, 'lawyer', ?, 'dlao', ?)`,
    )
    .bind(
      `CSH-${crypto.randomUUID()}`,
      args.caseId,
      target.stage,
      args.officerUserId,
      previous
        ? `আইনজীবী পরিবর্তন: ${previous.lawyer_name ?? "—"} → ${lawyer.name_bn}`
        : `প্যানেল আইনজীবী নিয়োগ: ${lawyer.name_bn}`,
    )
    .run();

  // Audit-logged through the shared writer, so the event kind comes from the
  // catalogue rather than a literal typed here.
  await writeAudit(db, {
    kind: previous ? AUDIT_KINDS.lawyer_reassigned : AUDIT_KINDS.lawyer_assigned,
    refId: assignmentId,
    actorId: args.officerUserId,
    actorRole: "dlao",
    detail: `${lawyer.name_bn} → ${target.docket_id}${previous ? ` (পূর্ববর্তী: ${previous.lawyer_name ?? "—"})` : ""}`,
    reason: args.noteBn?.trim() || null,
  });

  return {
    assignmentId,
    caseId: args.caseId,
    lawyerName: lawyer.name_bn ?? "আইনজীবী",
    replaced: Boolean(previous),
    previousLawyerName: previous?.lawyer_name ?? null,
  };
}
