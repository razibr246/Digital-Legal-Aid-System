import { NextResponse } from "next/server";
import { getLocalSessionUser } from "@/lib/auth/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("auth_session="))
    ?.slice("auth_session=".length);
  return NextResponse.json({ ok: true, user: getLocalSessionUser(token) });
}
