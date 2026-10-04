import { NextResponse } from "next/server";
import { runLegalAgentSession } from "@/lib/agent/core/agent-engine";
import { type ModelMessage } from "ai";
import type { SessionUser } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Agentic Voice LLM Route (Vercel AI SDK Core)
 *
 * Runs the multi-step legal reasoning loop with tool calling and in-memory
 * docket slot-filling, while streaming tokens in real-time to the voice pipeline.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
     const sessionId = (body.sessionId as string) || "session-default";
     const messages = (body.messages as ModelMessage[]) || [];
     const authenticatedUser = (body.authenticatedUser as SessionUser | null) || null;
     const indigenousLanguage = body.indigenousLanguage === "marma" || body.indigenousLanguage === "chakma" ? body.indigenousLanguage : "bn";

     const agentStream = await runLegalAgentSession({
       sessionId,
       messages,
         authenticatedUser,
         indigenousLanguage,
       });


    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const part of agentStream.fullStream) {
            if (part.type === "text-delta") {
              const sseChunk = `data: ${JSON.stringify({
                choices: [{ delta: { content: part.text } }],
              })}\n\n`;
              controller.enqueue(encoder.encode(sseChunk));
            } else if (part.type === "tool-call") {
              const toolSse = `data: ${JSON.stringify({
                choices: [{ delta: { content: "" } }],
                tool_call: { name: part.toolName, input: part.input },
              })}\n\n`;
              controller.enqueue(encoder.encode(toolSse));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("[api/llm] Agentic execution error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(
    { ok: true, agent: "LegalAidVoiceAgentCore", engine: "Vercel AI SDK v7" },
    { status: 200 },
  );
}