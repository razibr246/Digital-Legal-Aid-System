import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // We only protect the new portal routes.
  // / (landing), /login, /settings, /api/* remain unguarded by this middleware
  // (APIs have their own internal checks if needed).
  if (
    !pathname.startsWith("/citizen") &&
    !pathname.startsWith("/dlao") &&
    !pathname.startsWith("/lawyer")
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("auth_session");
  const token = sessionCookie?.value;

  // If no token, redirect to login
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (token.startsWith("sess-")) {
    return NextResponse.next();
  }

  // Parse role from our demo token format: local_{role}_{uuid}
  let userRole = "";
  if (token.startsWith("local_")) {
    const parts = token.split("_");
    if (parts.length >= 3) {
      // Role can have underscores (e.g. dlao_officer). So everything between local_ and the last part is the role.
      userRole = parts.slice(1, -1).join("_");
    }
  }
  
  // If we couldn't parse the role, redirect to login
  if (!userRole) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Check route vs role
  if (pathname.startsWith("/citizen") && userRole !== "citizen") {
    // Staff trying to access citizen portal
    return NextResponse.redirect(new URL(getPortalForRole(userRole), request.url));
  }

  if (pathname.startsWith("/lawyer") && userRole !== "panel_lawyer") {
    return NextResponse.redirect(new URL(getPortalForRole(userRole), request.url));
  }

  if (pathname.startsWith("/dlao")) {
    // dlao portal is for all staff EXCEPT panel_lawyer
    if (userRole === "citizen" || userRole === "panel_lawyer") {
      return NextResponse.redirect(new URL(getPortalForRole(userRole), request.url));
    }
  }

  return NextResponse.next();
}

function getPortalForRole(role: string): string {
  if (role === "citizen") return "/citizen";
  if (role === "panel_lawyer") return "/lawyer";
  return "/dlao"; // All other staff roles go to /dlao
}

export const config = {
  matcher: [
    "/citizen/:path*",
    "/dlao/:path*",
    "/lawyer/:path*",
  ],
};
