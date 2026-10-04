import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import { citizenCaseView } from "@/lib/data/citizen-case-view";

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

    // Always the caller's own cases. There is no id parameter to tamper with, so this
    // cannot be turned into a way to read somebody else's case.
    const cases = await citizenCaseView(db, user.id);
    return NextResponse.json({ ok: true, cases });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
