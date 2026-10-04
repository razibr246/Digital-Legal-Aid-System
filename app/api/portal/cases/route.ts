import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import { mapPortalCase, type PortalCaseRow } from "@/lib/data/case-projection";
import { isSensitiveClassification } from "@/lib/agent/knowledge/severity-classification";
import { canSeeSensitiveCases } from "@/lib/auth/screen-guard";
import type { SessionUser } from "@/lib/auth/roles";

export const runtime = "nodejs";

/** Reuses the classifier's own definition so the filter and the screen agree. */
function isSensitiveRow(row: PortalCaseRow): boolean {
  return isSensitiveClassification({
    severity: (row.severity_level ?? "standard") as never,
    category: row.severity_category ?? "",
  });
}

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

export async function GET(request: Request) {
  try {
    const db = getDatabase();
    const user = await getRequestUser(request, db);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    const baseQuery = `
      SELECT c.id, c.docket_id, c.citizen_user_id, c.voice_session_id, c.problem,
             c.has_disability, c.disability_type, c.gender, c.district, c.thana,
             c.category, c.status, c.assigned_lawyer_id, c.dlao_notes, c.created_at, c.updated_at,
             a.id AS application_id, a.application_time, a.applicant_name, a.primary_contact_number,
             a.address, a.problem_statement, a.source_language, a.original_transcript,
             a.semantic_matched, a.semantic_confidence, a.semantic_intent, a.semantic_normalized_bangla,
             a.intake_summary, a.urgency, a.priority, a.severity_level, a.severity_category,
             a.severity_factors_json,
             cr.id AS recording_id, cr.voice_session_id AS recording_voice_session_id,
             cr.content_type AS recording_content_type, cr.duration_ms AS recording_duration_ms,
             cr.created_at AS recording_created_at
      FROM cases c
      LEFT JOIN applications a ON a.case_id = c.id
      LEFT JOIN call_recordings cr ON cr.id = (
        SELECT cr2.id FROM call_recordings cr2
        WHERE cr2.docket_id = c.docket_id
        ORDER BY cr2.created_at DESC LIMIT 1
      )
    `;

    let results: PortalCaseRow[] = [];
    if (user.role === "citizen") {
      results = (await db.prepare(`${baseQuery} WHERE c.citizen_user_id = ? ORDER BY c.created_at DESC`).bind(user.id).all<PortalCaseRow>()).results;
    } else if (user.role === "panel_lawyer") {
      // Via panel_assignments, not cases.assigned_lawyer_id. That column is a foreign
      // key to the older users-based panel accounts, while the roster is
      // panel_lawyers, so a lawyer appointed through the roster or through a DLAO's
      // manual assignment would never have appeared in their own list.
      results = (
        await db
          .prepare(
            // Resolved by the account link, with the name only as a fallback for a
            // roster entry nobody has claimed yet. A name is not a key: a mock lawyer's
            // display name matches nothing, and two lawyers sharing a name would see
            // each other's confidential cases.
            `${baseQuery} WHERE c.id IN (
              SELECT case_id FROM panel_assignments
               WHERE status = 'active'
                 AND panel_lawyer_id = COALESCE(
                   (SELECT id FROM panel_lawyers WHERE user_id = ? LIMIT 1),
                   (SELECT id FROM panel_lawyers WHERE name_bn = ? LIMIT 1)
                 )
            ) ORDER BY c.created_at DESC`,
          )
          .bind(user.id, user.displayName)
          .all<PortalCaseRow>()
      ).results;
    } else {
      results = (await db.prepare(`${baseQuery} ORDER BY c.created_at DESC`).all<PortalCaseRow>()).results;
    }

    // A case screened as emergency/sensitive (Category A of the severity spec) is
    // restricted to the DLAO and the Chief DLAO.
    //
    // The applicant's own list is exempt. This was previously applied unconditionally,
    // which hid a woman's own emergency case from her and made the dashboard claim
    // she had no case at all. Restricting a sensitive case means restricting who *else*
    // can see it — never the person it is about.
    const isOwnCaseList = user.role === "citizen";
    const visible = isOwnCaseList || canSeeSensitiveCases(user.role)
      ? results
      : results.filter((row) => !isSensitiveRow(row));

    return NextResponse.json({ ok: true, cases: visible.map(mapPortalCase) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getDatabase();
    const user = await getRequestUser(request, db);
    if (!user || user.role !== "citizen") return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    const body = await request.json();
    const problemStatement = String(body.problem || body.summary || "").trim();
    if (!problemStatement) return NextResponse.json({ ok: false, error: "Problem statement is required" }, { status: 400 });

    const caseId = `CASE-${crypto.randomUUID()}`;
    const docketId = String(body.docketId || `DLAS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    const applicationId = String(body.applicationId || docketId.replace(/^DLAS-/, "APP-"));
    const voiceSessionId = String(body.voiceSessionId || `voice-${Date.now()}`);
    const hasDisability = body.hasDisability === true || body.hasDisability === 1 ? 1 : 0;
    const address = String(body.address || body.thana || "").trim() || null;
    const primaryContactNumber = body.phone ? String(body.phone) : null;
    const disabilityType = body.disabilityType ? String(body.disabilityType) : null;
    const gender = body.gender ? String(body.gender) : null;

    await db.batch([
      db
        .prepare(
          `INSERT INTO cases
            (id, docket_id, citizen_user_id, voice_session_id, problem, has_disability, disability_type, gender, district, thana, category, status, is_demo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 0)`,
        )
        .bind(
          caseId,
          docketId,
          user.id,
          voiceSessionId,
          problemStatement,
          hasDisability,
          disabilityType,
          gender,
          body.district ? String(body.district) : null,
          address,
          body.category ? String(body.category) : null,
        ),
      db
        .prepare(
          `INSERT INTO applications
             (id, applicant_user_id, applicant_name, primary_contact_number, has_disability,
              disability_type, gender, address, problem_statement, case_id, source, source_voice_session_id,
               source_language, original_transcript, semantic_matched, semantic_confidence,
               semantic_intent, semantic_normalized_bangla, intake_summary, urgency, priority,
               severity_level, severity_category, severity_factors_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'portal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          applicationId,
          user.id,
          String(body.applicantName || body.displayName || "Not provided"),
          primaryContactNumber,
          hasDisability,
          disabilityType,
          gender,
          address,
          problemStatement,
          caseId,
          voiceSessionId,
          body.indigenousLanguage === "marma" || body.indigenousLanguage === "chakma" ? body.indigenousLanguage : "bn",
          body.originalTranscript ? String(body.originalTranscript) : problemStatement,
          body.semanticMatched === true || body.semanticMatched === 1 ? 1 : 0,
          Number.isFinite(Number(body.semanticConfidence)) ? Number(body.semanticConfidence) : null,
          body.semanticIntent ? String(body.semanticIntent) : null,
           body.semanticNormalizedBangla ? String(body.semanticNormalizedBangla) : null,
           body.intakeSummary ? String(body.intakeSummary) : problemStatement,
           body.urgency === "emergency_danger" || body.urgency === "urgent" ? String(body.urgency) : "normal",
           body.priority === "high" || body.priority === "urgent" ? String(body.priority) : "normal",
           body.severityLevel ? String(body.severityLevel) : null,
           body.severityCategory ? String(body.severityCategory) : null,
           body.severityFactors ? JSON.stringify(body.severityFactors) : null,
         ),
    ]);

    const row = await db
      .prepare(
        `SELECT c.id, c.docket_id, c.citizen_user_id, c.voice_session_id, c.problem,
                c.has_disability, c.disability_type, c.gender, c.district, c.thana,
                c.category, c.status, c.assigned_lawyer_id, c.dlao_notes, c.created_at, c.updated_at,
                a.id AS application_id, a.application_time, a.applicant_name, a.primary_contact_number,
                a.address, a.problem_statement, a.source_language, a.original_transcript,
              a.semantic_matched, a.semantic_confidence, a.semantic_intent, a.semantic_normalized_bangla,
              a.intake_summary, a.urgency, a.priority, a.severity_level, a.severity_category,
              a.severity_factors_json,
              cr.id AS recording_id, cr.voice_session_id AS recording_voice_session_id,
              cr.content_type AS recording_content_type, cr.duration_ms AS recording_duration_ms,
              cr.created_at AS recording_created_at
         FROM cases c
         LEFT JOIN applications a ON a.case_id = c.id
         LEFT JOIN call_recordings cr ON cr.id = (
           SELECT cr2.id FROM call_recordings cr2
           WHERE cr2.docket_id = c.docket_id
           ORDER BY cr2.created_at DESC LIMIT 1
         )
         WHERE c.id = ?`,
      )
      .bind(caseId)
      .first<PortalCaseRow>();
    if (!row) return NextResponse.json({ ok: false, error: "Application could not be read after creation" }, { status: 500 });
    return NextResponse.json({ ok: true, case: mapPortalCase(row) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
