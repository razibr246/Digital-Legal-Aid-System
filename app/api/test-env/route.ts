import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = getCloudflareContext() as unknown as {
      env?: { DEBUG_ENDPOINTS?: string };
    };

    if (ctx.env?.DEBUG_ENDPOINTS !== "1") {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, env: Object.keys(ctx.env) });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
