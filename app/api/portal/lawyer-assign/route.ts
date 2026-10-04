/**
 * A DLAO assigning or reassigning a panel lawyer by hand.
 *
 * The rules live in `lib/case/lawyer-assignment.ts` so they cannot be bypassed from
 * the screen, and every appointment is audit-logged with a stable machine-readable
 * kind.
 */

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import { isDistrictOfficeRole } from "@/lib/auth/screen-guard";
import { assignPanelLawyer, AssignmentError } from "@/lib/case/lawyer-assignment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getDatabase(): D1Database | null {
  try {
    return (getCloudflareContext() as unknown as { env?: { DB?: D1Database } }).env?.DB ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
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
    if (!isDistrictOfficeRole(user.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      caseId?: string;
      panelLawyerId?: string;
      noteBn?: string;
    };
    if (!body.caseId || !body.panelLawyerId) {
      return NextResponse.json({ ok: false, error: "caseId ও panelLawyerId required" }, { status: 400 });
    }

    try {
      const result = await assignPanelLawyer(db, {
        caseId: body.caseId,
        panelLawyerId: body.panelLawyerId,
        officerUserId: user.id,
        officerName: user.displayName,
        noteBn: body.noteBn,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      if (err instanceof AssignmentError) {
        const status = err.code === "not_found" ? 404 : 409;
        return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status });
      }
      throw err;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
