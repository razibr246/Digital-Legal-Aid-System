import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import { mapPortalCase, type PortalCaseRow } from "@/lib/data/case-projection";
import type { SessionUser } from "@/lib/auth/roles";

export const runtime = "nodejs";

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
  const d1User = await getD1SessionUser(db, token);
  return d1User || getLocalSessionUser(token);
}

const CASE_SELECT = `
  SELECT c.id, c.docket_id, c.citizen_user_id, c.voice_session_id, c.problem,
         c.has_disability, c.disability_type, c.gender, c.district, c.thana,
         c.category, c.status, c.assigned_lawyer_id, c.dlao_notes, c.created_at, c.updated_at,
         pl.name_bn AS lawyer_name,
         a.id AS application_id, a.application_time, a.applicant_name, a.primary_contact_number,
         a.address, a.problem_statement, a.source_language, a.original_transcript,
         a.semantic_matched, a.semantic_confidence, a.semantic_intent, a.semantic_normalized_bangla,
         a.intake_summary, a.urgency, a.priority, a.severity_level, a.severity_category,
         a.severity_factors_json,
         cr.id AS recording_id, cr.voice_session_id AS recording_voice_session_id,
         cr.content_type AS recording_content_type, cr.duration_ms AS recording_duration_ms,
         cr.created_at AS recording_created_at
  FROM cases c
  LEFT JOIN panel_assignments pa ON pa.case_id = c.id AND pa.status = 'active'
  LEFT JOIN panel_lawyers pl ON pl.id = pa.panel_lawyer_id
  LEFT JOIN applications a ON a.case_id = c.id
  LEFT JOIN call_recordings cr ON cr.id = (
    SELECT cr2.id FROM call_recordings cr2
    WHERE cr2.docket_id = c.docket_id
    ORDER BY cr2.created_at DESC LIMIT 1
  )
`;

async function getCase(db: D1Database, id: string): Promise<PortalCaseRow | null> {
  return db.prepare(`${CASE_SELECT} WHERE c.id = ? LIMIT 1`).bind(id).first<PortalCaseRow>();
}

function canAccessCase(user: SessionUser, caseData: PortalCaseRow): boolean {
  if (user.role === "citizen") return caseData.citizen_user_id === user.id;
  if (user.role === "panel_lawyer") return caseData.assigned_lawyer_id === user.id;
  return true;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDatabase();
    const user = await getRequestUser(request, db);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    const { id } = await params;
    const caseData = await getCase(db, id);
    if (!caseData) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (!canAccessCase(user, caseData)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    return NextResponse.json({ ok: true, case: mapPortalCase(caseData) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDatabase();
    const user = await getRequestUser(request, db);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.role === "citizen") return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    const { id } = await params;
    const current = await getCase(db, id);
    if (!current) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (user.role === "panel_lawyer" && current.assigned_lawyer_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.status) {
      const status = body.status === "submitted" ? "pending_review" : String(body.status);
      updates.push("status = ?");
      values.push(status);
    }
    if (body.assignedLawyerId !== undefined) {
      updates.push("assigned_lawyer_id = ?");
      values.push(body.assignedLawyerId || null);
    }
    if (body.dlaoNotes !== undefined) {
      updates.push("dlao_notes = ?");
      values.push(String(body.dlaoNotes));
    }

    if (updates.length === 0) return NextResponse.json({ ok: true, message: "No changes" });

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);
    await db.prepare(`UPDATE cases SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();

    const caseData = await getCase(db, id);
    if (!caseData) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, case: mapPortalCase(caseData) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
