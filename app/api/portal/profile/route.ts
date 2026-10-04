import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { TERMINAL_STATUSES } from "@/lib/case/domain";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import type { SessionUser } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (!token) return null;
  const d1User = await getD1SessionUser(db, token);
  return d1User || getLocalSessionUser(token);
}

interface ProfileApplicationRow {
  id: string;
  case_id: string | null;
  applicant_name: string | null;
  source: string | null;
  source_language: string | null;
  urgency: string | null;
  priority: string | null;
  created_at: string;
  docket_id: string | null;
  status: string | null;
  stage: string | null;
}

export async function GET(request: Request) {
  try {
    const db = getDatabase();
    const user = await getRequestUser(request, db);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    const account = await db
      .prepare(
        `SELECT id, display_name, phone, status, verification_status, is_mock,
                created_at, pin_hash
         FROM users WHERE id = ? LIMIT 1`,
      )
      .bind(user.id)
      .first<{
        id: string;
        display_name: string | null;
        phone: string | null;
        status: string;
        verification_status: string;
        is_mock: number;
        created_at: string;
        pin_hash: string | null;
      }>();

    const applicationRows = await db
      .prepare(
        `SELECT a.id, a.case_id, a.applicant_name, a.source, a.source_language,
                a.urgency, a.priority, a.created_at,
                c.docket_id, c.status, c.stage
         FROM applications a
         LEFT JOIN cases c ON c.id = a.case_id
         WHERE a.applicant_user_id = ?
         ORDER BY a.created_at DESC`,
      )
      .bind(user.id)
      .all<ProfileApplicationRow>();

    const applications = applicationRows.results ?? [];
    // Counted from `cases.stage`, the case lifecycle, not `cases.status`. `status` is
    // the portal-facing column and stays "submitted" for the life of the case, so
    // counting against it reported every case as active and never reported a closure.
    // stage is constrained to CASE_STATUSES and is what the domain rules operate on,
    // so the two numbers here cannot disagree with the DLAO's view.
    const terminalStages = new Set<string>(TERMINAL_STATUSES);

    const toApplication = (row: ProfileApplicationRow) => ({
      applicationId: row.id,
      docketId: row.docket_id || row.id,
      caseId: row.case_id,
      applicantName: row.applicant_name || user.displayName,
      source: row.source || "portal",
      sourceLanguage: row.source_language || "bn",
      urgency: row.urgency || "normal",
      priority: row.priority || "normal",
      status: row.status || "submitted",
      submittedAt: row.created_at,
    });

    const verificationRows = await db
      .prepare(
        `SELECT id, document_type, document_number_masked, status, name_match,
                name_en, name_bn, simulated, created_at
         FROM identity_verifications
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(user.id)
      .all<{
        id: string;
        document_type: "nid" | "passport";
        document_number_masked: string;
        status: "verified" | "review" | "rejected";
        name_match: number | null;
        name_en: string | null;
        name_bn: string | null;
        simulated: number;
        created_at: string;
      }>();

    const latest = verificationRows.results?.[0] ?? null;
    const attemptRow = await db
      .prepare("SELECT COUNT(*) AS total FROM identity_verifications WHERE user_id = ?")
      .bind(user.id)
      .first<{ total: number }>();
    const attempts = Number(attemptRow?.total ?? 0);

    return NextResponse.json({
      ok: true,
      identity: {
        attempts,
        latest: latest
          ? {
              id: latest.id,
              documentType: latest.document_type,
              documentNumberMasked: latest.document_number_masked,
              status: latest.status,
              nameMatch: latest.name_match === null ? null : Boolean(latest.name_match),
              nameEn: latest.name_en,
              nameBn: latest.name_bn,
              simulated: Boolean(latest.simulated),
              createdAt: latest.created_at,
            }
          : null,
      },
      profile: {
        userId: account?.id || user.id,
        displayName: account?.display_name || user.displayName,
        role: user.role,
        status: account?.status || user.status,
        verificationStatus: account?.verification_status || user.verificationStatus,
        phone: account?.phone || null,
        memberSince: account?.created_at || null,
        hasVoicePin: Boolean(account?.pin_hash),
        isMock: Boolean(account?.is_mock),
      },
      stats: {
        totalApplications: applications.length,
        activeCases: applications.filter((row) => !terminalStages.has(row.stage || "")).length,
        closedCases: applications.filter((row) => terminalStages.has(row.stage || "")).length,
        voiceApplications: applications.filter((row) => row.source === "voice").length,
      },
      applications: applications.slice(0, 10).map(toApplication),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Aligns the portal display name with the verified document name. */
export async function PATCH(request: Request) {
  try {
    const db = getDatabase();
    const user = await getRequestUser(request, db);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    const body = (await request.json()) as { displayName?: string };
    const displayName = String(body.displayName || "").trim();
    if (displayName.length < 2) {
      return NextResponse.json({ ok: false, error: "নাম কমপক্ষে ২ অক্ষরের হতে হবে" }, { status: 400 });
    }

    // The citizen may correct their own name at any time. Identity verification
    // can also set it (see the accept endpoint), and that path is recorded.

    const next = displayName.slice(0, 120);
    await db
      .prepare("UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(next, user.id)
      .run();

    // If a verified document exists, flag a name that no longer matches it.
    const document = await db
      .prepare(
        `SELECT name_en, name_bn, document_type, document_number_masked, status
         FROM identity_verifications
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(user.id)
      .first<{
        name_en: string | null;
        name_bn: string | null;
        document_type: string;
        document_number_masked: string;
        status: string;
      }>();

    let nameWarning: string | null = null;
    if (document) {
      const { compareNames } = await import("@/lib/identity/identity");
      const comparison = compareNames(next, [document.name_en, document.name_bn]);
      if (!comparison.match) {
        const docName = [document.name_bn, document.name_en].filter(Boolean).join(" / ");
        nameWarning =
          `আপনার নাম "${next}" আপনার ${document.document_type === "nid" ? "জাতীয় পরিচয়পত্র" : "পাসপোর্ট"} ` +
          `(${document.document_number_masked})-এর নাম "${docName || "অজানা}"}-এর সাথে মেলেনি। ` +
          `যাচাইকরণের জন্য নাম পরিচয়পত্র অনুযায়ী দেওয়া উচিত।`;
      }
    }

    return NextResponse.json({ ok: true, displayName: next, nameWarning });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
