import { NextResponse } from "next/server";
import { docketStore } from "@/lib/agent/memory/docket-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId") || "session-default";
  const docket = docketStore.getOrCreate(sessionId);
  return NextResponse.json({ docket }, { status: 200 });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sessionId = body.sessionId || "session-default";
    const patch = body.patch || body;
    const docket = docketStore.update(sessionId, patch);
    return NextResponse.json({ ok: true, docket }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
