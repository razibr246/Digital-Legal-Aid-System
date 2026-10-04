import { redirect } from "next/navigation";
import LawyerMonitorConsole from "@/components/lawyer-monitor-console";
import { canAccessScreen, whichScreen } from "@/lib/auth/screen-guard";
import { getAdminDatabase } from "@/lib/auth/admin-guard";
import { getD1SessionUser } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lawyer Accountability Monitoring Dashboard
 *
 * Tracks SLA compliance, handles show-cause notices, payment freezes, and
 * lawyer performance monitoring. Only accessible to Chief DLAO and Chairman.
 */
export default async function LawyerRatingMonitorPage() {
  const db = getAdminDatabase();
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get("auth_session")?.value;
  const user = (await getD1SessionUser(db, token)) || getLocalSessionUser(token);
  const role = String(user?.role ?? "");

  if (!user || !(role === "chief" || role === "cdlao" || role === "chairman")) {
    redirect(whichScreen(role || "visitor"));
  }
  if (!canAccessScreen(role === "cdlao" ? "chief" : role, "chief")) {
    redirect("/");
  }

  return <LawyerMonitorConsole />;
}
