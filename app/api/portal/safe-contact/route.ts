import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import type { SessionUser } from "@/lib/auth/roles";
import { writeAudit } from "@/lib/audit/log";
import {
  readWindow,
  windowStatus,
  bdDateTimeString,
  bdDayTimeBn,
  type SafeWindowRow,
} from "@/lib/case/safe-window";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Safe-contact window + the DLAO's reminder.
 *
 * The brief's failure test for A1 is "an unsafe person answers the phone", so the rule
 * has to be enforceable rather than advisory. This route reports whether the window is
 * open right now, and — crucially — schedules the officer's next contact into
 * `message_outbox` with `rule='window'` and `deferred_until` set to the next opening.
 *
 * `message_outbox` is the right home for that and not a new reminders table, because it
 * already models the three rules this system enforces on a survivor's contact: `allow`,
 * `window` and `block`. A reminder is just an outbound message held until the window
 * opens. The row's `to_bn` is deliberately NULL and the channel is `portal`: the reminder
 * is a task for the OFFICER, and this code path must never be the thing that writes the
 * survivor's number into an outbound queue.
 */

function getToken(request: Request): string | undefined {
  return request.headers
    .get("cookie")
    ?.split("; ")
    .find((row) => row.startsWith("auth_session="))
    ?.split("=")[1];
}

function getDatabase(): D1Database | null {
  try {
    return (getCloudflareContext() as unknown as { env?: { DB?: D1Database } }).env?.DB ?? null;
  } catch {
    return null;
  }
}

async function getRequestUser(request: Request, db: D1Database | null): Promise<SessionUser | null> {
  const token = getToken(request);
  return (await getD1SessionUser(db, token)) || getLocalSessionUser(token);
}

function isStaff(role: string): boolean {
  return [
    "dlao", "dlao_officer", "chief", "chief_legal_aid_officer",
    "metropolitan_legal_aid_officer", "paralegal", "mediator", "special_mediator",
  ].includes(role);
}

async function loadWindow(db: D1Database, caseId: string) {
  const profile = await db
    .prepare(
      `SELECT ref, risk_high, neutral_only, safe_window_bn, window_start, window_end, window_days
         FROM safe_profiles WHERE ref = ?`,
    )
    .bind(caseId)
    .first<SafeWindowRow>();
  const window = readWindow(profile);
  return { profile, window };
}

export async function GET(request: Request) {
  try {
    const db = getDatabase();
    const user = await getRequestUser(request, db);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    const url = new URL(request.url);
    const caseId = url.searchParams.get("caseId")?.trim();
    if (!caseId) return NextResponse.json({ ok: false, error: "caseId required" }, { status: 400 });

    const { window } = await loadWindow(db, caseId);
    if (!window) {
      return NextResponse.json({
        ok: true,
        hasWindow: false,
        // No window is not the same as an open window. Saying so plainly stops a screen
        // from implying a survivor is freely reachable when nothing has been recorded.
        message: "এই কেসের জন্য নিরাপদ সময় নির্ধারণ করা হয়নি। যোগাযোগের আগে কর্মকর্তাকে সতর্ক করা উচিত।",
      });
    }

    const status = windowStatus(window);
    const pending = await db
      .prepare(
        `SELECT id, body, rule, deferred_until, sent, why_bn, at
           FROM message_outbox
          WHERE case_id = ? AND rule = 'window' AND sent = 0
          ORDER BY at DESC`,
      )
      .bind(caseId)
      .all<{ id: string; body: string | null; rule: string; deferred_until: string | null; sent: number; why_bn: string | null; at: string }>();

    const blocked = await db
      .prepare(
        `SELECT channel, kind_bn, to_bn, rule, why_bn
           FROM safe_contact_destinations WHERE ref = ? AND rule = 'block'`,
      )
      .bind(caseId)
      .all<{ channel: string; kind_bn: string | null; to_bn: string | null; rule: string; why_bn: string }>();

    return NextResponse.json({
      ok: true,
      hasWindow: true,
      window: {
        start: status.window.start,
        end: status.window.end,
        days: status.window.days,
        labelBn: status.window.labelBn,
        durationMinutes: (status.minutesRemaining ?? 0) || undefined,
      },
      open: status.open,
      minutesRemaining: status.minutesRemaining,
      minutesUntilOpen: status.minutesUntilOpen,
      nextOpenAt: status.nextOpenAt.toISOString(),
      nextOpenAtBn: `${bdDayTimeBn(status.nextOpenAt)} (নিরাপদ সময় শুরু)`,
      blockReasonBn: status.blockReasonBn,
      reminders: pending.results ?? [],
      blockedDestinations: blocked.results ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getDatabase();
    const user = await getRequestUser(request, db);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!isStaff(user.role)) {
      return NextResponse.json(
        { ok: false, error: "শুধুমাত্র কর্মকর্তা নিরাপদ সময়ের অনুস্মারক নির্ধারণ করতে পারবেন।" },
        { status: 403 },
      );
    }
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    const body = (await request.json().catch(() => ({}))) as { caseId?: string };
    const caseId = String(body.caseId || "").trim();
    if (!caseId) return NextResponse.json({ ok: false, error: "caseId required" }, { status: 400 });

    const { window } = await loadWindow(db, caseId);
    if (!window) {
      return NextResponse.json(
        { ok: false, error: "এই কেসের নিরাপদ সময় নির্ধারণ করা নেই, তাই অনুস্মারকও নির্ধারণ করা যায়নি।" },
        { status: 409 },
      );
    }

    const status = windowStatus(window);
    const deferredUntil = bdDateTimeString(status.nextOpenAt);
    const reminderId = `REM-${crypto.randomUUID()}`;

    await db
      .prepare(
        `INSERT INTO message_outbox
           (id, ref, case_id, channel, to_bn, body, rule, sent, deferred_until, why_bn, sent_by)
         VALUES (?, ?, ?, 'portal', NULL, ?, 'window', 0, ?, ?, ?)`,
      )
      .bind(
        reminderId,
        caseId,
        caseId,
        `নিরাপদ সময়ে যোগাযোগ করুন — ${status.window.labelBn}`,
        deferredUntil,
        "স্বামীর নম্বরে বা নিরাপদ সময়ের বাইরে কোনো বার্তা পাঠানো হবে না।",
        user.displayName,
      )
      .run();

    await writeAudit(db, {
      kind: "message.queued",
      refId: caseId,
      actorId: user.id,
      actorRole: user.role,
      detail: `নিরাপদ সময়ে যোগাযোগের অনুস্মারক নির্ধারিত — ${deferredUntil}`,
      reason: "Zero-outbound window enforced",
    });

    return NextResponse.json({
      ok: true,
      reminder: { id: reminderId, deferredUntil, labelBn: status.window.labelBn },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
