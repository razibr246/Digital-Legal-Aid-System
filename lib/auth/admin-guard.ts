/**
 * The one place an admin request is allowed through.
 *
 * Every admin route calls this rather than checking a role inline, because a route
 * that rolls its own check is a route that will eventually get the check wrong. The
 * denial is itself written to the audit trail: a failed attempt to read the log is
 * exactly the kind of thing that has to leave a mark.
 */

import { NextResponse } from "next/server";
import { getCloudflareContext as getCloudflareContextRef } from "@opennextjs/cloudflare";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import { isSystemAdministrator } from "@/lib/auth/screen-guard";
import { writeAudit, AUDIT_KINDS } from "@/lib/audit/log";
import type { SessionUser } from "@/lib/auth/roles";

export function getAdminDatabase(): D1Database | null {
  try {
    return (getCloudflareContextRef() as { env?: { DB?: D1Database } }).env?.DB ?? null;
  } catch {
    return null;
  }
}

export async function requireSystemAdmin(
  request: Request,
  db: D1Database | null,
): Promise<SessionUser | NextResponse> {
  const token = request.headers
    .get("cookie")
    ?.split("; ")
    .find((row) => row.startsWith("auth_session="))
    ?.split("=")[1];
  const user = (await getD1SessionUser(db, token)) || getLocalSessionUser(token);

  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  if (!isSystemAdministrator(user.role)) {
    if (db) {
      await writeAudit(db, {
        kind: AUDIT_KINDS.session_denied,
        actorId: user.id,
        actorRole: user.role,
        detail: "সিস্টেম প্রশাসন অ্যাক্সেসের চেষ্টা অনুমোদিত হয়নি",
        reason: "not_chief_dlao",
        refId: new URL(request.url).pathname,
      });
    }
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  return user;
}
