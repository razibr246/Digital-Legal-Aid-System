import { generateChatCompletion, DEFAULT_CHAT_MODEL } from "./deepinfra";
import { getCoreFacts, searchFacts, asChatDatabase, getMemoryVersion } from "./memory/store";
import { buildChatMessages } from "./prompt";
import {
  defaultWebSearchProvider,
  isLegalAidScope,
  type WebSearchProvider,
} from "./search";
import type { ChatAnswer, ChatTurn, MemoryBlock, WebSource } from "./memory/types";

/**
 * Decides whether memory alone can answer, or whether we must search the web.
 *
 * Deliberately deterministic rather than model-driven: tool-calling behaviour on
 * DeepSeek V4 Flash was unreliable in testing (it answered from its own
 * knowledge instead of calling the tool), and a hallucinated 16430 helpline is
 * worse than an honest "call 16699". A cheap heuristic gate keeps cost and
 * latency predictable.
 */
export function needsWebSearch(input: {
  question: string;
  memory: MemoryBlock;
  provider?: WebSearchProvider;
}): boolean {
  const { question, memory } = input;

  // Never search for anything outside the legal aid remit.
  if (!isLegalAidScope(question)) return false;

  // A confident memory hit with substantive text does not need the open web.
  const strongHit = memory.retrieved.some((fact) => fact.body.trim().length >= 180);
  if (strongHit) return false;

  // Explicit requests for current or externally-sourced facts.
  if (/(সর্বশেষ|সাম্প্রতিক|এখন|আজ|latest|current|recent|news|update)/i.test(question)) {
    return true;
  }

  // Specific, checkable facts that memory is unlikely to hold.
  if (/(কত টাকা|ফি|সময়|তারিখ|deadline|fee|cost|how much|how long|form|ফরম|ঠিকানা)/i.test(question)) {
    return true;
  }

  // Nothing relevant in memory at all.
  return memory.retrieved.length === 0;
}

export interface AnswerOptions {
  database: unknown;
  apiKey: string;
  question: string;
  history?: ChatTurn[];
  userId?: string | null;
  conversationId?: string | null;
  openCache?: boolean;
  model?: string;
  provider?: WebSearchProvider;
  signal?: AbortSignal;
}

export async function answerQuestion(options: AnswerOptions): Promise<ChatAnswer> {
  const { database, apiKey, question, history = [], openCache, signal } = options;
  const db = asChatDatabase(database);

  const version = db ? await getMemoryVersion(db) : 1;
  const core = db ? await getCoreFacts(db) : [];
  const retrieved = db ? await searchFacts(db, question) : [];
  const memory: MemoryBlock = { version, core, retrieved };

  let webResults: WebSource[] = [];
  let usedWeb = false;
  if (needsWebSearch({ question, memory, provider: options.provider })) {
    const provider = options.provider ?? defaultWebSearchProvider;
    webResults = await provider.search(question, 4);
    usedWeb = webResults.length > 0;
  }

  const messages = buildChatMessages({
    memory,
    history,
    question,
    webResults: usedWeb ? webResults : undefined,
  });

  const completion = await generateChatCompletion({
    apiKey,
    model: options.model ?? DEFAULT_CHAT_MODEL,
    messages,
    openCache,
    signal,
  });

  return {
    answer: completion.content,
    usedWeb,
    sources: usedWeb ? webResults : [],
    memoryIds: [...core, ...retrieved].map((fact) => fact.id),
    memoryVersion: version,
    usage: completion.usage,
  };
}

export async function recordTurn(
  database: unknown,
  entry: {
    conversationId: string;
    userId: string | null;
    role: "user" | "assistant";
    content: string;
    usedWeb?: boolean;
    sources?: WebSource[];
    memoryVersion?: number;
    cachedTokens?: number;
    cacheWriteTokens?: number;
  },
): Promise<void> {
  const db = asChatDatabase(database);
  if (!db || !entry.content) return;
  try {
    await db
      .prepare(
        `INSERT INTO chat_messages
          (id, conversation_id, user_id, role, content, used_web, sources_json,
           memory_version, cached_tokens, cache_write_tokens)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `CM-${crypto.randomUUID()}`,
        entry.conversationId,
        entry.userId,
        entry.role,
        entry.content,
        entry.usedWeb ? 1 : 0,
        entry.sources?.length ? JSON.stringify(entry.sources) : null,
        entry.memoryVersion ?? null,
        entry.cachedTokens ?? null,
        entry.cacheWriteTokens ?? null,
      )
      .run();
  } catch {
    // Logging must never break the answer.
  }
}
