import { NextResponse } from "next/server";
import { createLocalSessionForUser, getLocalUserByPin } from "@/lib/auth/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function hashPin(pin: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { pin?: string; displayName?: string };
    const pin = String(body.pin || "").replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit))).trim();
    if (!/^\d{4}$/.test(pin)) {
      return NextResponse.json({ ok: false, error: "A four-digit PIN is required" }, { status: 400 });
    }

    const user = getLocalUserByPin(await hashPin(pin));
    const displayName = String(body.displayName || "").trim();
    if (!user || (displayName && !user.displayName.toLocaleLowerCase("bn-BD").includes(displayName.toLocaleLowerCase("bn-BD")))) {
      return NextResponse.json({ ok: false, error: "PIN or name was not recognized" }, { status: 401 });
    }

    const session = createLocalSessionForUser(user);
    const response = NextResponse.json({ ok: true, user: session.user });
    response.cookies.set("auth_session", session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
