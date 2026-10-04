/**
 * System overview, and the deployment-integrity check.
 *
 * The build block exists because a stale deploy was invisible for several cycles and
 * both of us guessed at the cause. The server reports the build it *is*, and the client
 * compares it against the build it *loaded*, so a mismatch is displayed rather than
 * debated. That turns "it isn't updating" from an argument into an observation.
 */

import { NextResponse } from "next/server";
import { getAdminDatabase, requireSystemAdmin } from "@/lib/auth/admin-guard";
import { auditCounts } from "@/lib/audit/log";
import { BUILD_SHA, BUILD_AT } from "@/lib/build-info";
import { APP_ROLES, ROLE_DEFINITIONS } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getAdminDatabase();
  if (!db) return NextResponse.json({ ok: false, error: "ডেটাবেস সাময়িকভাবে উপল্লব্ধ নয়।" }, { status: 503 });
  const user = await requireSystemAdmin(request, db);
  if (user instanceof NextResponse) return user;

  const counts = async (sql: string) => {
    const r = await db.prepare(sql).first<{ n: number }>();
    return Number(r?.n ?? 0);
  };

  const [users, staff, citizens, cases, pending, applications, consultations, assignments, complaints, openComplaints, lawyers, audit24h] =
    await Promise.all([
      counts("SELECT COUNT(*) n FROM users"),
      counts("SELECT COUNT(*) n FROM users WHERE role_key IS NOT NULL"),
      counts("SELECT COUNT(*) n FROM users WHERE role = 'citizen'"),
      counts("SELECT COUNT(*) n FROM cases"),
      counts("SELECT COUNT(*) n FROM cases WHERE stage = 'review'"),
      counts("SELECT COUNT(*) n FROM applications"),
      counts("SELECT COUNT(*) n FROM consultations"),
      counts("SELECT COUNT(*) n FROM panel_assignments WHERE status = 'active'"),
      counts("SELECT COUNT(*) n FROM lawyer_service_complaints"),
      counts("SELECT COUNT(*) n FROM lawyer_service_complaints WHERE status = 'open'"),
      counts("SELECT COUNT(*) n FROM panel_lawyers"),
      Object.keys(
        await auditCounts(db, new Date(Date.now() - 86_400_000).toISOString()),
      ).length,
    ]);

  const byRole = await db
    .prepare(
      `SELECT COALESCE(role_key, role) AS role, COUNT(*) AS n
       FROM users GROUP BY COALESCE(role_key, role) ORDER BY n DESC`,
    )
    .all<{ role: string; n: number }>();

  return NextResponse.json({
    ok: true,
    build: { sha: BUILD_SHA, at: BUILD_AT },
    system: {
      users, staff, citizens, cases, pending, applications,
      consultations, assignments, complaints, openComplaints, lawyers,
      auditKindsLast24h: audit24h,
    },
    byRole: (byRole.results ?? []).map((r) => ({
      role: r.role,
      count: Number(r.n),
      titleBn: ROLE_DEFINITIONS.find((d) => d.key === r.role)?.titleBn ?? r.role,
    })),
    registrySize: APP_ROLES.length,
  });
}
