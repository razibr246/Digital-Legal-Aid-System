/**
 * Lawyer Accountability Monitoring API
 *
 * Tracks panel lawyer SLA compliance, issues show-cause notices, freezes payments,
 * and manages reassignments. This enforces the Legal Aid Rules requirement that
 * panel lawyers submit hearing updates after every court date.
 */

import { NextResponse } from "next/server";
import { getAdminDatabase } from "@/lib/auth/admin-guard";
import { writeAudit, AUDIT_KINDS } from "@/lib/audit/log";
import { canAccessScreen } from "@/lib/auth/screen-guard";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import { gradeAction, summariseTracker, type TrackedActionInput } from "@/lib/case/lawyer-tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChiefRole = "chief" | "chairman";

function resolveRole(role: string | null | undefined): ChiefRole | null {
  const r = String(role ?? "").trim();
  if (r === "chief" || r === "cdlao") return "chief";
  if (r === "chairman") return "chairman";
  return null;
}

async function requireChief(request: Request, db: D1Database) {
  const token = request.headers
    .get("cookie")
    ?.split("; ")
    .find((row) => row.startsWith("auth_session="))
    ?.split("=")[1];
  const user = (await getD1SessionUser(db, token)) || getLocalSessionUser(token);
  if (!user) return { error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };

  const role = resolveRole(user.role);
  if (!role || !canAccessScreen(role, "chief")) {
    return { error: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { user, role };
}

interface LawyerMetrics {
  id: string;
  name: string;
  barId: string;
  phone: string | null;
  district: string | null;
  specialization: string | null;
  status: string;
  casesAssigned: number;
  casesCompleted: number;
  casesReassigned: number;
  activeComplaints: number;
  totalComplaints: number;
  overdueActions: number;
  dueSoonActions: number;
  completedActions: number;
  totalActions: number;
  progressPercent: number;
  violationCount: number;
  lastViolationAt: string | null;
  paymentFrozen: boolean;
  redFlagCount: number;
  warningCount: number;
  hasActiveShowCause: boolean;
  showCauseDeadline: string | null;
  performanceScore: number | null;
}

export async function GET(request: Request) {
  const db = getAdminDatabase();
  if (!db) return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  const auth = await requireChief(request, db);
  if (auth.error) return auth.error;

  const now = new Date();

  // Get all panel lawyers with aggregated metrics
  let lawyers: LawyerMetrics[] = [];
  try {
    const lawyersResult = await db
      .prepare(
        `SELECT pl.id, pl.name_bn AS name, pl.bar_registration AS barId, pl.phone,
                pl.jurisdiction_district_name AS district, pl.specialisations AS specialization,
                pl.list_status AS status, pl.payment_frozen AS paymentFrozen,
                pl.red_flag_count AS redFlagCount, pl.warning_count AS warningCount,
                pl.violation_count AS violationCount, pl.last_violation_at AS lastViolationAt,
                pl.performance_score AS performanceScore, pl.cases_assigned AS casesAssigned,
                pl.cases_completed AS casesCompleted, pl.cases_reassigned AS casesReassigned,
                (SELECT COUNT(*) FROM lawyer_service_complaints lsc
                 WHERE lsc.panel_lawyer_id = pl.id AND lsc.status IN ('open', 'in_review')) AS activeComplaints,
                (SELECT COUNT(*) FROM lawyer_service_complaints lsc
                 WHERE lsc.panel_lawyer_id = pl.id) AS totalComplaints
           FROM panel_lawyers pl
          WHERE pl.list_status = 'on_panel'
          ORDER BY pl.name_bn ASC`,
      )
      .all<Record<string, unknown>>();

    // For each lawyer, get their action log metrics
    for (const l of lawyersResult.results ?? []) {
      const lawyerId = String(l.id);

      // Get lawyer action log for all their cases
      const actionsResult = await db
        .prepare(
          `SELECT lal.action_code AS code, lal.label_bn AS labelBn, lal.due_at AS dueAt,
                  lal.done_at AS doneAt, lal.note_bn AS noteBn, lal.created_at AS assignedAt
             FROM lawyer_action_log lal
            WHERE lal.panel_lawyer_id = ?
            ORDER BY lal.created_at DESC
            LIMIT 100`,
        )
        .bind(lawyerId)
        .all<Record<string, unknown>>();

      const actions = (actionsResult.results ?? []).map((a) => {
        const assignedAt = String(a.assignedAt || now.toISOString());
        return gradeAction(
          {
            code: String(a.code),
            labelBn: String(a.labelBn),
            dueAt: a.dueAt ? String(a.dueAt) : null,
            doneAt: a.doneAt ? String(a.doneAt) : null,
            noteBn: a.noteBn ? String(a.noteBn) : null,
          } as TrackedActionInput,
          assignedAt,
          now,
        );
      });

      const summary = summariseTracker(actions, now.toISOString(), now);

      // Check for active show-cause
      let hasActiveShowCause = false;
      let showCauseDeadline: string | null = null;
      try {
        const showCause = await db
          .prepare(
            `SELECT deadline_at FROM lawyer_show_cause
             WHERE panel_lawyer_id = ? AND status = 'pending'
             ORDER BY deadline_at ASC LIMIT 1`,
          )
          .bind(lawyerId)
          .first<{ deadline_at: string }>();
        if (showCause) {
          hasActiveShowCause = true;
          showCauseDeadline = showCause.deadline_at;
        }
      } catch {
        // Table may not exist yet
      }

      lawyers.push({
        id: lawyerId,
        name: String(l.name || ""),
        barId: String(l.barId || ""),
        phone: l.phone ? String(l.phone) : null,
        district: l.district ? String(l.district) : null,
        specialization: l.specialization ? String(l.specialization) : null,
        status: String(l.status || "on_panel"),
        casesAssigned: Number(l.casesAssigned || 0),
        casesCompleted: Number(l.casesCompleted || 0),
        casesReassigned: Number(l.casesReassigned || 0),
        activeComplaints: Number(l.activeComplaints || 0),
        totalComplaints: Number(l.totalComplaints || 0),
        overdueActions: summary.overdue,
        dueSoonActions: summary.dueSoon,
        completedActions: summary.done,
        totalActions: summary.total,
        progressPercent: summary.progressPercent,
        violationCount: Number(l.violationCount || 0),
        lastViolationAt: l.lastViolationAt ? String(l.lastViolationAt) : null,
        paymentFrozen: !!l.paymentFrozen,
        redFlagCount: Number(l.redFlagCount || 0),
        warningCount: Number(l.warningCount || 0),
        hasActiveShowCause,
        showCauseDeadline,
        performanceScore: l.performanceScore ? Number(l.performanceScore) : null,
      });
    }
  } catch {
    // Table columns may not exist yet
    const lawyersBasic = await db
      .prepare(
        `SELECT pl.id, pl.name_bn AS name, pl.bar_registration AS barId, pl.phone,
                pl.jurisdiction_district_name AS district, pl.specialisations AS specialization,
                pl.list_status AS status
           FROM panel_lawyers pl
          WHERE pl.list_status = 'on_panel'
          ORDER BY pl.name_bn ASC`,
      )
      .all<Record<string, unknown>>();

    lawyers = (lawyersBasic.results ?? []).map((l) => ({
      id: String(l.id),
      name: String(l.name || ""),
      barId: String(l.barId || ""),
      phone: l.phone ? String(l.phone) : null,
      district: l.district ? String(l.district) : null,
      specialization: l.specialization ? String(l.specialization) : null,
      status: String(l.status || "on_panel"),
      casesAssigned: 0,
      casesCompleted: 0,
      casesReassigned: 0,
      activeComplaints: 0,
      totalComplaints: 0,
      overdueActions: 0,
      dueSoonActions: 0,
      completedActions: 0,
      totalActions: 0,
      progressPercent: 0,
      violationCount: 0,
      lastViolationAt: null,
      paymentFrozen: false,
      redFlagCount: 0,
      warningCount: 0,
      hasActiveShowCause: false,
      showCauseDeadline: null,
      performanceScore: null,
    }));
  }

  // Get pending show-cause notices
  let showCauseNotices: Record<string, unknown>[] = [];
  try {
    const notices = await db
      .prepare(
        `SELECT sc.id, sc.panel_lawyer_id AS lawyerId, sc.case_id AS caseId,
                sc.reason_code AS reasonCode, sc.reason_detail AS reasonDetail,
                sc.issued_at AS issuedAt, sc.deadline_at AS deadlineAt, sc.status,
                sc.response_text AS response, sc.responded_at AS respondedAt,
                pl.name_bn AS lawyerName, c.docket_id AS caseRef
           FROM lawyer_show_cause sc
           LEFT JOIN panel_lawyers pl ON pl.id = sc.panel_lawyer_id
           LEFT JOIN cases c ON c.id = sc.case_id
          WHERE sc.status IN ('pending', 'responded')
          ORDER BY sc.deadline_at ASC`,
      )
      .all<Record<string, unknown>>();
    showCauseNotices = notices.results ?? [];
  } catch {
    // Table may not exist
  }

  // Get recent SLA violations
  let recentViolations: Record<string, unknown>[] = [];
  try {
    const violations = await db
      .prepare(
        `SELECT v.id, v.panel_lawyer_id AS lawyerId, v.case_id AS caseId,
                v.action_code AS actionCode, v.deadline_at AS deadlineAt,
                v.missed_at AS missedAt, v.consecutive_count AS consecutiveCount,
                v.status, pl.name_bn AS lawyerName, c.docket_id AS caseRef
           FROM lawyer_sla_violations v
           LEFT JOIN panel_lawyers pl ON pl.id = v.panel_lawyer_id
           LEFT JOIN cases c ON c.id = v.case_id
          WHERE v.status IN ('open', 'acknowledged')
          ORDER BY v.missed_at DESC
          LIMIT 50`,
      )
      .all<Record<string, unknown>>();
    recentViolations = violations.results ?? [];
  } catch {
    // Table may not exist
  }

  // Get active payment freezes
  let paymentFreezes: Record<string, unknown>[] = [];
  try {
    const freezes = await db
      .prepare(
        `SELECT f.id, f.panel_lawyer_id AS lawyerId, f.reason, f.frozen_at AS frozenAt,
                f.status, pl.name_bn AS lawyerName
           FROM lawyer_payment_freeze f
           LEFT JOIN panel_lawyers pl ON pl.id = f.panel_lawyer_id
          WHERE f.status = 'active'
          ORDER BY f.frozen_at DESC`,
      )
      .all<Record<string, unknown>>();
    paymentFreezes = freezes.results ?? [];
  } catch {
    // Table may not exist
  }

  // Get active flags (red flags and warnings)
  let activeFlags: Record<string, unknown>[] = [];
  try {
    const flags = await db
      .prepare(
        `SELECT lf.id, lf.panel_lawyer_id AS lawyerId, lf.flag_type AS flagType,
                lf.reason_code AS reasonCode, lf.reason_detail AS reasonDetail,
                lf.issued_at AS issuedAt, lf.expires_at AS expiresAt,
                pl.name_bn AS lawyerName
           FROM lawyer_flags lf
           LEFT JOIN panel_lawyers pl ON pl.id = lf.panel_lawyer_id
          WHERE lf.status = 'active'
          ORDER BY lf.issued_at DESC`,
      )
      .all<Record<string, unknown>>();
    activeFlags = flags.results ?? [];
  } catch {
    // Table may not exist
  }

  // Summary KPIs
  const kpis = {
    totalLawyers: lawyers.length,
    lawyersWithOverdue: lawyers.filter((l) => l.overdueActions > 0).length,
    lawyersWithComplaints: lawyers.filter((l) => l.activeComplaints > 0).length,
    paymentsFrozen: paymentFreezes.length,
    pendingShowCause: showCauseNotices.filter((sc) => sc.status === "pending").length,
    activeRedFlags: activeFlags.filter((f) => f.flagType === "red_flag").length,
    activeWarnings: activeFlags.filter((f) => f.flagType === "warning").length,
    totalViolations: recentViolations.length,
  };

  return NextResponse.json({
    ok: true,
    kpis,
    lawyers,
    showCauseNotices,
    recentViolations,
    paymentFreezes,
    activeFlags,
  });
}

type ActionBody = {
  action:
    | "issue_show_cause"
    | "resolve_show_cause"
    | "freeze_payment"
    | "lift_freeze"
    | "add_flag"
    | "clear_flag"
    | "record_violation"
    | "reassign_case";
  lawyerId?: string;
  caseId?: string;
  showCauseId?: string;
  flagId?: string;
  violationId?: string;
  reasonCode?: string;
  reasonDetail?: string;
  resolution?: string;
  resolutionNote?: string;
  newLawyerId?: string;
};

export async function POST(request: Request) {
  const db = getAdminDatabase();
  if (!db) return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  const auth = await requireChief(request, db);
  if (auth.error) return auth.error;
  const { user } = auth;

  const body = (await request.json().catch(() => ({}))) as ActionBody;
  const now = new Date().toISOString();

  // Issue show-cause notice
  if (body.action === "issue_show_cause") {
    const lawyerId = String(body.lawyerId ?? "");
    const reasonCode = String(body.reasonCode ?? "missed_deadline");
    const reasonDetail = String(body.reasonDetail ?? "").trim();
    const caseId = body.caseId ? String(body.caseId) : null;

    if (!lawyerId) {
      return NextResponse.json({ ok: false, error: "missing_lawyer_id" }, { status: 400 });
    }

    // 48-hour deadline
    const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const id = `SC-${crypto.randomUUID().slice(0, 8)}`;

    await db
      .prepare(
        `INSERT INTO lawyer_show_cause
         (id, panel_lawyer_id, case_id, reason_code, reason_detail, issued_by, deadline_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      )
      .bind(id, lawyerId, caseId, reasonCode, reasonDetail, user.id, deadline)
      .run();

    // Get lawyer name for audit
    const lawyer = await db
      .prepare("SELECT name_bn FROM panel_lawyers WHERE id = ?")
      .bind(lawyerId)
      .first<{ name_bn: string }>();

    await writeAudit(db, {
      kind: AUDIT_KINDS.show_cause_issued,
      actorId: user.id,
      actorRole: user.role,
      refId: lawyerId,
      detail: `কারণ দর্শাও নোটিশ জারি: ${lawyer?.name_bn || lawyerId} - ${reasonCode}`,
      reason: reasonDetail,
    });

    return NextResponse.json({ ok: true, id, deadline });
  }

  // Resolve show-cause notice
  if (body.action === "resolve_show_cause") {
    const showCauseId = String(body.showCauseId ?? "");
    const resolution = String(body.resolution ?? "warning");
    const resolutionNote = String(body.resolutionNote ?? "").trim();

    if (!showCauseId) {
      return NextResponse.json({ ok: false, error: "missing_show_cause_id" }, { status: 400 });
    }

    // Get show-cause details
    const sc = await db
      .prepare("SELECT panel_lawyer_id, status FROM lawyer_show_cause WHERE id = ?")
      .bind(showCauseId)
      .first<{ panel_lawyer_id: string; status: string }>();

    if (!sc || sc.status !== "pending" && sc.status !== "responded") {
      return NextResponse.json({ ok: false, error: "invalid_show_cause" }, { status: 400 });
    }

    await db
      .prepare(
        `UPDATE lawyer_show_cause
         SET status = 'resolved', resolution = ?, resolution_note = ?, resolved_by = ?, resolved_at = ?
         WHERE id = ?`,
      )
      .bind(resolution, resolutionNote, user.id, now, showCauseId)
      .run();

    // Apply resolution actions
    if (resolution === "payment_freeze") {
      const freezeId = `PF-${crypto.randomUUID().slice(0, 8)}`;
      try {
        await db
          .prepare(
            `INSERT OR REPLACE INTO lawyer_payment_freeze
             (id, panel_lawyer_id, show_cause_id, reason, frozen_by, status)
             VALUES (?, ?, ?, ?, ?, 'active')`,
          )
          .bind(freezeId, sc.panel_lawyer_id, showCauseId, resolutionNote, user.id)
          .run();

        await db
          .prepare("UPDATE panel_lawyers SET payment_frozen = 1 WHERE id = ?")
          .bind(sc.panel_lawyer_id)
          .run();
      } catch {
        // Tables may not have new columns
      }
    }

    if (resolution === "warning") {
      const flagId = `LF-${crypto.randomUUID().slice(0, 8)}`;
      try {
        await db
          .prepare(
            `INSERT INTO lawyer_flags
             (id, panel_lawyer_id, flag_type, reason_code, reason_detail, issued_by, status)
             VALUES (?, ?, 'warning', 'show_cause_resolution', ?, ?, 'active')`,
          )
          .bind(flagId, sc.panel_lawyer_id, resolutionNote, user.id)
          .run();

        await db
          .prepare("UPDATE panel_lawyers SET warning_count = warning_count + 1 WHERE id = ?")
          .bind(sc.panel_lawyer_id)
          .run();
      } catch {
        // Tables may not exist
      }
    }

    await writeAudit(db, {
      kind: AUDIT_KINDS.show_cause_resolved,
      actorId: user.id,
      actorRole: user.role,
      refId: showCauseId,
      detail: `কারণ দর্শাও নোটিশ নিষ্পত্তি: ${resolution}`,
      reason: resolutionNote,
    });

    return NextResponse.json({ ok: true });
  }

  // Freeze payment
  if (body.action === "freeze_payment") {
    const lawyerId = String(body.lawyerId ?? "");
    const reasonDetail = String(body.reasonDetail ?? "").trim();

    if (!lawyerId) {
      return NextResponse.json({ ok: false, error: "missing_lawyer_id" }, { status: 400 });
    }

    const freezeId = `PF-${crypto.randomUUID().slice(0, 8)}`;
    try {
      await db
        .prepare(
          `INSERT INTO lawyer_payment_freeze
           (id, panel_lawyer_id, reason, frozen_by, status)
           VALUES (?, ?, ?, ?, 'active')`,
        )
        .bind(freezeId, lawyerId, reasonDetail, user.id)
        .run();

      await db
        .prepare("UPDATE panel_lawyers SET payment_frozen = 1 WHERE id = ?")
        .bind(lawyerId)
        .run();
    } catch {
      // Tables may not exist
    }

    const lawyer = await db
      .prepare("SELECT name_bn FROM panel_lawyers WHERE id = ?")
      .bind(lawyerId)
      .first<{ name_bn: string }>();

    await writeAudit(db, {
      kind: AUDIT_KINDS.payment_frozen,
      actorId: user.id,
      actorRole: user.role,
      refId: lawyerId,
      detail: `পেমেন্ট স্থগিত: ${lawyer?.name_bn || lawyerId}`,
      reason: reasonDetail,
    });

    return NextResponse.json({ ok: true, id: freezeId });
  }

  // Lift payment freeze
  if (body.action === "lift_freeze") {
    const lawyerId = String(body.lawyerId ?? "");
    const resolutionNote = String(body.resolutionNote ?? "").trim();

    if (!lawyerId) {
      return NextResponse.json({ ok: false, error: "missing_lawyer_id" }, { status: 400 });
    }

    try {
      await db
        .prepare(
          `UPDATE lawyer_payment_freeze
           SET status = 'lifted', lifted_at = ?, lifted_by = ?, lift_reason = ?
           WHERE panel_lawyer_id = ? AND status = 'active'`,
        )
        .bind(now, user.id, resolutionNote, lawyerId)
        .run();

      await db
        .prepare("UPDATE panel_lawyers SET payment_frozen = 0 WHERE id = ?")
        .bind(lawyerId)
        .run();
    } catch {
      // Tables may not exist
    }

    const lawyer = await db
      .prepare("SELECT name_bn FROM panel_lawyers WHERE id = ?")
      .bind(lawyerId)
      .first<{ name_bn: string }>();

    await writeAudit(db, {
      kind: AUDIT_KINDS.payment_unfrozen,
      actorId: user.id,
      actorRole: user.role,
      refId: lawyerId,
      detail: `পেমেন্ট স্থগিত প্রত্যাহার: ${lawyer?.name_bn || lawyerId}`,
      reason: resolutionNote,
    });

    return NextResponse.json({ ok: true });
  }

  // Add flag (red flag or warning)
  if (body.action === "add_flag") {
    const lawyerId = String(body.lawyerId ?? "");
    const flagType = String(body.reasonCode ?? "warning");
    const reasonDetail = String(body.reasonDetail ?? "").trim();

    if (!lawyerId) {
      return NextResponse.json({ ok: false, error: "missing_lawyer_id" }, { status: 400 });
    }

    const flagId = `LF-${crypto.randomUUID().slice(0, 8)}`;
    try {
      await db
        .prepare(
          `INSERT INTO lawyer_flags
           (id, panel_lawyer_id, flag_type, reason_code, reason_detail, issued_by, status)
           VALUES (?, ?, ?, 'manual', ?, ?, 'active')`,
        )
        .bind(flagId, lawyerId, flagType, reasonDetail, user.id)
        .run();

      if (flagType === "red_flag") {
        await db
          .prepare("UPDATE panel_lawyers SET red_flag_count = red_flag_count + 1 WHERE id = ?")
          .bind(lawyerId)
          .run();
      } else if (flagType === "warning") {
        await db
          .prepare("UPDATE panel_lawyers SET warning_count = warning_count + 1 WHERE id = ?")
          .bind(lawyerId)
          .run();
      }
    } catch {
      // Tables may not exist
    }

    const lawyer = await db
      .prepare("SELECT name_bn FROM panel_lawyers WHERE id = ?")
      .bind(lawyerId)
      .first<{ name_bn: string }>();

    await writeAudit(db, {
      kind: AUDIT_KINDS.lawyer_flagged,
      actorId: user.id,
      actorRole: user.role,
      refId: lawyerId,
      detail: `${flagType === "red_flag" ? "রেড ফ্ল্যাগ" : "সতর্কতা"}: ${lawyer?.name_bn || lawyerId}`,
      reason: reasonDetail,
    });

    return NextResponse.json({ ok: true, id: flagId });
  }

  // Clear flag
  if (body.action === "clear_flag") {
    const flagId = String(body.flagId ?? "");
    const resolutionNote = String(body.resolutionNote ?? "").trim();

    if (!flagId) {
      return NextResponse.json({ ok: false, error: "missing_flag_id" }, { status: 400 });
    }

    try {
      const flag = await db
        .prepare("SELECT panel_lawyer_id, flag_type FROM lawyer_flags WHERE id = ?")
        .bind(flagId)
        .first<{ panel_lawyer_id: string; flag_type: string }>();

      if (flag) {
        await db
          .prepare(
            `UPDATE lawyer_flags
             SET status = 'cleared', cleared_at = ?, cleared_by = ?, clear_reason = ?
             WHERE id = ?`,
          )
          .bind(now, user.id, resolutionNote, flagId)
          .run();

        // Decrement counts
        if (flag.flag_type === "red_flag") {
          await db
            .prepare("UPDATE panel_lawyers SET red_flag_count = MAX(0, red_flag_count - 1) WHERE id = ?")
            .bind(flag.panel_lawyer_id)
            .run();
        } else if (flag.flag_type === "warning") {
          await db
            .prepare("UPDATE panel_lawyers SET warning_count = MAX(0, warning_count - 1) WHERE id = ?")
            .bind(flag.panel_lawyer_id)
            .run();
        }
      }
    } catch {
      // Tables may not exist
    }

    await writeAudit(db, {
      kind: AUDIT_KINDS.flag_cleared,
      actorId: user.id,
      actorRole: user.role,
      refId: flagId,
      detail: "ফ্ল্যাগ প্রত্যাহার",
      reason: resolutionNote,
    });

    return NextResponse.json({ ok: true });
  }

  // Reassign case from one lawyer to another
  if (body.action === "reassign_case") {
    const caseId = String(body.caseId ?? "");
    const fromLawyerId = String(body.lawyerId ?? "");
    const toLawyerId = String(body.newLawyerId ?? "");
    const reasonCode = String(body.reasonCode ?? "sla_violation");
    const reasonDetail = String(body.reasonDetail ?? "").trim();

    if (!caseId || !fromLawyerId) {
      return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
    }

    const reassignId = `LR-${crypto.randomUUID().slice(0, 8)}`;
    try {
      await db
        .prepare(
          `INSERT INTO lawyer_reassignments
           (id, case_id, from_lawyer_id, to_lawyer_id, reason_code, reason_detail, reassigned_by, wakalatnama_cancelled)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        )
        .bind(reassignId, caseId, fromLawyerId, toLawyerId || null, reasonCode, reasonDetail, user.id)
        .run();

      // Update cases_reassigned count for the from-lawyer
      await db
        .prepare("UPDATE panel_lawyers SET cases_reassigned = cases_reassigned + 1 WHERE id = ?")
        .bind(fromLawyerId)
        .run();

      // Update case assigned lawyer
      if (toLawyerId) {
        await db
          .prepare("UPDATE cases SET assigned_lawyer_id = ? WHERE id = ?")
          .bind(toLawyerId, caseId)
          .run();
      } else {
        await db
          .prepare("UPDATE cases SET assigned_lawyer_id = NULL, stage = 'review' WHERE id = ?")
          .bind(caseId)
          .run();
      }
    } catch {
      // Tables may not exist - at minimum update the case
      if (toLawyerId) {
        await db
          .prepare("UPDATE cases SET assigned_lawyer_id = ? WHERE id = ?")
          .bind(toLawyerId, caseId)
          .run();
      } else {
        await db
          .prepare("UPDATE cases SET assigned_lawyer_id = NULL WHERE id = ?")
          .bind(caseId)
          .run();
      }
    }

    const fromLawyer = await db
      .prepare("SELECT name_bn FROM panel_lawyers WHERE id = ?")
      .bind(fromLawyerId)
      .first<{ name_bn: string }>();
    const toLawyer = toLawyerId
      ? await db
          .prepare("SELECT name_bn FROM panel_lawyers WHERE id = ?")
          .bind(toLawyerId)
          .first<{ name_bn: string }>()
      : null;

    await writeAudit(db, {
      kind: AUDIT_KINDS.lawyer_reassigned,
      actorId: user.id,
      actorRole: user.role,
      refId: caseId,
      detail: `আইনজীবী পরিবর্তন: ${fromLawyer?.name_bn || fromLawyerId} → ${toLawyer?.name_bn || toLawyerId || "অনির্ধারিত"}`,
      reason: reasonDetail,
    });

    return NextResponse.json({ ok: true, id: reassignId });
  }

  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
