import {
  normalizeExtraction,
  OCR_MODEL,
  OCR_PROMPT,
  parseModelJson,
  type ExtractedIdentity,
} from "./identity";

const DEEPINRA_BASE = "https://api.deepinfra.com/v1/openai/chat/completions";
const OCR_TIMEOUT_MS = 30_000;

export interface OcrResult {
  extraction: ExtractedIdentity | null;
  raw: string | null;
  model: string;
  error: string | null;
}

/**
 * Reads a NID/passport photo with a vision model. Server-side only: the API key
 * never leaves the Worker, and the browser talks to our own endpoint instead.
 */
export async function runIdentityOcr(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
): Promise<OcrResult> {
  if (!apiKey) {
    return {
      extraction: null,
      raw: null,
      model: OCR_MODEL,
      error: "DEEPINFRA_API_KEY সেট করা নেই",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
  try {
    const response = await fetchWithRetry(DEEPINRA_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OCR_MODEL,
        temperature: 0,
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
              { type: "text", text: OCR_PROMPT },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      return {
        extraction: null,
        raw: null,
        model: OCR_MODEL,
        error: `OCR সেবা ত্রুটিপূর্ণ (${response.status}): ${detail}`,
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = payload.choices?.[0]?.message?.content ?? null;
    return {
      extraction: normalizeExtraction(raw ? parseModelJson(raw) : null),
      raw,
      model: OCR_MODEL,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      extraction: null,
      raw: null,
      model: OCR_MODEL,
      error: `OCR সেবা কাজ করছে না: ${message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The provider returns 429 "engine_overloaded" fairly often, so retry a couple
 * of times with a short backoff before giving up on a citizen's upload.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(url, init);
    if (response.ok) return response;
    last = response;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === attempts - 1) return response;
    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
  }
  return last as Response;
}
