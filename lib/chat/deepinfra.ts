import type { ChatAnswer } from "./memory/types";

export const DEEPINFRA_BASE_URL = "https://api.deepinfra.com/v1/openai";

/**
 * Default assistant model. DeepSeek V4 Flash on DeepInfra.
 *
 * NOTE on prompt cache retention: the DeepInfra docs currently list retention
 * support for Nemotron-3-Ultra and Kimi-K2.7-Code only, and state that on other
 * models `prompt_cache_options` is ignored and the request is billed as standard
 * input. The parameters are still sent (they are accepted and ignored), so the
 * moment DeepInfra enables retention for this model the saving starts with no
 * code change. `usage.prompt_tokens_details` is surfaced in the response so the
 * saving is observable rather than assumed.
 */
export const DEFAULT_CHAT_MODEL = "deepseek-ai/DeepSeek-V4-Flash";

/**
 * Shared across all conversations. Retention is scoped to the account plus this
 * key, and reuse also matches on prompt content, so one global key maximises
 * reuse of the stable legal-aid prefix.
 */
export const PROMPT_CACHE_KEY = "dlas-universal-v1";

export const CACHE_TTL = "5m";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

export interface GenerateOptions {
  apiKey: string;
  model?: string;
  messages: ChatMessage[];
  /**
   * Open or extend the retention window. Only send this when deliberately
   * writing the cache: sending a ttl re-bills the write premium, so ordinary
   * reuse must omit it and pay the cheaper cache-read rate.
   */
  openCache?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface GenerateResult {
  content: string;
  usage: ChatAnswer["usage"];
  model: string;
}

interface DeepInfraResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number | null; cache_write_tokens?: number | null };
  };
  error?: { message?: string };
}

export async function generateChatCompletion(
  options: GenerateOptions,
): Promise<GenerateResult> {
  const { apiKey, model = DEFAULT_CHAT_MODEL, messages, openCache, signal } = options;
  if (!apiKey) throw new Error("DEEPINFRA_API_KEY is not configured");

  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 700,
    prompt_cache_key: PROMPT_CACHE_KEY,
  };
  if (openCache) {
    payload.prompt_cache_options = { mode: "explicit", ttl: CACHE_TTL };
  }

  const response = await fetch(`${DEEPINFRA_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  const data = (await response.json().catch(() => null)) as DeepInfraResponse | null;
  if (!response.ok || !data) {
    const detail = data?.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(`DeepInfra request failed: ${detail}`);
  }

  const content = data.choices?.[0]?.message?.content ?? "";
  const details = data.usage?.prompt_tokens_details;

  return {
    content: content.trim(),
    model: data.model || model,
    usage: {
      promptTokens: Number(data.usage?.prompt_tokens ?? 0),
      completionTokens: Number(data.usage?.completion_tokens ?? 0),
      cachedTokens: Number(details?.cached_tokens ?? 0),
      cacheWriteTokens: Number(details?.cache_write_tokens ?? 0),
    },
  };
}
