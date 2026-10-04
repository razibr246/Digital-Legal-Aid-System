import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import type { D1Database } from "@/lib/auth/d1-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same normalisation the Worker uses when a PIN is stored. */
function normalizePin(input: unknown): string | null {
  const raw = String(input ?? "")
    .replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit)))
    .trim();
  return /^\d{4}$/.test(raw) ? raw : null;
}

async function hashPin(pin: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const FILED_STATUSES = ["filed", "enrolled", "in_progress", "assigned", "hearing_scheduled"];

// users.role_key carries the real role because users.role's CHECK cannot be
// widened in D1 (migration 0015); session resolution prefers it and falls back
// to role. This lookup must use the same precedence or a citizen whose
// role_key is set would silently become untrackable.

/**
 * Case tracking by voice PIN.
 *
 * Answers one question: has this person's matter been filed as a case, or is it
 * still sitting as an application? "Filed" means the matter has been enrolled
 * and a panel advocate assigned; a freshly captured voice intake is an
 * application awaiting that step.
 *
 * The response deliberately carries no name, phone, address or problem
 * statement. A PIN spoken aloud is weak authentication, so this returns the
 * minimum needed to answer the caller's question.
 */
export async function POST(request: Request) {
  const ctx = getCloudflareContext() as unknown as { env?: { DB?: D1Database } };
  const db = ctx.env?.DB;
  if (!db) return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });

  let body: { pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const pin = normalizePin(body.pin);
  if (!pin) {
    return NextResponse.json({ ok: false, error: "A four-digit PIN is required" }, { status: 400 });
  }

  const pinHash = await hashPin(pin);

  const row = await db
    .prepare(
      `SELECT c.docket_id, c.status, c.assigned_lawyer_id, c.district, c.created_at,
              (SELECT COUNT(*) FROM case_updates u WHERE u.case_id = c.id) AS update_count
       FROM users u
       JOIN cases c ON c.citizen_user_id = u.id
       WHERE COALESCE(u.role_key, u.role) = 'citizen' AND u.pin_hash = ?
       ORDER BY c.created_at DESC
       LIMIT 1`,
    )
    .bind(pinHash)
    .first();

  if (!row) {
    // Same shape as a wrong PIN elsewhere in the flow: never confirm that a
    // given PIN exists.
    return NextResponse.json({ ok: true, found: false, state: null, docketId: null });
  }

  const enrolled =
    Boolean(row.assigned_lawyer_id) ||
    FILED_STATUSES.includes(String(row.status || "").toLowerCase());

  return NextResponse.json({
    ok: true,
    found: true,
    // "filed" -> enrolled as a case; "application" -> captured, not yet enrolled.
    state: enrolled ? "filed" : "application",
    docketId: row.docket_id ?? null,
    district: row.district ?? null,
    filedAt: enrolled ? (row.created_at ?? null) : null,
  });
}
