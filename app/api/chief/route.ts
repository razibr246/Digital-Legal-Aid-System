/**
 * The Chief DLAO console's data source and its approval actions.
 *
 * Deliberately supervisory and approval-only. The guide is explicit that this console
 * never edits case work — day-to-day case handling sits with the Legal Aid Officer, and
 * "a summary for supervision only, no case data can be changed from here" is a stated
 * property of the screen. So this route exposes certifications, payment decisions and
 * committee functions, and no way to touch a case's facts.
 */

import { NextResponse } from "next/server";
import { getAdminDatabase } from "@/lib/auth/admin-guard";
import { writeAudit, AUDIT_KINDS, queryAudit, auditCounts } from "@/lib/audit/log";
import { certificationState, slaScan, type SlaCandidate } from "@/lib/case/domain";
import {
  canAccessScreen,
  canActionMisconduct,
  canApprovePanelChanges,
  canProposePanelChanges,
} from "@/lib/auth/screen-guard";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChiefRole = "chief" | "chairman";

/** The Chief's console is one template with two role variants. */
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
    await writeAudit(db, {
      kind: AUDIT_KINDS.session_denied,
      actorId: user.id,
      actorRole: user.role,
      detail: "চীফ কনসোল অ্যাক্সেসের চেষ্টা অনুমোদিত হয়নি",
      reason: "not_chief_dlao",
      refId: new URL(request.url).pathname,
    });
    return { error: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
  }
  return { user, role };
}

export async function GET(request: Request) {
  const db = getAdminDatabase();
  if (!db) return NextResponse.json({ ok: false, error: "ডেটাবেস সাময়িকভাবে উপল্লব্ধ নয়।" }, { status: 503 });
  const auth = await requireChief(request, db);
  if (auth.error) return auth.error;
  const { role } = auth;

  const now = new Date();

  // Certifications. All three parties must have signed before the gate opens, so the UI
  // can name who is outstanding rather than showing a mysteriously dead button.
  const settlements = await db
    .prepare(
      `SELECT s.case_id AS caseId, s.signed_applicant AS signedA, s.signed_opposite AS signedB,
              s.signed_mediator AS signedC, s.certified AS certified,
              c.docket_id AS ref, c.problem AS summary, c.district AS district,
              (SELECT MAX(scheduled_at) FROM mediations m WHERE m.case_id = s.case_id) AS mediationDate
         FROM settlements s
         JOIN cases c ON c.id = s.case_id
        WHERE s.certified = 0
        ORDER BY s.updated_at ASC`,
    )
    .all<Record<string, unknown>>();

  const certifications = (settlements.results ?? []).map((row) => {
    const verdict = certificationState(!!row.signedA, !!row.signedB, !!row.signedC, !!row.certified);
    return {
      caseId: row.caseId,
      ref: row.ref,
      summary: row.summary,
      district: row.district,
      mediationDate: row.mediationDate,
      signedA: !!row.signedA,
      signedB: !!row.signedB,
      signedC: !!row.signedC,
      canCertify: verdict.ok,
      blockedReason: verdict.reason,
      blockedNote: verdict.noteBn ?? null,
    };
  });

  // Payment approvals. A decision is one-way and a rejection needs a reason, so the
  // requester, the role that asked, and the amount all travel with the row.
  const payments = await db
    .prepare(
      `SELECT p.id, p.case_id AS caseId, p.type, p.amount_taka AS amount, p.note,
              p.requester_role AS requesterRole, p.requested_at AS requestedAt,
              p.status, c.docket_id AS ref, c.district AS district
         FROM payments p JOIN cases c ON c.id = p.case_id
        WHERE p.status = 'pending'
        ORDER BY p.requested_at ASC`,
    )
    .all<Record<string, unknown>>();

  const paymentRows: Record<string, unknown>[] = payments.results ?? [];
  const pendingPayments = paymentRows.map((row) => ({
    ...row,
    ageDays: Math.max(
      0,
      Math.floor((now.getTime() - new Date(String(row.requestedAt)).getTime()) / 86_400_000),
    ),
  }));

  // Payment-approval SLA: 10 days, warning at 2. Computed once here and written as log
  // rows rather than recomputed per render, so a breach that happened unobserved shows.
  const paymentCandidates = pendingPayments.map(
    (p: Record<string, unknown>) =>
      ({
        ref: String(p.ref),
        caseId: String(p.caseId),
        stage: "payment",
        ageDays: Number(p.ageDays),
      }) as SlaCandidate,
  );
  const slaBreaches = slaScan(paymentCandidates, now);

  // Officer supervision — read-only, by the guide's own statement.
  const officers = await db
    .prepare(
      // There is no `cases.assigned_officer_id` -- a case is not owned by an officer, it
      // moves through stages and each move is attributed. So "cases handled" is derived
      // from the stage history, which is also the honest answer: it counts what an
      // officer actually acted on rather than what they were nominally handed.
      `SELECT u.id, u.display_name AS name, u.role,
              (SELECT COUNT(DISTINCT h.case_id) FROM case_stage_history h
                WHERE h.changed_by = u.id) AS handled,
              (SELECT COUNT(*) FROM case_stage_history h JOIN cases c ON c.id = h.case_id
                WHERE h.changed_by = u.id
                  AND c.stage NOT IN ('closed','settled','unresolved')) AS openCases
         FROM users u
        WHERE u.status = 'active'
          AND (u.role_key = 'dlao' OR u.role IN ('dlao','MOCK-dlao'))
        ORDER BY handled DESC
        LIMIT 25`,
    )
    .all<Record<string, unknown>>();

  const panelCount = await db
    .prepare("SELECT COUNT(*) AS n FROM panel_lawyers")
    .first<{ n: number }>();
  const misconduct = await db
    .prepare("SELECT COUNT(*) AS n FROM misconduct_cases WHERE verdict = 'open'")
    .first<{ n: number }>();

  // Panel lawyers list (wrapped in try-catch in case table doesn't exist)
  let panelLawyers: { results?: Record<string, unknown>[] } = { results: [] };
  try {
    panelLawyers = await db
      .prepare(
        `SELECT pl.id, pl.user_id AS userId, pl.bar_registration AS barId,
                pl.specialisations AS specialization,
                pl.jurisdiction_district_name AS district, pl.list_status AS status,
                pl.approved_at AS approvedAt, pl.name_bn AS name, pl.phone
           FROM panel_lawyers pl
          ORDER BY pl.created_at DESC
          LIMIT 100`,
      )
      .all<Record<string, unknown>>();
  } catch {
    // Table may not exist yet
  }

  // All cases for supervision (show all cases including demo/mock)
  let casesResult: { results?: Record<string, unknown>[] } = { results: [] };
  try {
    casesResult = await db
      .prepare(
        `SELECT c.id, c.docket_id AS ref, c.status, c.stage, c.problem, c.district,
                c.category, c.created_at AS createdAt, c.assigned_lawyer_id AS assignedLawyerId,
                u.display_name AS applicantName, u.phone,
                pl.name_bn AS assignedLawyerName
           FROM cases c
           LEFT JOIN users u ON u.id = c.citizen_user_id
           LEFT JOIN panel_lawyers pl ON pl.id = c.assigned_lawyer_id
          ORDER BY c.created_at DESC
          LIMIT 200`,
      )
      .all<Record<string, unknown>>();
  } catch {
    // Query may fail if columns don't exist
  }

  // Get distinct districts for filter options
  let districtsResult: { results?: { district: string }[] } = { results: [] };
  try {
    districtsResult = await db
      .prepare(`SELECT DISTINCT district FROM cases WHERE district IS NOT NULL AND district != '' ORDER BY district`)
      .all<{ district: string }>();
  } catch {
    // Query may fail
  }

  // Emergency cases analytics - last 28 days
  const emergencyByDay: { day: string; count: number }[] = [];
  try {
    const analyticsStart = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
    const emergencyAnalytics = await db
      .prepare(
        `SELECT DATE(created_at) AS day, COUNT(*) AS count
           FROM cases
          WHERE severity = 'emergency'
            AND DATE(created_at) >= ?
          GROUP BY DATE(created_at)
          ORDER BY day ASC`,
      )
      .bind(analyticsStart)
      .all<{ day: string; count: number }>();

    // Build a complete 28-day series with zeros for missing days
    for (let i = 27; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const dayStr = d.toISOString().slice(0, 10);
      const match = (emergencyAnalytics.results ?? []).find((r) => r.day === dayStr);
      emergencyByDay.push({ day: dayStr, count: match?.count ?? 0 });
    }
  } catch {
    // Fill with empty data if query fails
    for (let i = 27; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      emergencyByDay.push({ day: d.toISOString().slice(0, 10), count: 0 });
    }
  }

  // Lawyer service complaints - open and recent
  let lawyerComplaints: { results?: Record<string, unknown>[] } = { results: [] };
  try {
    lawyerComplaints = await db
      .prepare(
        `SELECT lsc.id, lsc.case_id AS caseId, lsc.panel_lawyer_id AS lawyerId,
                lsc.citizen_user_id AS citizenId, lsc.reason_code AS reasonCode,
                lsc.details_bn AS details, lsc.status, lsc.created_at AS createdAt,
                c.docket_id AS caseRef, c.district AS caseDistrict,
                pl.name_bn AS lawyerName, pl.phone AS lawyerPhone,
                u.display_name AS citizenName, u.phone AS citizenPhone
           FROM lawyer_service_complaints lsc
           LEFT JOIN cases c ON c.id = lsc.case_id
           LEFT JOIN panel_lawyers pl ON pl.id = lsc.panel_lawyer_id
           LEFT JOIN users u ON u.id = lsc.citizen_user_id
          WHERE lsc.status IN ('open', 'in_review')
          ORDER BY lsc.created_at DESC
          LIMIT 50`,
      )
      .all<Record<string, unknown>>();
  } catch {
    // Table may not exist
  }

  // Audit trail - last 7 days
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [auditEntries, auditCountsData] = await Promise.all([
    queryAudit(db, { since, limit: 100 }),
    auditCounts(db, since),
  ]);

  return NextResponse.json({
    ok: true,
    role,
    permissions: {
      proposePanelChanges: canProposePanelChanges(role),
      approvePanelChanges: canApprovePanelChanges(role),
      actionMisconduct: canActionMisconduct(role),
    },
    kpis: {
      pendingCertifications: certifications.length,
      certificationsBlocked: certifications.filter((c) => !c.canCertify).length,
      panelLawyers: panelCount?.n ?? 0,
      openMisconduct: misconduct?.n ?? 0,
      pendingPayments: pendingPayments.length,
      casesHandled: (officers.results ?? []).reduce((sum, o) => sum + Number(o.handled ?? 0), 0),
    },
    slaWarning: slaBreaches.filter((e) => e.level === "near").length,
    slaBreaches: slaBreaches.filter((e) => e.level === "breach").length,
    certifications,
    payments: pendingPayments,
    officers: officers.results ?? [],
    panelLawyers: panelLawyers.results ?? [],
    cases: casesResult.results ?? [],
    districts: (districtsResult.results ?? []).map((r) => r.district),
    emergencyByDay,
    lawyerComplaints: lawyerComplaints.results ?? [],
    audit: {
      entries: auditEntries,
      counts: auditCountsData,
      totalLast7Days: auditEntries.length,
    },
  });
}

type ActionBody = {
  action?: "certify" | "payment_approve" | "payment_reject" | "misconduct_action" | "assign_lawyer" | "assign_officer" | "complaint_resolve" | "complaint_reject" | "complaint_escalate";
  id?: string;
  reason?: string;
  caseId?: string;
  lawyerId?: string;
  officerId?: string;
  resolutionNote?: string;
};

export async function POST(request: Request) {
  const db = getAdminDatabase();
  if (!db) return NextResponse.json({ ok: false, error: "ডেটাবেস সাময়িকভাবে উপল্লব্ধ নয়।" }, { status: 503 });
  const auth = await requireChief(request, db);
  if (auth.error) return auth.error;
  const { user, role } = auth;

  const body = (await request.json().catch(() => ({}))) as ActionBody;
  const id = String(body.id ?? "");
  const reason = String(body.reason ?? "").trim();

  if (body.action === "certify") {
    // Re-read and re-check under the same rule the screen used. A gate enforced only in
    // the browser is not a gate.
    const row = await db
      .prepare(
        "SELECT signed_applicant AS a, signed_opposite AS b, signed_mediator AS c, certified AS d FROM settlements WHERE case_id = ?",
      )
      .bind(id)
      .first<{ a: number; b: string | null; c: number; d: number }>();
    if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const verdict = certificationState(!!row.a, !!row.b, !!row.c, !!row.d);
    if (!verdict.ok) {
      return NextResponse.json(
        { ok: false, error: "blocked", reason: verdict.reason, note: verdict.noteBn },
        { status: 409 },
      );
    }
    await db
      .prepare("UPDATE settlements SET certified = 1, certified_by = ?, certified_at = ? WHERE case_id = ?")
      .bind(user.id, new Date().toISOString(), id)
      .run();
    await writeAudit(db, {
      kind: AUDIT_KINDS.settlement_certified,
      actorId: user.id,
      actorRole: user.role,
      refId: id,
      detail: "তিন পক্ষই স্বাক্ষর করেছেন; ৭ দিনের মধ্যে ডিক্রি",
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "payment_approve" || body.action === "payment_reject") {
    const approve = body.action === "payment_approve";
    if (!approve && !reason) {
      // A rejection has to tell the requester why.
      return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
    }
    // `WHERE status = 'pending' RETURNING id` is what makes the decision one-way: if
    // another approver got there first the row no longer matches and nothing comes back,
    // so the guard is atomic rather than a read-then-write that two approvers can both pass.
    const decided = await db
      .prepare(
        "UPDATE payments SET status = ?, reason = ?, decided_by = ?, decided_at = ? WHERE id = ? AND status = 'pending' RETURNING id",
      )
      .bind(
        approve ? "approved" : "rejected",
        approve ? null : reason,
        user.id,
        new Date().toISOString(),
        id,
      )
      .first<{ id: string }>();
    if (!decided) {
      return NextResponse.json({ ok: false, error: "already_decided" }, { status: 409 });
    }
    await writeAudit(db, {
      kind: AUDIT_KINDS.payment_approved,
      actorId: user.id,
      actorRole: user.role,
      refId: id,
      reason: approve ? null : reason,
      detail: approve ? "পেমেন্ট অনুমোদিত; বিতরণ শুরু" : "পেমেন্ট বাতিল",
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "misconduct_action") {
    // Misconduct is a committee function, so it is not the Chief's to action alone.
    if (!canActionMisconduct(role)) {
      await writeAudit(db, {
        kind: AUDIT_KINDS.session_denied,
        actorId: user.id,
        actorRole: user.role,
        refId: id,
        detail: "কমিটির ক্ষমতা ছাড়া অসদাচরণে ব্যবস্থা নেওয়ার চেষ্টা",
        reason: "not_committee",
      });
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    if (!reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
    await db
      .prepare(
        "UPDATE misconduct_cases SET verdict = 'guilty', finding = ?, actioned_by = ?, referred_to_bar_council = 1, referred_at = ?, removed_from_panel = 1, removed_at = ? WHERE id = ?",
      )
      .bind(reason, user.id, new Date().toISOString(), new Date().toISOString(), id)
      .run();
    await writeAudit(db, {
      kind: AUDIT_KINDS.config_changed,
      actorId: user.id,
      actorRole: user.role,
      refId: id,
      reason,
      detail: "অসদাচরণের রায় লিপিবদ্ধ ও বার কাউন্সিলে প্রেরণ",
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "assign_lawyer") {
    const caseId = String(body.caseId ?? "");
    const lawyerId = String(body.lawyerId ?? "");
    if (!caseId || !lawyerId) {
      return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
    }

    // Get lawyer name for audit
    const lawyer = await db
      .prepare("SELECT name_bn FROM panel_lawyers WHERE id = ?")
      .bind(lawyerId)
      .first<{ name_bn: string }>();

    // Update case with assigned lawyer
    await db
      .prepare("UPDATE cases SET assigned_lawyer_id = ? WHERE id = ?")
      .bind(lawyerId, caseId)
      .run();

    // Record stage change if moving to lawyer stage
    await db
      .prepare(
        "INSERT INTO case_stage_history (id, case_id, from_stage, to_stage, changed_by, changed_by_role, note, at) VALUES (?, ?, (SELECT stage FROM cases WHERE id = ?), 'lawyer', ?, ?, ?, datetime('now'))",
      )
      .bind(
        `CSH-${Date.now()}`,
        caseId,
        caseId,
        user.id,
        user.role,
        `আইনজীবী নিয়োগ: ${lawyer?.name_bn || lawyerId}`,
      )
      .run();

    // Update case stage to lawyer
    await db
      .prepare("UPDATE cases SET stage = 'lawyer', stage_changed_at = datetime('now') WHERE id = ?")
      .bind(caseId)
      .run();

    await writeAudit(db, {
      kind: AUDIT_KINDS.lawyer_assigned,
      actorId: user.id,
      actorRole: user.role,
      refId: caseId,
      detail: `প্যানেল আইনজীবী নিয়োগ: ${lawyer?.name_bn || lawyerId}`,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "assign_officer") {
    const caseId = String(body.caseId ?? "");
    const officerId = String(body.officerId ?? "");
    if (!caseId || !officerId) {
      return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
    }

    // Get officer name for audit
    const officer = await db
      .prepare("SELECT display_name FROM users WHERE id = ?")
      .bind(officerId)
      .first<{ display_name: string }>();

    // Record stage change
    await db
      .prepare(
        "INSERT INTO case_stage_history (id, case_id, from_stage, to_stage, changed_by, changed_by_role, note, at) VALUES (?, ?, (SELECT stage FROM cases WHERE id = ?), 'review', ?, ?, ?, datetime('now'))",
      )
      .bind(
        `CSH-${Date.now()}`,
        caseId,
        caseId,
        user.id,
        user.role,
        `অফিসার দায়িত্ব: ${officer?.display_name || officerId}`,
      )
      .run();

    await writeAudit(db, {
      kind: AUDIT_KINDS.case_stage_changed,
      actorId: user.id,
      actorRole: user.role,
      refId: caseId,
      detail: `অফিসার দায়িত্ব দেওয়া হয়েছে: ${officer?.display_name || officerId}`,
    });
    return NextResponse.json({ ok: true });
  }

  // Lawyer complaint actions
  if (body.action === "complaint_resolve" || body.action === "complaint_reject") {
    const complaintId = String(body.id ?? "");
    const resolutionNote = String(body.resolutionNote ?? "").trim();
    if (!complaintId) {
      return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
    }
    if (!resolutionNote) {
      return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
    }

    const newStatus = body.action === "complaint_resolve" ? "resolved" : "rejected";
    await db
      .prepare(
        `UPDATE lawyer_service_complaints
         SET status = ?, resolution_note_bn = ?, resolved_at = datetime('now'), assigned_to_user_id = ?
         WHERE id = ? AND status IN ('open', 'in_review')`,
      )
      .bind(newStatus, resolutionNote, user.id, complaintId)
      .run();

    await writeAudit(db, {
      kind: AUDIT_KINDS.complaint_resolved,
      actorId: user.id,
      actorRole: user.role,
      refId: complaintId,
      detail: body.action === "complaint_resolve" ? "অভিযোগ সমাধান করা হয়েছে" : "অভিযোগ প্রত্যাখ্যান করা হয়েছে",
      reason: resolutionNote,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "complaint_escalate") {
    const complaintId = String(body.id ?? "");
    if (!complaintId) {
      return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
    }

    // Get complaint details for misconduct case
    const complaint = await db
      .prepare(
        `SELECT lsc.*, pl.name_bn AS lawyer_name, c.docket_id AS case_ref
         FROM lawyer_service_complaints lsc
         LEFT JOIN panel_lawyers pl ON pl.id = lsc.panel_lawyer_id
         LEFT JOIN cases c ON c.id = lsc.case_id
         WHERE lsc.id = ?`,
      )
      .bind(complaintId)
      .first<Record<string, unknown>>();

    if (!complaint) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    // Create misconduct case
    const misconductId = `MC-${crypto.randomUUID()}`;
    await db
      .prepare(
        `INSERT INTO misconduct_cases (id, panel_lawyer_id, complainant_id, source, allegation, verdict)
         VALUES (?, ?, ?, 'service_complaint', ?, 'open')`,
      )
      .bind(
        misconductId,
        complaint.panel_lawyer_id,
        complaint.citizen_user_id,
        `অভিযোগ থেকে উত্থাপিত: ${complaint.reason_code} - ${complaint.details_bn || "বিস্তারিত নেই"}`,
      )
      .run();

    // Update complaint status
    await db
      .prepare(
        `UPDATE lawyer_service_complaints
         SET status = 'resolved', resolution_note_bn = 'কমিটিতে প্রেরণ করা হয়েছে', resolved_at = datetime('now'), assigned_to_user_id = ?
         WHERE id = ?`,
      )
      .bind(user.id, complaintId)
      .run();

    await writeAudit(db, {
      kind: AUDIT_KINDS.complaint_resolved,
      actorId: user.id,
      actorRole: user.role,
      refId: complaintId,
      detail: `অভিযোগ কমিটিতে প্রেরণ করা হয়েছে - অসদাচরণ মামলা: ${misconductId}`,
    });
    return NextResponse.json({ ok: true, misconductId });
  }

  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
