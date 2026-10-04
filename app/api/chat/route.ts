import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { answerQuestion, recordTurn } from "@/lib/chat/answer";
import type { ChatTurn } from "@/lib/chat/memory/types";
import type { D1Database } from "@/lib/auth/d1-session";
import type { AppRole, SessionUser } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_QUESTION_LENGTH = 800;
const MAX_HISTORY = 6;

/**
 * The universal assistant is for visitors and citizens only. Staff (DLAO,
 * lawyers, mediators) get their own personalised assistant later; serving them
 * the universal one now would leak citizen-facing answers into case work.
 */
function isUniversalAudience(role: AppRole | null): boolean {
  if (role === null) return true; // visitor, not signed in
  return role === "citizen";
}

async function resolveSessionUser(request: Request): Promise<SessionUser | null> {
  try {
    const cookieHeader = request.headers.get("cookie") || "";
    const token = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("auth_session="))
      ?.slice("auth_session=".length);
    if (!token) return null;

    const ctx = getCloudflareContext() as unknown as { env?: { DB?: D1Database } };
    const { getD1SessionUser } = await import("@/lib/auth/d1-session");
    return await getD1SessionUser(ctx.env?.DB ?? null, token);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const ctx = getCloudflareContext() as unknown as {
    env?: { DB?: unknown; DEEPINFRA_API_KEY?: string };
  };

  const user = await resolveSessionUser(request);
  if (!isUniversalAudience(user?.role ?? null)) {
    return NextResponse.json(
      { ok: false, error: "The universal assistant is for visitors and citizens. Staff use their own assistant." },
      { status: 403 },
    );
  }

  let body: {
    message?: string;
    conversationId?: string;
    history?: ChatTurn[];
    openCache?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const question = String(body.message || "").trim();
  if (!question) {
    return NextResponse.json({ ok: false, error: "একটি প্রশ্ন লিখুন।" }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `প্রশ্নটি ${MAX_QUESTION_LENGTH} অক্ষরের মধ্যে রাখুন।` },
      { status: 400 },
    );
  }

  const apiKey = ctx.env?.DEEPINFRA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "সহায়কটি এখনো কাজ করছে না। ১৬৬৯৯ এ কল করুন।" },
      { status: 503 },
    );
  }

  const history = Array.isArray(body.history)
    ? body.history
        .filter(
          (turn): turn is ChatTurn =>
            Boolean(turn) &&
            (turn.role === "user" || turn.role === "assistant") &&
            typeof turn.content === "string" &&
            turn.content.trim().length > 0,
        )
        .slice(-MAX_HISTORY)
    : [];

  const conversationId =
    String(body.conversationId || "").trim() || `conv-${crypto.randomUUID()}`;

  try {
    const result = await answerQuestion({
      database: ctx.env?.DB,
      apiKey,
      question,
      history,
      userId: user?.id ?? null,
      conversationId,
      openCache: body.openCache === true,
    });

    await recordTurn(ctx.env?.DB, {
      conversationId,
      userId: user?.id ?? null,
      role: "user",
      content: question,
      memoryVersion: result.memoryVersion,
    });
    await recordTurn(ctx.env?.DB, {
      conversationId,
      userId: user?.id ?? null,
      role: "assistant",
      content: result.answer,
      usedWeb: result.usedWeb,
      sources: result.sources,
      memoryVersion: result.memoryVersion,
      cachedTokens: result.usage.cachedTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
    });

    return NextResponse.json({
      ok: true,
      conversationId,
      answer: result.answer,
      usedWeb: result.usedWeb,
      sources: result.sources,
      memoryVersion: result.memoryVersion,
      usage: result.usage,
      audience: user ? "citizen" : "visitor",
    });
  } catch (error) {
    console.error("[api/chat]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "উত্তর দেওয়া যায়নি। ১৬৬৯৯ এ কল করে সাহায্য নিন।",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
