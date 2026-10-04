import { NextResponse } from "next/server";
import { getTtsProxyInfo } from "@/server/tts-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runtime voice configuration for the browser SDK.
 *
 * Delivers non-secret provider defaults at runtime. Soniox credentials remain
 * server-side and are injected by the same-origin STT/TTS WebSocket proxies.
 *
 * The TTS proxy URL is derived from the *actually listening* socket (the proxy
 * falls back to an ephemeral port when the preferred port is busy), so the
 * browser never targets a stale port after a restart.
 */
export async function GET(req: Request) {
  const proxy = getTtsProxyInfo();
  const provider = (process.env.TTS_PROVIDER ?? "soniox") === "deepgram" ? "deepgram" : "soniox";

  const reqHost = req.headers.get("host") || "";
  const isCloudflare =
    reqHost.includes(".workers.dev") ||
    reqHost.includes(".pages.dev") ||
    (Boolean(reqHost) && !reqHost.includes("localhost") && !reqHost.includes("127.0.0.1"));

  const ttsProxyUrl = isCloudflare
    ? `wss://${reqHost}/v1/tts`
    : proxy.ready
      ? process.env.TTS_PROXY_URL ?? `ws://${process.env.TTS_PROXY_HOST ?? "127.0.0.1"}:${proxy.port}/v1/tts`
      : "";

  const ttsProxyLive = isCloudflare ? true : proxy.ready;

  return NextResponse.json({
    sttProvider: "soniox",
    sttModel: process.env.STT_MODEL ?? "stt-rt-v5",
    llmModel: process.env.LLM_MODEL ?? "openai/gpt-oss-120b",
    llmProxyUrl: process.env.LLM_PROXY_URL ?? "/api/llm",
    ttsProvider: provider,
    ttsVoiceId: process.env.TTS_VOICE_ID ?? (provider === "soniox" ? "Priya" : "aura-2-thalia-en"),
    ttsLanguage: provider === "soniox" ? "bn" : "en",
    ttsProxyUrl,
    ttsProxyLive,
    ttsProxyError: proxy.error ?? null,
    language: "bn",
  });

}