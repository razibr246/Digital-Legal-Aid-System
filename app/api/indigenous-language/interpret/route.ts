import { NextResponse } from "next/server";
import { interpretSemanticBridge } from "@/lib/agent/semantic-bridge/match-lexicon";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { transcript?: string; language?: "bn" | "marma" | "chakma" };
    const transcript = String(body.transcript || "").trim();
    const language = body.language === "chakma" ? "chakma" : body.language === "marma" ? "marma" : "bn";
    if (!transcript || language === "bn") {
      return NextResponse.json({ ok: false, error: "transcript and an indigenous language are required" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, result: interpretSemanticBridge(transcript, language) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
