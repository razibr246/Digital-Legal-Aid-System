/**
 * Runs a DLAO consultation for an application and promotes it to a case.
 *
 * Kept out of the route so the whole handover — script, transcript, eligibility
 * decision, panel lawyer assignment, application -> case promotion — is one
 * transaction-shaped operation that can be called from a route, a test or a script.
 * The rules themselves live in `consultation-script.ts` and
 * `legal-aid-eligibility.ts`; nothing here decides anything.
 */

import { buildConsultationScript, type ConsultationScript } from "./consultation-script";
import { seedLawyerActionPlan } from "./lawyer-assignment";
import { AUDIT_KINDS, writeAudit } from "../audit/log";
import type { ApplicantFacts, EligibilityDecision } from "./legal-aid-eligibility";
import type { D1Database } from "@/lib/auth/d1-session";

export interface StartConsultationInput {
  applicationId: string;
  applicationTime: string;
  applicantUserId: string;
  applicantName: string;
  phone: string;
  district: string;
  problemStatement: string;
  categoryId: string | null;
  subcategoryId: string | null;
  categoryBn: string;
  facts: ApplicantFacts;
  dlaoUserId: string;
  dlaoName: string;
  panelLawyerId?: string | null;
  panelLawyerName?: string | null;
}

function rid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function last4(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-4) || "0000";
}

/** Builds the script and the DLAO-facing outcome without touching the database. */
export function planConsultation(input: StartConsultationInput): ConsultationScript {
  return buildConsultationScript({
    applicantName: input.applicantName,
    phoneLast4: last4(input.phone),
    districtName: input.district,
    problemStatement: input.problemStatement,
    categoryBn: input.categoryBn,
    facts: input.facts,
    dlaoName: input.dlaoName,
    panelLawyerName: input.panelLawyerName,
  });
}

export interface PersistedConsultation {
  consultationId: string;
  caseId: string | null;
  panelAssignmentId: string | null;
  decision: EligibilityDecision;
  script: ConsultationScript;
  /** True when this call created a case, false when an earlier one already did. */
  created: boolean;
  /** When the applicant first saw the playback; null if they never have. */
  viewedAt: string | null;
  /** Highest turn the applicant has actually seen, for resuming. */
  lastSeq: number;
  /** Set once playback reached the end; only this suppresses the auto-open. */
  completedAt: string | null;
}

/**
 * Idempotent on `applicationId`. A double submit, a re-render, or the applicant
 * refreshing mid-call must not produce a second conversation or a second case — the
 * unique index on `consultations.application_id` enforces it, and the existing row
 * is returned instead.
 */
export async function startOrResumeConsultation(
  db: D1Database,
  input: StartConsultationInput,
): Promise<PersistedConsultation> {
  const existing = await db
    .prepare(
      `SELECT id, case_id, transcript_json, applicant_viewed_at, applicant_last_seq, applicant_completed_at
       FROM consultations WHERE application_id = ? LIMIT 1`,
    )
    .bind(input.applicationId)
    .first<{
      id: string;
      case_id: string | null;
      transcript_json: string;
      applicant_viewed_at: string | null;
      applicant_last_seq: number;
      applicant_completed_at: string | null;
    }>();

  if (existing) {
    const assignment = await db
      .prepare(`SELECT id FROM panel_assignments WHERE consultation_id = ? LIMIT 1`)
      .bind(existing.id)
      .first<{ id: string }>();
    // transcript_json is the whole serialised script, so the resume path replays
    // exactly what the first call produced rather than re-deriving it.
    const script = JSON.parse(existing.transcript_json || "{}") as ConsultationScript;
    return {
      consultationId: existing.id,
      caseId: existing.case_id,
      panelAssignmentId: assignment?.id ?? null,
      decision: script.decision,
      script,
      created: false,
      viewedAt: existing.applicant_viewed_at,
      lastSeq: existing.applicant_last_seq ?? 0,
      completedAt: existing.applicant_completed_at,
    };
  }

  const script = planConsultation(input);
  const consultationId = rid("CONS");
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO consultations
        (id, application_id, citizen_user_id, dlao_user_id, district, channel, phase, status,
         outcome, eligibility_basis, act_bn, transcript_json, summary_bn, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, 'callback', 'close', 'completed', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      consultationId,
      input.applicationId,
      input.applicantUserId,
      input.dlaoUserId,
      input.district,
      script.decision.eligible ? "eligible" : script.decision.conditionalBasis ? "conditional" : "ineligible",
      script.decision.basis,
      script.decision.act.bn,
      JSON.stringify(script),
      script.outcomeSummaryBn,
      now,
      now,
    )
    .run();

  // Turns are inserted individually rather than in a loop-built multi-statement
  // string: D1 parameterises each bind, so a Bangla transcript cannot break out of
  // the statement the way an interpolated one could.
  for (const turn of script.turns) {
    await db
      .prepare(
        `INSERT INTO consultation_turns (id, consultation_id, seq, phase, speaker, text_bn, event)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(rid("TURN"), consultationId, turn.seq, turn.phase, turn.speaker, turn.textBn, turn.event ?? null)
      .run();
  }

  // Promote the application into a case. The application route already created a
  // `cases` row, so the case is adopted rather than created again — creating a
  // second one would split the docket and orphan the application.
  const existingCase = await db
    .prepare(`SELECT id, docket_id FROM cases WHERE id IN (SELECT case_id FROM applications WHERE id = ?)`)
    .bind(input.applicationId)
    .first<{ id: string; docket_id: string }>();

  let caseId = existingCase?.id ?? null;
  if (!caseId) {
    const link = await db
      .prepare(`SELECT case_id FROM application_case_links WHERE application_id = ?`)
      .bind(input.applicationId)
      .first<{ case_id: string }>();
    caseId = link?.case_id ?? null;
  }
  if (!caseId) {
    caseId = rid("CASE");
    const year = new Date().getUTCFullYear();
    const docket = `DLAS-${year}-${Math.floor(1000 + Math.random() * 9000)}`;
    await db
      .prepare(
        // voice_session_id is NOT NULL with no default, and a web application has no
        // voice session, so it is keyed on the application id. That also keeps the
        // case tracking login working: the id is unique and stable.
        `INSERT INTO cases (id, docket_id, citizen_user_id, voice_session_id, problem, category, stage, is_demo, district, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'review', 0, ?, ?)`,
      )
      .bind(
        caseId,
        docket,
        input.applicantUserId,
        input.applicationId,
        input.problemStatement,
        input.categoryId,
        input.district,
        now,
      )
      .run();
  }

  await db
    .prepare(
      `INSERT OR IGNORE INTO application_case_links
        (id, application_id, case_id, consultation_id, promoted_by_user_id, promoted_by_name_bn, reason)
       VALUES (?, ?, ?, ?, ?, ?, 'consultation_completed')`,
    )
    .bind(rid("ACL"), input.applicationId, caseId, consultationId, input.dlaoUserId, input.dlaoName)
    .run();

  // Record the screening result on the case itself, so the DLAO queue can sort by it
  // without joining the consultation transcript.
  await db
    .prepare(
      // `cases.stage` is constrained to CASE_STATUSES, so 'enrolled' would fail the
      // CHECK outright. A screened case starts at 'review' and only moves to 'lawyer'
      // once a panel lawyer is actually on it.
      `UPDATE cases SET eligibility_passed = ?, problem_category = ?, problem_subcategory = ?,
              stage = ?, stage_changed_at = ? WHERE id = ?`,
    )
    .bind(
      script.decision.eligible ? 1 : 0,
      input.categoryId,
      input.subcategoryId,
      // Only a real appointment moves the case on; a refusal stays in review.
      script.appointsPanelLawyer && input.panelLawyerId ? "lawyer" : "review",
      now,
      caseId,
    )
    .run();

  // Stage history, so the applicant's progress stepper is showing recorded fact
  // rather than a stage string read off the current row. Submitted -> review happens
  // when the application is filed; review -> lawyer only when a lawyer is really on it.
  await db
    .prepare(
      `INSERT INTO case_stage_history (id, case_id, from_stage, to_stage, changed_by, changed_by_role, note)
       VALUES (?, ?, ?, 'review', ?, 'dlao', ?)`,
    )
    .bind(rid("CSH"), caseId, "submitted", input.dlaoUserId, `আবেদন গ্রহণ ও সংলাপ সম্পন্ন: ${input.applicationId}`)
    .run();

  let panelAssignmentId: string | null = null;
  if (script.appointsPanelLawyer && input.panelLawyerId) {
    panelAssignmentId = rid("PA");
    await db
      .prepare(
        `INSERT INTO panel_assignments
          (id, case_id, consultation_id, citizen_user_id, panel_lawyer_id, lawyer_name_bn,
           assigned_by_user_id, assigned_by_name_bn, district, eligibility_basis, act_bn, status, note_bn)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      )
      .bind(
        panelAssignmentId,
        caseId,
        consultationId,
        input.applicantUserId,
        input.panelLawyerId,
        input.panelLawyerName ?? null,
        input.dlaoUserId,
        input.dlaoName,
        input.district,
        script.decision.basis,
        script.decision.act.bn,
        `${script.decision.basisBn} — ${script.actSentenceBn}`,
      )
      .run();
  }

  if (script.appointsPanelLawyer && input.panelLawyerId) {
    await db
      .prepare(
        `INSERT INTO case_stage_history (id, case_id, from_stage, to_stage, changed_by, changed_by_role, note)
         VALUES (?, ?, 'review', 'lawyer', ?, 'dlao', ?)`,
      )
      .bind(rid("CSH"), caseId, input.dlaoUserId, `${script.decision.basisBn} — প্যানেল আইনজীবী নিয়োগ`)
      .run();
  }

  // The lawyer's expected actions are seeded from the appointment date. Shared with
  // the manual assignment path so a DLAO's own appointment and an automatic one
  // produce identical records.
  if (panelAssignmentId) {
    await seedLawyerActionPlan(db, {
      caseId,
      assignmentId: panelAssignmentId,
      panelLawyerId: input.panelLawyerId!,
      assignedAt: new Date().toISOString(),
    });
  }

  await db
    .prepare(`UPDATE consultations SET case_id = ? WHERE id = ?`)
    .bind(caseId, consultationId)
    .run();

  await writeAudit(db, {
    kind: AUDIT_KINDS.eligibility_decided,
    refId: caseId,
    actorId: input.dlaoUserId,
    actorRole: "dlao",
    detail: `যোগ্যতা নির্ধারণ: ${script.decision.eligible ? "সহায়তার শর্ত পূরণ" : "শর্ত পূরণ হয়নি"} (${script.decision.basis ?? "—"})`,
    reason: script.decision.act.bn,
  });

  return {
    consultationId,
    caseId,
    panelAssignmentId,
    decision: script.decision,
    script,
    created: true,
    viewedAt: null,
    lastSeq: 0,
    completedAt: null,
  };
}

/**
 * Records how far the applicant has actually seen the conversation.
 *
 * Kept apart from the transcript deliberately: this is presentation state and is
 * allowed to be reset, whereas the transcript is the record. Written on a best-effort
 * basis from the client, so a failure here must never fail the caller's request.
 */
export async function markConsultationViewed(
  db: D1Database,
  consultationId: string,
  lastSeq: number,
  completed: boolean,
): Promise<void> {
  await db
    .prepare(
      `UPDATE consultations
       SET applicant_viewed_at = COALESCE(applicant_viewed_at, datetime('now')),
           applicant_last_seq = MAX(applicant_last_seq, ?),
           applicant_completed_at = CASE WHEN ? = 1
             THEN COALESCE(applicant_completed_at, datetime('now'))
             ELSE applicant_completed_at END
       WHERE id = ?`,
    )
    .bind(Math.max(0, Math.trunc(lastSeq)), completed ? 1 : 0, consultationId)
    .run();
}
