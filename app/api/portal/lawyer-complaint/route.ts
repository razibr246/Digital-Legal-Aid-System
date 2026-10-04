/**
 * An applicant reporting that their appointed panel lawyer is not doing their job.
 *
 * Writes to `lawyer_service_complaints`, not `misconduct_cases`: misconduct is a
 * committee finding with a verdict and a bar-council referral, written by the Chief
 * or the Chairman. A service complaint is the applicant's account of their own
 * experience, and it is recorded as such — the complaint is not evidence of misconduct
 * and must not be presented as though it were.
 */

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import { writeAudit, AUDIT_KINDS } from "@/lib/audit/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS = [
  "not_contacted",
  "too_slow",
  "not_listening",
  "unprofessional",
  "demanded_money",
  "refused_after_assignment",
  "other",
] as const;
type ReasonCode = (typeof REASONS)[number];

const REASON_BN: Record<ReasonCode, string> = {
  not_contacted: "আইনজীবী যোগাযোগ করেননি",
  too_slow: "অনেক দেরিতে কাজ হচ্ছে",
  not_listening: "আমার কথা ভালোভাবে শোনেন না",
  unprofessional: "আচরণ পেশাদার নয়",
  demanded_money: "অর্থ চেয়েছেন",
  refused_after_assignment: "নিয়োগের পর কাজ করতে অস্বীকার করেছেন",
  other: "অন্য কোনো কারণ",
};

function getDatabase(): D1Database | null {
  try {
    return (getCloudflareContext() as unknown as { env?: { DB?: D1Database } }).env?.DB ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const db = getDatabase();
    if (!db) return NextResponse.json({ ok: false, error: "ডেটাবেস সাময়িকভাবে উপল্লব্ধ নয়।" }, { status: 503 });
    const token = request.headers
      .get("cookie")
      ?.split("; ")
      .find((row) => row.startsWith("auth_session="))
      ?.split("=")[1];
    const user = (await getD1SessionUser(db, token)) || getLocalSessionUser(token);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      assignmentId?: string;
      reasonCode?: string;
      detailsBn?: string;
    };
    const reasonCode = body.reasonCode as ReasonCode;
    if (!body.assignmentId || !reasonCode || !REASONS.includes(reasonCode)) {
      return NextResponse.json({ ok: false, error: "অনুগ্রহ করে কারণ নির্বাচন করুন।" }, { status: 400 });
    }
    const detailsBn = String(body.detailsBn ?? "").trim().slice(0, 2000);

    // The assignment must belong to this applicant. Checked against the database
    // rather than trusted from the request, so an id cannot be swapped to frame a
    // different lawyer.
    const assignment = await db
      .prepare(
        `SELECT p.id, p.case_id, p.panel_lawyer_id, p.lawyer_name_bn, p.district
         FROM panel_assignments p
         WHERE p.id = ? AND p.citizen_user_id = ? AND p.status = 'active'`,
      )
      .bind(body.assignmentId, user.id)
      .first<{ id: string; case_id: string | null; panel_lawyer_id: string | null; lawyer_name_bn: string | null; district: string | null }>();
    if (!assignment) {
      return NextResponse.json({ ok: false, error: "নিয়োগপত্র পাওয়া যায়নি।" }, { status: 404 });
    }

    const id = `LSC-${crypto.randomUUID()}`;
    try {
      await db
        .prepare(
          `INSERT INTO lawyer_service_complaints
            (id, case_id, assignment_id, panel_lawyer_id, citizen_user_id, reason_code, details_bn, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
        )
        .bind(
          id,
          assignment.case_id,
          assignment.id,
          assignment.panel_lawyer_id,
          user.id,
          reasonCode,
          detailsBn || null,
        )
        .run();
    } catch (err) {
      // The unique index makes one complaint per appointment per reason; a second
      // click is a no-op rather than a duplicate in the DLAO's queue.
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("UNIQUE") || message.includes("constraint")) {
        return NextResponse.json(
          { ok: false, error: "এই কারণে আপনার অভিযোগটি ইতিমধ্যে জমা হয়েছে।", duplicate: true },
          { status: 409 },
        );
      }
      throw err;
    }

    // Queue an internal notice for the district office. `rep` is the officer channel,
    // never the applicant's own phone — an applicant must not be told the office has
    // been notified in a way that could reach the wrong handset.
    const officer = await db
      .prepare(`SELECT id FROM users WHERE role_key = 'dlao' OR role = 'dlao_officer' ORDER BY id LIMIT 1`)
      .first<{ id: string }>();
    await db
      .prepare(
        `INSERT INTO message_outbox (id, ref, case_id, channel, to_bn, body, rule, sent, why_bn, sent_by)
         VALUES (?, ?, ?, 'rep', ?, ?, 'allow', 0, ?, ?)`,
      )
      .bind(
        `MO-${crypto.randomUUID()}`,
        assignment.case_id,
        assignment.case_id,
        officer?.id ?? null,
        `প্যানেল আইনজীবী সংক্রান্ত অভিযোগ: ${REASON_BN[reasonCode]} (${assignment.lawyer_name_bn ?? "আইনজীবী"})`,
        "আবেদনকারীর অভিযোগ — জেলা কার্যালয়ে পর্যালোচনা প্রয়োজন।",
        user.id,
      )
      .run();

    await writeAudit(db, {
      kind: AUDIT_KINDS.complaint_filed,
      refId: assignment.case_id,
      actorId: user.id,
      actorRole: "citizen",
      detail: `${assignment.lawyer_name_bn ?? "আইনজীবী"} সংক্রান্ত অভিযোগ: ${REASON_BN[reasonCode]}`,
      reason: detailsBn || null,
    });

    return NextResponse.json({ ok: true, complaintId: id, reasonBn: REASON_BN[reasonCode] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
