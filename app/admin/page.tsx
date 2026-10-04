/**
 * The system administration route.
 *
 * Gated on the server. The Chief DLAO is the system administrator; the `admin` role is
 * a systems account and `chairman` is a committee seat, so neither reaches this page.
 * Redirecting here rather than rendering a shell that fails its first fetch means a
 * non-administrator never sees the admin chrome at all.
 */

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import { isSystemAdministrator } from "@/lib/auth/screen-guard";
import AdminDashboard from "@/components/admin-dashboard";

export const dynamic = "force-dynamic";

function adminDb(): D1Database | null {
  try {
    return (getCloudflareContext() as unknown as { env?: { DB?: D1Database } }).env?.DB ?? null;
  } catch {
    return null;
  }
}

export default async function AdminPage() {
  const headerList = await headers();
  const token = headerList
    .get("cookie")
    ?.split("; ")
    .find((row) => row.startsWith("auth_session="))
    ?.split("=")[1];
  const user = (await getD1SessionUser(adminDb(), token)) || getLocalSessionUser(token);

  if (!user) redirect("/login?tab=staff");
  if (!isSystemAdministrator(user.role)) redirect("/chief");

  return <AdminDashboard />;
}
