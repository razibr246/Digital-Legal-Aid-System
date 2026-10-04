import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import type { SessionUser } from "@/lib/auth/roles";

export const runtime = "nodejs";

function getToken(request: Request): string | undefined {
  return request.headers.get("cookie")?.split("; ").find((row) => row.startsWith("auth_session="))?.split("=")[1];
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDatabase();
    const user = await getRequestUser(request, db);
    if (!user || user.role === "citizen") return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    const { id } = await params;
    const body = (await request.json()) as {
      decision?: "approved" | "rejected";
      correctedBangla?: string;
      correctedIntent?: string;
    };
    if (body.decision !== "approved" && body.decision !== "rejected") {
      return NextResponse.json({ ok: false, error: "A valid review decision is required" }, { status: 400 });
    }

    const caseRow = await db
      .prepare(
        `SELECT c.citizen_user_id, a.source_language, a.semantic_normalized_bangla
         FROM cases c LEFT JOIN applications a ON a.case_id = c.id
         WHERE c.id = ? LIMIT 1`,
      )
      .bind(id)
      .first<{ citizen_user_id: string; source_language: string | null; semantic_normalized_bangla: string | null }>();
    if (!caseRow) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    const event = await db
      .prepare("SELECT id FROM semantic_bridge_events WHERE case_id = ? ORDER BY created_at DESC LIMIT 1")
      .bind(id)
      .first<{ id: string }>();

    await db
      .prepare(
        `INSERT INTO indigenous_lexicon_reviews
          (id, source_language, event_id, original_interpretation, corrected_bangla, corrected_intent, status, reviewed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `REVIEW-${crypto.randomUUID()}`,
        caseRow.source_language || "bn",
         event?.id || null,
         caseRow.semantic_normalized_bangla || "",
         String(body.correctedBangla || ""),
        String(body.correctedIntent || ""),
        body.decision,
        user.id,
      )
      .run();

    return NextResponse.json({ ok: true, decision: body.decision });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
