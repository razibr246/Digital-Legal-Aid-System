import { NextResponse } from "next/server";
import { createLocalCitizenSession } from "@/lib/auth/local-session";

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
    const body = (await request.json()) as {
       displayName?: string;
       phone?: string | null;
       disabilityType?: string | null;
       pin?: string;
       voiceSessionId?: string;

       docketId?: string;
       applicationId?: string;
    };
    if (!body.displayName?.trim() || !body.voiceSessionId || !body.docketId) {
      return NextResponse.json({ ok: false, error: "displayName, voiceSessionId, and docketId are required" }, { status: 400 });
    }

    const pin = typeof body.pin === "string" && /^\d{4}$/.test(body.pin) ? body.pin : null;
    const pinHash = pin ? await hashPin(pin) : undefined;
     const session = createLocalCitizenSession(body.displayName, body.phone ?? null, body.voiceSessionId, pinHash);
     const applicationId = body.applicationId || body.docketId.replace(/^DLAS-/, "APP-");
     const response = NextResponse.json({
       ok: true,
       user: session.user,
       docketId: body.docketId,
       applicationId,
       applicationTime: new Date().toISOString(),
     });
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
