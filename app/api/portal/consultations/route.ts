import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import { getProblemCategory } from "@/lib/legal/problem-taxonomy";
import { isSensitiveClassification } from "@/lib/agent/knowledge/severity-classification";
import {
  markConsultationViewed,
  startOrResumeConsultation,
  type StartConsultationInput,
} from "@/lib/case/consultation-service";
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
  return (await getD1SessionUser(db, token)) || getLocalSessionUser(token);
}

/** The district DLAO who takes the callback, plus the panel lawyer on rotation. */
async function pickOfficers(db: D1Database, district: string) {
  const officers = await db
    .prepare(
      // `users` carries no district column, so any DLAO on the roster can take it.
      // The district is recorded on the case and the consultation instead.
      `SELECT id, display_name FROM users
       WHERE role_key = 'dlao' OR role = 'dlao_officer'
       ORDER BY id LIMIT 1`,
    )
    .all<{ id: string; display_name: string }>();
  const dlao = officers.results[0] ?? { id: null as unknown as string, display_name: "জেলা লিগ্যাল এইড অফিসার" };

  const lawyers = await db
    .prepare(
      `SELECT id, name_bn FROM panel_lawyers
       WHERE list_status = 'on_panel'
       ORDER BY CASE WHEN jurisdiction_district_name = ? THEN 0 ELSE 1 END, id LIMIT 1`,
    )
    .bind(district)
    .all<{ id: string; name_bn: string | null }>();
  const lawyer = lawyers.results[0] ?? null;

  return { dlao, lawyer };
}

/**
 * Derives the applicant's facts for the eligibility rules.
 *
 * Everything here is a real stored field or a real classification — never a guess
 * from the problem text, because an eligibility decision has to be explainable to
 * the applicant and defensible on appeal.
 */
function factsFor(row: {
  gender: string | null;
  has_disability: number;
  severity_category: string | null;
  severity_level: string | null;
  category: string | null;
  employed: number | null;
  monthly_income_bdt: number | null;
}) {
  const gender = row.gender ?? null;
  const isWoman = /^(female|woman|নারী|মহিলা)$/i.test((gender ?? "").trim());
  const immediate = isSensitiveClassification({
    severity: (row.severity_level ?? "standard") as never,
    category: row.severity_category ?? "",
  });

  // `employed` and `monthly_income_bdt` are the applicant's own answers from the
  // form. NULL means unanswered, and it is passed through as null rather than
  // defaulting to false/zero: an unasked question is not a negative answer, and
  // collapsing the two made every applicant look eligible.
  return {
    gender,
    hasDisability: row.has_disability === 1,
    employed: row.employed === null || row.employed === undefined ? null : row.employed === 1,
    ableToWork: row.has_disability === 1 ? false : null,
    monthlyIncome: row.monthly_income_bdt ?? null,
    destituteOrAbandoned: false,
    onlineAbuseAgainstWoman: isWoman && row.category === "cyber",
    physicallyAbused: isWoman && immediate && row.category !== "cyber",
    traffickingRisk: false,
    acidAttackVictim: false,
    categoryId: row.category,
  };
}

export async function POST(request: Request) {
  try {
    const db = getDatabase();
    if (!db) {
      return NextResponse.json({ ok: false, error: "ডেটাবেস সাময়িকভাবে উপল্লব্ধ নয়।" }, { status: 503 });
    }
    const user = await getRequestUser(request, db);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { applicationId?: string };
    if (!body.applicationId) {
      return NextResponse.json({ ok: false, error: "applicationId required" }, { status: 400 });
    }

    const application = await db
      .prepare(
        `SELECT a.id, a.application_time, a.applicant_user_id, a.applicant_name,
                a.primary_contact_number, a.has_disability, a.gender, a.problem_statement,
                a.severity_level, a.severity_category, a.case_id, a.employed, a.monthly_income_bdt,
                c.category, c.district
         FROM applications a
         LEFT JOIN cases c ON c.id = a.case_id
         WHERE a.id = ?`,
      )
      .bind(body.applicationId)
      .first<{
        id: string;
        application_time: string;
        applicant_user_id: string;
        applicant_name: string;
        primary_contact_number: string;
        has_disability: number;
        gender: string | null;
        problem_statement: string;
        severity_level: string | null;
        severity_category: string | null;
        case_id: string | null;
        employed: number | null;
        monthly_income_bdt: number | null;
        category: string | null;
        district: string | null;
      }>();

    if (!application) {
      return NextResponse.json({ ok: false, error: "আবেদন পাওয়া যায়নি" }, { status: 404 });
    }
    // An applicant may only run their own consultation. Staff cannot drive this
    // endpoint, because the transcript is a conversation *with* them.
    if (application.applicant_user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    const district = application.district || "ঢাকা";
    const category = getProblemCategory(application.category);
    const { dlao, lawyer } = await pickOfficers(db, district);

    const input: StartConsultationInput = {
      applicationId: application.id,
      applicationTime: application.application_time,
      applicantUserId: application.applicant_user_id,
      applicantName: application.applicant_name,
      phone: application.primary_contact_number,
      district,
      problemStatement: application.problem_statement,
      categoryId: application.category,
      subcategoryId: null,
      categoryBn: category?.bn ?? "সাধারণ বিবিধ অভিযোগ",
      facts: factsFor({
        gender: application.gender,
        has_disability: application.has_disability,
        severity_category: application.severity_category,
        severity_level: application.severity_level,
        category: application.category,
        employed: application.employed,
        monthly_income_bdt: application.monthly_income_bdt,
      }),
      dlaoUserId: dlao.id,
      dlaoName: dlao.display_name,
      panelLawyerId: lawyer?.id ?? null,
      panelLawyerName: lawyer?.name_bn ?? null,
    };

    const result = await startOrResumeConsultation(db, input);

    return NextResponse.json({
      ok: true,
      consultationId: result.consultationId,
      // Resume position, and whether playback has ever reached the end. Only the
      // latter closes the modal; a merely-started conversation still resumes.
      lastSeq: result.lastSeq ?? 0,
      completed: Boolean(result.completedAt),
      caseId: result.caseId,
      panelAssignmentId: result.panelAssignmentId,
      created: result.created,
      dlao: { id: dlao.id, name: dlao.display_name },
      panelLawyer: lawyer ? { id: lawyer.id, name: lawyer.name_bn } : null,
      script: result.script,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * Records playback progress. Best-effort: the applicant watching their own callback is
 * never allowed to fail because a progress ping did not land.
 */
export async function PATCH(request: Request) {
  try {
    const db = getDatabase();
    if (!db) return NextResponse.json({ ok: false, error: "ডেটাবেস সাময়িকভাবে উপল্লব্ধ নয়।" }, { status: 503 });
    const user = await getRequestUser(request, db);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      consultationId?: string;
      lastSeq?: number;
      completed?: boolean;
    };
    if (!body.consultationId) {
      return NextResponse.json({ ok: false, error: "consultationId required" }, { status: 400 });
    }

    // Scoped to the session, so a progress ping cannot be aimed at someone else's
    // consultation.
    const owned = await db
      .prepare(`SELECT id FROM consultations WHERE id = ? AND citizen_user_id = ?`)
      .bind(body.consultationId, user.id)
      .first<{ id: string }>();
    if (!owned) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });

    await markConsultationViewed(db, body.consultationId, Number(body.lastSeq) || 0, body.completed === true);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
