/**
 * The panel-lawyer roster, searchable, with live workload.
 *
 * The workload figures are the point. A DLAO choosing between lawyers needs to know
 * who is already carrying cases and who has gone quiet, not just a list of names.
 * Overdue actions are counted per lawyer so a name that looks idle because they were
 * assigned nothing cannot be mistaken for a name that is idle because nothing is being
 * done.
 */

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import { isDistrictOfficeRole } from "@/lib/auth/screen-guard";
import { filterLawyers, rankLawyers, type LawyerSummary } from "@/lib/case/lawyer-assignment";
import { recommendLawyers, summariseRecommendation } from "@/lib/case/lawyer-recommendation";
import { getProblemCategory } from "@/lib/legal/problem-taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getDatabase(): D1Database | null {
  try {
    return (getCloudflareContext() as unknown as { env?: { DB?: D1Database } }).env?.DB ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const db = getDatabase();
    if (!db) return NextResponse.json({ ok: false, error: "ডেটাবেস সাময়িকভাবে উপল্লব্ধ নয়।" }, { status: 503 });
    const token = request.headers
      .get("cookie")
      ?.split("; ")
      .find((row) => row.startsWith("auth_session="))
      ?.split("=")[1];
    const user = (await getD1SessionUser(db, token)) || getLocalSessionUser(token);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    // Officer-only. An applicant has no business browsing the roster.
    if (!isDistrictOfficeRole(user.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    const rows = await db
      .prepare(
        `SELECT pl.id, pl.name_bn, pl.kind, pl.bar_registration, pl.specialisations,
                pl.jurisdiction_district_name, pl.phone, pl.email, pl.list_status,
                (SELECT COUNT(*) FROM panel_assignments p
                  WHERE p.panel_lawyer_id = pl.id AND p.status = 'active') AS active_assignments,
                (SELECT COUNT(*) FROM lawyer_action_log l
                  JOIN panel_assignments p2 ON p2.id = l.assignment_id
                  WHERE p2.panel_lawyer_id = pl.id AND p2.status = 'active'
                    AND l.done_at IS NULL AND l.due_at IS NOT NULL
                    AND l.due_at < datetime('now')) AS overdue_actions
         FROM panel_lawyers pl
         ORDER BY pl.name_bn`,
      )
      .all<{
        id: string;
        name_bn: string | null;
        kind: string;
        bar_registration: string | null;
        specialisations: string | null;
        jurisdiction_district_name: string | null;
        phone: string | null;
        email: string | null;
        list_status: string;
        active_assignments: number;
        overdue_actions: number;
      }>();

    const lawyers: LawyerSummary[] = rows.results.map((r) => ({
      id: r.id,
      name: r.name_bn ?? "আইনজীবী",
      kind: (r.kind as "lawyer" | "mediator") ?? "lawyer",
      barRegistration: r.bar_registration,
      specialisations: r.specialisations,
      jurisdiction: r.jurisdiction_district_name,
      phone: r.phone,
      email: r.email,
      listStatus: r.list_status,
      activeAssignments: Number(r.active_assignments ?? 0),
      overdueActions: Number(r.overdue_actions ?? 0),
      assignable: r.list_status === "on_panel",
    }));

    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const caseId = url.searchParams.get("caseId");

    // With a case in hand, also return a ranked recommendation and the reasons for it,
    // so the console can lead with a reasoned suggestion rather than a bare list.
    let recommendation = null;
    if (caseId) {
      const target = await db
        .prepare(`SELECT id, category, problem_category, district FROM cases WHERE id = ?`)
        .bind(caseId)
        .first<{ id: string; category: string | null; problem_category: string | null; district: string | null }>();
      if (target) {
        const categoryId = target.problem_category ?? target.category;
        const ranked = recommendLawyers(
          { categoryId, district: target.district },
          rankLawyers(lawyers),
        );
        recommendation = {
          caseId: target.id,
          categoryId,
          categoryBn: getProblemCategory(categoryId)?.bn ?? null,
          headlineBn: summariseRecommendation(
            { categoryId, categoryBn: getProblemCategory(categoryId)?.bn ?? null },
            ranked,
          ),
          items: ranked,
        };
      }
    }

    return NextResponse.json({ ok: true, lawyers: rankLawyers(filterLawyers(lawyers, q)), query: q, recommendation });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
