/**
 * Advice records: the written record of a general inquiry taken on the 16699 line.
 *
 * Two audiences, one file, because they must agree about what a record *is*:
 *   - POST, unauthenticated, from the softphone. A caller who only wanted information has
 *     no account and never will, so this cannot require a session.
 *   - GET, staff only. The transcript is what the citizen was told, which makes it
 *     personal data; it is not readable by anyone with a browser.
 *
 * The write is an upsert on `voice_session_id`. The client posts as the call progresses so
 * that a caller who closes the tab mid-answer still leaves a record, and an upsert is what
 * makes that safe -- without it one call would become six rows.
 */

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import { writeAudit, AUDIT_KINDS } from "@/lib/audit/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getDb(): D1Database | null {
  try {
    return (getCloudflareContext() as unknown as { env?: { DB?: D1Database } }).env?.DB ?? null;
  } catch {
    return null;
  }
}

/** Staff-only. A visitor or citizen must never read the advice transcript log. */
function isStaff(role: string | null | undefined): boolean {
  if (!role) return false;
  const r = String(role);
  return (
    r === "dlao" ||
    r === "chief" ||
    r === "cdlao" ||
    r === "chairman" ||
    r === "admin" ||
    r === "national" ||
    r === "judge" ||
    r === "metropolitan_legal_aid_officer"
  );
}

type Turn = { role: string; content: string };

type AdviceBody = {
  voiceSessionId?: string;
  callerPhone?: string | null;
  phoneIsSimulated?: boolean;
  language?: string | null;
  startedAt?: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  transcript?: Turn[];
  advice?: string | null;
  topics?: string[] | null;
  category?: string;
  escalated?: boolean;
  isDemo?: boolean;
};

const MAX_TURNS = 200;
/** A whole call's advice transcript, bounded. An unbounded body is a free-text hole. */
const MAX_BODY_CHARS = 20_000;

function sanitiseTurns(input: unknown): Turn[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, MAX_TURNS)
    .map((t) => {
      const row = t as Partial<Turn>;
      return {
        role: row.role === "assistant" ? "assistant" : "user",
        content: String(row.content ?? "").slice(0, 2000),
      };
    })
    .filter((t) => t.content.trim().length > 0);
}

export async function POST(request: Request) {
  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, error: "no_database" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as AdviceBody;

  // Idempotency key. Without it a retried POST duplicates the record instead of updating
  // it, and the DLAO sees the same call three times.
  const sessionId = String(body.voiceSessionId ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "voice_session_id_required" }, { status: 400 });
  }

  const turns = sanitiseTurns(body.transcript);
  const transcript = JSON.stringify(turns).slice(0, MAX_BODY_CHARS);
  const advice = String(body.advice ?? "").slice(0, 2000) || null;
  const topics = Array.isArray(body.topics)
    ? body.topics.map((t) => String(t).slice(0, 60)).slice(0, 12).join(", ")
    : null;

  const startedAt = String(body.startedAt ?? new Date().toISOString());
  const endedAt = body.endedAt ? String(body.endedAt) : null;
  const duration = Number.isFinite(Number(body.durationSeconds))
    ? Math.max(0, Math.round(Number(body.durationSeconds)))
    : null;

  const existing = await db
    .prepare("SELECT id, ref FROM advice_records WHERE voice_session_id = ?")
    .bind(sessionId)
    .first<{ id: string; ref: string | null }>();

  if (existing) {
    // Update, and never move `started_at` backwards on a later post: the call start is a
    // fact, and a late-arriving turn must not restate it.
    await db
      .prepare(
        `UPDATE advice_records
            SET ended_at = COALESCE(?, ended_at),
                duration_seconds = COALESCE(?, duration_seconds),
                turn_count = ?,
                transcript = ?,
                advice = COALESCE(?, advice),
                topics = COALESCE(?, topics),
                language = COALESCE(?, language),
                caller_phone = COALESCE(?, caller_phone),
                escalated = MAX(escalated, ?),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      )
      .bind(
        endedAt,
        duration,
        turns.length,
        transcript,
        advice,
        topics,
        body.language ? String(body.language) : null,
        body.callerPhone ? String(body.callerPhone) : null,
        body.escalated ? 1 : 0,
        existing.id,
      )
      .run();
    return NextResponse.json({ ok: true, id: existing.id, ref: existing.ref, updated: true });
  }

  // A readable reference for the officer, allocated from the row count so it is stable and
  // needs no sequence table.
  const id = `adv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const year = new Date(startedAt).getFullYear();
  const ref = `ADV-${year}-${id.slice(-5).toUpperCase()}`;

  try {
    await db
      .prepare(
        `INSERT INTO advice_records
           (id, ref, voice_session_id, caller_phone, phone_is_simulated, language,
            started_at, ended_at, duration_seconds, turn_count, transcript, advice, topics,
            category, escalated, status, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
      )
        .bind(
        id,
        ref,
        sessionId,
        body.callerPhone ? String(body.callerPhone) : null,
        body.phoneIsSimulated === false ? 0 : 1,
        body.language ? String(body.language) : null,
        startedAt,
        endedAt,
        duration,
        turns.length,
        transcript,
        advice,
        topics,
        body.category === "severity" ? "severity" : "general",
        body.escalated ? 1 : 0,
        body.isDemo ? 1 : 0,
      )
      .run();
  } catch {
    /*
     * Two POSTs for a brand-new session can both read "no existing row" and both try to
     * insert. The partial unique index on `voice_session_id` stops the second one from
     * creating a duplicate -- which is the important part -- but it arrives here as a
     * thrown constraint error. Re-reading and updating turns that race into the ordinary
     * upsert path instead of a 500 the caller cannot act on.
     *
     * `ON CONFLICT(voice_session_id)` cannot be used here: the index is partial
     * (`WHERE voice_session_id IS NOT NULL`) and SQLite requires the conflict target to
     * match a partial index's WHERE clause, not just its columns.
     */
    const raced = await db
      .prepare("SELECT id, ref FROM advice_records WHERE voice_session_id = ?")
      .bind(sessionId)
      .first<{ id: string; ref: string | null }>();
    if (!raced) {
      return NextResponse.json({ ok: false, error: "advice_record_write_failed" }, { status: 500 });
    }
    await db
      .prepare(
        `UPDATE advice_records
            SET ended_at = COALESCE(?, ended_at),
                duration_seconds = COALESCE(?, duration_seconds),
                turn_count = ?,
                transcript = ?,
                advice = COALESCE(?, advice),
                escalated = MAX(escalated, ?),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      )
      .bind(endedAt, duration, turns.length, transcript, advice, body.escalated ? 1 : 0, raced.id)
      .run();
    return NextResponse.json({ ok: true, id: raced.id, ref: raced.ref, updated: true });
  }

  return NextResponse.json({ ok: true, id, ref, updated: false }, { status: 201 });
}

export async function GET(request: Request) {
  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, error: "no_database" }, { status: 503 });

  const token = request.headers
    .get("cookie")
    ?.split("; ")
    .find((row) => row.startsWith("auth_session="))
    ?.split("=")[1];
  const user = (await getD1SessionUser(db, token)) || getLocalSessionUser(token);

  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isStaff(user.role)) {
    await writeAudit(db, {
      kind: AUDIT_KINDS.session_denied,
      actorId: user.id,
      actorRole: user.role,
      detail: "পরামর্শ রেকর্ড দেখার চেষ্টা কর্মকর্তা হিসেবে নয়",
      reason: "not_staff",
      refId: new URL(request.url).pathname,
    });
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));

  const where: string[] = [];
  const binds: unknown[] = [];
  if (status && ["new", "reviewed", "closed"].includes(status)) {
    where.push("status = ?");
    binds.push(status);
  }
  const search = url.searchParams.get("q");
  if (search) {
    where.push("(caller_phone LIKE ? OR ref LIKE ? OR advice LIKE ? OR topics LIKE ?)");
    const like = `%${search.slice(0, 40)}%`;
    binds.push(like, like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await db
    .prepare(
      `SELECT id, ref, caller_phone, phone_is_simulated, language, started_at, ended_at,
              duration_seconds, turn_count, transcript, advice, topics, category,
              escalated, status, dlao_notes
         FROM advice_records ${clause}
        ORDER BY started_at DESC
        LIMIT ?`,
    )
    .bind(...binds, limit)
    .all<Record<string, unknown>>();

  const counts = await db
    .prepare(
      `SELECT status, COUNT(*) AS n FROM advice_records GROUP BY status`,
    )
    .all<{ status: string; n: number }>();

  const summary = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(duration_seconds), 0) AS total_seconds,
              COALESCE(AVG(duration_seconds), 0) AS avg_seconds
         FROM advice_records`,
    )
    .first<{ total: number; total_seconds: number; avg_seconds: number }>();

  const byStatus: Record<string, number> = {};
  for (const c of counts.results ?? []) byStatus[c.status] = c.n;

  return NextResponse.json({
    ok: true,
    records: (rows.results ?? []).map((r) => ({
      ...r,
      escalated: !!r.escalated,
      phoneIsSimulated: !!r.phoneIs_simulated,
      transcript: safeParse(r.transcript),
    })),
    counts: byStatus,
    summary: {
      total: summary?.total ?? 0,
      totalSeconds: summary?.total_seconds ?? 0,
      avgSeconds: Math.round(summary?.avg_seconds ?? 0),
    },
  });
}

function safeParse(value: unknown): Turn[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A truncated transcript must not take the list down with it.
    return [];
  }
}
