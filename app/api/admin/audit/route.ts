/**
 * The audit trail, for the Chief DLAO.
 *
 * Read-only by design. There is no POST here: a log that its own reader can write to
 * is not a log. Viewing it is itself recorded, because "who checked the log, and when"
 * is a question an authority has to be able to answer.
 */

import { NextResponse } from "next/server";
import { getAdminDatabase, requireSystemAdmin } from "@/lib/auth/admin-guard";
import { auditCounts, queryAudit, writeAudit, AUDIT_KINDS } from "@/lib/audit/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getAdminDatabase();
  if (!db) return NextResponse.json({ ok: false, error: "ডেটাবেস সাময়িকভাবে উপল্লব্ধ নয়।" }, { status: 503 });
  const user = await requireSystemAdmin(request, db);
  if (user instanceof NextResponse) return user;

  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") ?? "7");
  const since = Number.isFinite(days) && days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined;

  const [entries, counts, actors] = await Promise.all([
    queryAudit(db, {
      kind: url.searchParams.get("kind") || undefined,
      actorId: url.searchParams.get("actorId") || undefined,
      refId: url.searchParams.get("refId") || undefined,
      search: url.searchParams.get("q") || undefined,
      since,
      limit: Number(url.searchParams.get("limit") ?? 150),
      offset: Number(url.searchParams.get("offset") ?? 0),
    }),
    auditCounts(db, since),
    db
      .prepare(
        `SELECT DISTINCT l.actor_id AS id, COALESCE(u.display_name, l.actor_role, 'অজানা') AS name, l.actor_role AS role
         FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id
         WHERE l.actor_id IS NOT NULL ORDER BY name`,
      )
      .all<{ id: string; name: string; role: string | null }>(),
  ]);

  await writeAudit(db, {
    kind: AUDIT_KINDS.admin_viewed_audit,
    actorId: user.id,
    actorRole: user.role,
    detail: `অডিট ট্রেইল দেখা হয়েছে (${days} দিন, ${entries.length} টি এন্ট্রি)`,
    refId: url.searchParams.get("refId") || null,
  });

  return NextResponse.json({
    ok: true,
    entries,
    counts,
    actors: actors.results ?? [],
    kinds: Object.values(AUDIT_KINDS),
    since: since ?? null,
  });
}
