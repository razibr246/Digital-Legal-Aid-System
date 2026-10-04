import { redirect } from "next/navigation";
import ChiefConsole from "@/components/chief-console";
import { canAccessScreen, whichScreen } from "@/lib/auth/screen-guard";
import { getAdminDatabase } from "@/lib/auth/admin-guard";
import { getD1SessionUser } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Chief's own console, so the Chief no longer has to land in the district queue.
 *
 * Gated here *and* in `/api/chief`. The page gate is convenience; the API gate is the one
 * that counts, because a page check is a redirect and a redirect is not authorisation.
 */
export default async function ChiefPage() {
  const db = getAdminDatabase();
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get("auth_session")?.value;
  const user = (await getD1SessionUser(db, token)) || getLocalSessionUser(token);
  const role = String(user?.role ?? "");

  if (!user || !(role === "chief" || role === "cdlao" || role === "chairman")) {
    // Send them to whatever their own role's home is, rather than a hardcoded guess.
    redirect(whichScreen(role || "visitor"));
  }
  if (!canAccessScreen(role === "cdlao" ? "chief" : role, "chief")) {
    redirect("/");
  }

  return <ChiefConsole />;
}
