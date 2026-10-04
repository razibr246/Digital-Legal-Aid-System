import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createD1Session, type D1Database } from "@/lib/auth/d1-session";
import { createLocalCitizenSession } from "@/lib/auth/local-session";
import { sha256Hex } from "@/lib/auth/hash";
import { PERSONAS, getPersona, type Persona } from "@/lib/demo/personas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-click login for the five citizen personas from Part A of the brief.
 *
 * This route is deliberately NOT in worker-entry.ts's intercept table. The paths that
 * are intercepted there (including /api/portal/citizen-login) behave differently under
 * the Worker than under `next dev`, which is a trap worth avoiding: this endpoint is
 * the same code on both runtimes, so a demo cannot pass locally and fail deployed.
 *
 * The session is issued for a user the server already knows about — that is the whole
 * mechanism. No PIN is checked, and none could be: these are seeded mock accounts. The
 * PIN on each persona still exists so a reviewer can walk the REAL phone + PIN form if
 * they want to show that path too.
 *
 * What it is NOT: an authentication bypass. Every row it touches is is_mock = 1 and
 * every case is is_demo = 1, so anything a reviewer does here is visibly flagged as
 * demo data and cannot be confused with a real applicant's record.
 */

function getDatabase(): D1Database | null {
  try {
    return (getCloudflareContext() as unknown as { env?: { DB?: D1Database } }).env?.DB ?? null;
  } catch {
    return null;
  }
}

interface UserRow {
  id: string;
  role: string;
  role_key: string | null;
  display_name: string;
  status: string;
  verification_status: string;
  is_mock: number;
}

/**
 * Makes sure the persona's account and case exist, then returns the account.
 *
 * The ids are fixed and every write is INSERT OR IGNORE, so this is an upsert: it does
 * not care whether migrations/0030 has been applied. That matters for a demo — a fresh
 * database, a database migrated halfway, and a database fully seeded all land on the
 * same row, and the one-click button never shows an empty dashboard.
 */
async function ensurePersonaRows(db: D1Database, persona: Persona): Promise<UserRow> {
  const { seed } = persona;

  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO users
           (id, role, display_name, phone, status, verification_status, pin_hash, is_mock)
         VALUES (?, 'citizen', ?, ?, 'active', 'verified', ?, 1)`,
      )
      .bind(seed.userId, persona.nameBn, seed.phone, await sha256Hex(seed.pin)),

    db
      .prepare(
        `INSERT OR IGNORE INTO cases
           (id, docket_id, citizen_user_id, voice_session_id, problem, has_disability,
            disability_type, gender, district, category, status, stage, sensitive,
            is_demo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now', ?), datetime('now'))`,
      )
      .bind(
        seed.caseId,
        seed.docketId,
        seed.userId,
        seed.voiceSessionId,
        seed.problem,
        seed.hasDisability,
        seed.disabilityType,
        seed.gender,
        seed.district,
        seed.category,
        seed.status,
        seed.stage,
        seed.sensitive,
        `-${seed.ageDays} days`,
      ),

    db
      .prepare(
        `INSERT OR IGNORE INTO applications
           (id, applicant_user_id, applicant_name, primary_contact_number, has_disability,
            disability_type, gender, problem_statement, case_id, source, source_voice_session_id,
            source_language, intake_summary, urgency, priority, severity_level, severity_category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'voice', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        seed.applicationId,
        seed.userId,
        persona.nameBn,
        seed.phone,
        seed.hasDisability,
        seed.disabilityType,
        seed.gender,
        seed.problem,
        seed.caseId,
        seed.voiceSessionId,
        seed.sourceLanguage,
        seed.problem,
        seed.urgency,
        seed.priority,
        seed.severityLevel,
        seed.severityCategory,
      ),
  ]);

  const row = await db
    .prepare(
      `SELECT id, role, role_key, display_name, status, verification_status, is_mock
         FROM users WHERE id = ?`,
    )
    .bind(seed.userId)
    .first<UserRow>();

  if (!row) throw new Error("Persona account could not be read after creation");
  return row;
}

export async function GET() {
  // The picker imports the personas directly, so this exists for scripts and for anyone
  // driving the demo over HTTP.
  return NextResponse.json({
    ok: true,
    personas: PERSONAS.map((persona) => ({
      id: persona.id,
      code: persona.code,
      name: persona.nameBn,
      district: persona.districtBn,
      docketId: persona.seed.docketId,
      stage: persona.seed.stage,
    })),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { personaId?: string };
    const persona = getPersona(body.personaId);
    if (!persona) {
      return NextResponse.json(
        { ok: false, error: "Unknown persona. Expected one of: " + PERSONAS.map((p) => p.id).join(", ") },
        { status: 400 },
      );
    }

    const db = getDatabase();

    // No D1 (plain `next dev`, or a deploy with no binding): fall back to the local
    // in-memory session so the demo is still clickable. The dashboard will then show no
    // cases, which is a lesser failure than a 503 with no way forward.
    if (!db) {
      const session = createLocalCitizenSession(
        persona.nameBn,
        persona.seed.phone,
        persona.seed.voiceSessionId,
        await sha256Hex(persona.seed.pin),
      );
      const response = NextResponse.json({
        ok: true,
        persisted: false,
        user: session.user,
        persona: { id: persona.id, code: persona.code, name: persona.nameBn, district: persona.districtBn },
      });
      response.cookies.set("auth_session", session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: session.expiresAt,
      });
      return response;
    }

    const row = await ensurePersonaRows(db, persona);
    const session = await createD1Session(db, row.id);

    const response = NextResponse.json({
      ok: true,
      persisted: true,
      user: {
        id: row.id,
        displayName: row.display_name,
        // citizen has no canonical role_key; role is the seat.
        role: (row.role_key as string) ?? row.role,
        status: row.status,
        verificationStatus: row.verification_status,
        isMock: Boolean(row.is_mock),
      },
      persona: {
        id: persona.id,
        code: persona.code,
        name: persona.nameBn,
        district: persona.districtBn,
        docketId: persona.seed.docketId,
        caseId: persona.seed.caseId,
        stage: persona.seed.stage,
      },
    });
    response.cookies.set("auth_session", session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
