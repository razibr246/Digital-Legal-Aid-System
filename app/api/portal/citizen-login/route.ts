import { NextResponse } from "next/server";
import { createLocalSessionForUser, getLocalUserByPhoneAndPin } from "@/lib/auth/local-session";
import { normalizeBangladeshPhone } from "@/lib/phone/bangladesh-phone";

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
    const body = (await request.json()) as { phone?: string; pin?: string };
    const phone = normalizeBangladeshPhone(String(body.phone || ""));
    const pin = String(body.pin || "").replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit))).trim();
    if (!/^01[3-9]\d{8}$/.test(phone) || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ ok: false, error: "সঠিক ১১ সংখ্যার মোবাইল নম্বর ও ৪ সংখ্যার পিন দিন" }, { status: 400 });
    }

    const user = getLocalUserByPhoneAndPin(phone, await hashPin(pin));
    if (!user) {
      return NextResponse.json({ ok: false, error: "ফোন নম্বর বা পিন সঠিক নয়" }, { status: 401 });
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
