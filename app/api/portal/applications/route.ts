import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import type { SessionUser } from "@/lib/auth/roles";
import { validateBangladeshPhone } from "@/lib/phone/bangladesh-phone";
import { interpretSemanticBridge } from "@/lib/agent/semantic-bridge/match-lexicon";
import {
  classifySeverity,
  priorityForSeverity,
  urgencyForSeverity,
} from "@/lib/agent/knowledge/severity-classification";
import { generateVoicePin, sha256Hex } from "@/lib/auth/hash";
import { inferLegalCategory } from "@/lib/legal/category";
import { extractDistrict } from "@/lib/legal/districts";
import {
  OTHER_CATEGORY_ID,
  OTHER_SUBCATEGORY_BN,
  getProblemCategory,
  getProblemSubcategory,
  isOtherSubcategory,
} from "@/lib/legal/problem-taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTH_COOKIE_NAME = "auth_session";
const AUTH_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

type IntakeLanguage = "bn" | "marma" | "chakma";

/**
 * The POST above is deliberately open — it registers a brand new applicant, so there
 * is no session to check yet. This GET is the opposite: it reads, so it must be
 * scoped to the session.
 */
async function getRequestUser(request: Request, db: D1Database | null): Promise<SessionUser | null> {
  const token = request.headers
    .get("cookie")
    ?.split("; ")
    .find((row) => row.startsWith(`${AUTH_COOKIE_NAME}=`))
    ?.split("=")[1];
  return (await getD1SessionUser(db, token)) || getLocalSessionUser(token);
}

function getDatabase(): D1Database | null {
  try {
    return (getCloudflareContext() as unknown as { env?: { DB?: D1Database } }).env?.DB ?? null;
  } catch {
    return null;
  }
}

function generateDocketId(): string {
  return `DLAS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function normalizeLanguage(input: unknown): IntakeLanguage {
  return input === "marma" || input === "chakma" ? input : "bn";
}

/**
 * The severity classifier is a deterministic keyword pass, so the portal form can
 * run it server-side instead of trusting the browser. That keeps an urgency that a
 * DLAO triages on from being something a client can simply assert.
 */

/**
 * The caller's own applications, newest first.
 *
 * Exists so the citizen dashboard can find the application to run a consultation
 * against without the client having to be handed an id by the submit response, which
 * is lost on a refresh. Scoped to the session user: an applicant must never be able
 * to enumerate another applicant's applications.
 */
export async function GET(request: Request) {
  try {
    const db = getDatabase();
    if (!db) {
      return NextResponse.json({ ok: false, error: "ডেটাবেস সাময়িকভাবে উপল্লব্ধ নয়।" }, { status: 503 });
    }
    const user = await getRequestUser(request, db);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const rows = await db
      .prepare(
        `SELECT a.id, a.application_time, a.problem_statement, a.severity_level, a.severity_category,
                a.urgency, a.priority, a.case_id, c.docket_id, c.category, c.stage
         FROM applications a
         LEFT JOIN cases c ON c.id = a.case_id
         WHERE a.applicant_user_id = ?
         ORDER BY a.application_time DESC
         LIMIT 20`,
      )
      .bind(user.id)
      .all<Record<string, unknown>>();

    return NextResponse.json({ ok: true, applications: rows.results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const db = getDatabase();
  if (!db) {
    return NextResponse.json({ ok: false, error: "ডেটাবেস সাময়িকভাবে উপলব্ধ নয়।" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "আবেদনের তথ্য পড়া যায়নি।" }, { status: 400 });
  }

  // A client-generated id makes a double submit or a retry resolve to the same
  // application instead of opening a second case against the same person.
  const sessionId = String(body.sessionId || "").trim() || `web-${crypto.randomUUID()}`;

  // A chosen category+sub-category is authoritative. It replaces the keyword
  // guess entirely, which is the whole point: the applicant picked it deliberately,
  // so urgency and the legal category can no longer be wrong because the wording
  // happened not to contain a keyword.
  const categoryId = String(body.categoryId || "").trim() || null;
  const subcategoryId = String(body.subcategoryId || "").trim() || null;
  const chosenCategory = getProblemCategory(categoryId);
  const chosenSubcategory = getProblemSubcategory(categoryId, subcategoryId);
  const customProblem = String(body.customProblem || "").trim();

  // The words the applicant actually typed. The semantic bridge must read THESE,
  // not the category-derived Bangla below, or an untranslated Marma/Chakma
  // statement would be checked against the wrong script and never gated.
  const submittedProblem = String(body.problem || "").trim();
  let problem = submittedProblem;
  if (chosenCategory) {
    if (chosenCategory.id === OTHER_CATEGORY_ID) {
      if (customProblem.length < 10) {
        return NextResponse.json(
          { ok: false, error: "অন্যান্য বিভাগে আপনার সমস্যা কমপক্ষে ১০ অক্ষরের বর্ণনা লিখুন।", field: "customProblem" },
          { status: 400 },
        );
      }
      problem = customProblem;
    } else if (isOtherSubcategory(subcategoryId)) {
      // The per-category escape hatch. Checked before `chosenSubcategory` because
      // the sentinel is deliberately not in the category's own list, so the
      // lookup would otherwise 400 on a legitimate choice.
      if (customProblem.length < 10) {
        return NextResponse.json(
          { ok: false, error: "অন্যান্য বিকল্পে আপনার সমস্যা কমপক্ষে ১০ অক্ষরের বর্ণনা লিখুন।", field: "customProblem" },
          { status: 400 },
        );
      }
      // Keep the category heading so an officer can still triage by section even
      // when the caller described the problem in their own words.
      problem = `${chosenCategory.bn}: ${OTHER_SUBCATEGORY_BN} — ${customProblem}`;
    } else {
      if (!chosenSubcategory) {
        return NextResponse.json(
          { ok: false, error: "এই বিভাগের একটি সমস্যা নির্বাচন করুন।", field: "subcategoryId" },
          { status: 400 },
        );
      }
      // Keep the section heading so the stored statement reads on its own in the
      // officer's queue, not as a bare question with no context.
      problem = `${chosenCategory.bn}: ${chosenSubcategory.bn}`;
    }
  }
  const displayName = String(body.displayName || "").trim();
  const phoneInput = String(body.phone || "").trim();
  const address = String(body.address || "").trim();
  const language = normalizeLanguage(body.language);
  const hasDisability = body.hasDisability === true ? 1 : 0;
  const gender = String(body.gender || "").trim() || null;
  // Tri-state on purpose. `null` means the applicant was not asked or did not say,
  // which is not the same as "no" — the eligibility rules depend on that difference.
  const employed = body.employed === true ? 1 : body.employed === false ? 0 : null;
  const rawIncome = Number(body.monthlyIncome);
  const monthlyIncome = body.monthlyIncome === null || body.monthlyIncome === undefined || body.monthlyIncome === ""
    ? null
    : Number.isFinite(rawIncome) && rawIncome >= 0
      ? Math.trunc(rawIncome)
      : null;
  const disabilityType = hasDisability ? String(body.disabilityType || "").trim() || null : null;

  if (!problem) {
    return NextResponse.json({ ok: false, error: "আপনার সমস্যার বিবরণ লিখুন।" }, { status: 400 });
  }
  if (!displayName) {
    return NextResponse.json({ ok: false, error: "আপনার পূর্ণ নাম লিখুন।" }, { status: 400 });
  }

  const phone = validateBangladeshPhone(phoneInput);
  if (!phone.valid) {
    return NextResponse.json(
      { ok: false, error: phone.reasonBn, field: "phone" },
      { status: 400 },
    );
  }

  // An indigenous-language statement is interpreted here rather than in the
  // browser, and the citizen has to confirm the reading before we store it —
  // the same confirmation the voice intake asks for.
  let semanticMatched = 0;
  let semanticConfidence: number | null = null;
  let semanticIntent: string | null = null;
  let semanticNormalizedBangla: string | null = null;
  if (language !== "bn") {
    const bridge = interpretSemanticBridge(submittedProblem || problem, language);
    if (bridge.confidence > 0) {
      if (body.semanticConfirmed !== true) {
        return NextResponse.json(
          {
            ok: false,
            error: "বুঝানো বাংলা অর্থটি নিশ্চিত করতে হবে।",
            field: "semantic",
            clarificationQuestionBn: bridge.clarificationQuestionBn,
            legalIntentBn: bridge.legalIntentBn,
          },
          { status: 400 },
        );
      }
      semanticMatched = 1;
      semanticConfidence = bridge.confidence;
      semanticIntent = bridge.legalIntent;
      semanticNormalizedBangla = bridge.normalizedBangla;
    }
  }

  // A district spoken in the address resolves the same way it does on the phone;
  // an explicit pick always wins.
  const district = String(body.district || "").trim() || extractDistrict(address) || "ঢাকা";
  // When the bridge produced a Bangla reading, categorise that rather than the raw
  // Marma/Chakma text: the keywords the classifier matches live in the
  // translation, so a domestic-violence report in Marma would otherwise be filed
  // as general_civil.
  // Prefer the applicant's own selection; fall back to the keyword pass for
  // callers that post without one (the voice path never sends categoryId).
  const category = chosenCategory
    ? chosenCategory.id
    : inferLegalCategory(semanticNormalizedBangla || problem);
  const severity = classifySeverity(problem, {
    categoryId,
    // The per-category "other" escape hatch is a real choice but carries no spec
    // meaning of its own, so tagForSelection returns null and the caller's own
    // words decide the severity.
    subcategoryId,
  });
  const voicePin = generateVoicePin();
  const pinHash = await sha256Hex(voicePin);

  // Re-submitting the same wizard returns the application already on file rather
  // than registering the person twice.
  const existing = await db
    .prepare(
      `SELECT c.id AS case_id, c.citizen_user_id, c.docket_id
       FROM cases c
       WHERE c.voice_session_id = ?
       LIMIT 1`,
    )
    .bind(sessionId)
    .first<{ case_id: string; citizen_user_id: string; docket_id: string }>();

  const userId = existing?.citizen_user_id || `CIT-${crypto.randomUUID()}`;
  const caseId = existing?.case_id || `CASE-${crypto.randomUUID()}`;
  const docketId = existing?.docket_id || generateDocketId();
  const applicationId = `APP-${docketId.slice(5)}`;

  const token = `sess-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_SECONDS * 1000);
  const tokenHash = await sha256Hex(token);

  try {
    if (!existing) {
      await db.batch([
        db
          .prepare(
            `INSERT INTO users (id, role, display_name, phone, status, verification_status, pin_hash, is_mock)
             VALUES (?, 'citizen', ?, ?, 'active', 'pending', ?, 0)`,
          )
          .bind(userId, displayName, phone.normalized, pinHash),
        db
          .prepare(
            `INSERT INTO cases
              (id, docket_id, citizen_user_id, voice_session_id, problem, has_disability, disability_type,
               gender, district, thana, category, status, is_demo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 0)`,
          )
          .bind(
            caseId,
            docketId,
            userId,
            sessionId,
            problem,
            hasDisability,
            disabilityType,
            gender,
            district,
            address || null,
            category,
          ),
        db
          .prepare(
            `INSERT INTO applications
              (id, applicant_user_id, applicant_name, primary_contact_number, has_disability,
               disability_type, gender, address, problem_statement, case_id, source, source_voice_session_id,
               source_language, original_transcript, semantic_matched, semantic_confidence,
               semantic_intent, semantic_normalized_bangla, intake_summary, urgency, priority,
               severity_level, severity_category, severity_factors_json, employed, monthly_income_bdt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            applicationId,
            userId,
            displayName,
            phone.normalized,
            hasDisability,
            disabilityType,
            gender,
            address || null,
            problem,
            caseId,
            sessionId,
            language,
            problem,
            semanticMatched,
            semanticConfidence,
            semanticIntent,
            semanticNormalizedBangla,
            semanticNormalizedBangla || problem,
            urgencyForSeverity(severity.severity),
            priorityForSeverity(severity.severity),
            severity.severity,
            severity.category,
            JSON.stringify(severity.factors),
            employed,
            monthlyIncome,
          ),
        db
          .prepare(
            `INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`,
          )
          .bind(tokenHash, userId, expiresAt.toISOString()),
      ]);
    } else {
      // A repeat submit keeps the one application on file but always issues a
      // fresh session, so the browser ends up logged in either way.
      await db
        .prepare("UPDATE users SET pin_hash = ? WHERE id = ?")
        .bind(pinHash, userId)
        .run();
      await db
        .prepare(
          `INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`,
        )
        .bind(tokenHash, userId, expiresAt.toISOString())
        .run();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  const applicationTime = new Date().toISOString();

  // The pin is returned so the wizard can show it: a web applicant has no SMS to
  // receive it in, and this is the only way they can later use 16699 case tracking.
  const response = NextResponse.json({
    ok: true,
    docketId,
    applicationId,
    applicationTime,
    caseId,
    district,
    category,
    severity: severity.severity,
    categoryId: chosenCategory?.id ?? null,
    subcategoryId: chosenSubcategory?.id ?? null,
    voicePin,
    phone: phone.normalized,
    operator: phone.operator,
    user: {
      id: userId,
      displayName,
      role: "citizen",
      status: "active",
      verificationStatus: "pending",
      isMock: false,
    },
  });
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return response;
}
