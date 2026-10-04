import { NextResponse } from "next/server";
import { clearLocalSession } from "@/lib/auth/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("auth_session="))
    ?.slice("auth_session=".length);
  clearLocalSession(token);

  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `auth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`,
      },
    },
  );
}
