/**
 * Server startup hook: boots the local TTS WebSocket proxy so the browser voice
 * pipeline never has to hold a cloud TTS secret. Provider is env-driven:
 * "soniox" (default, native Bengali via Soniox tts-rt-v2) or "deepgram".
 *
 * Fault-tolerant by design: proxy startup failure must never crash or wedge the
 * Next.js server — it only marks the TTS route as unavailable (the STT + LLM
 * halves of the pipeline still function and the UI reports the exact state).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  try {
    const { startTtsProxy } = await import("./server/tts-proxy");
    const preferredPort = Number(process.env.TTS_PROXY_PORT ?? 8200);
    const provider = (process.env.TTS_PROVIDER ?? "soniox") === "deepgram" ? "deepgram" : "soniox";
    const apiKey =
      provider === "soniox"
        ? (process.env.SONIOX_API_KEY ?? "")
        : (process.env.DEEPGRAM_API_KEY ?? "");
    if (!apiKey) {
        
      console.warn(`[tts-proxy] ${provider === "soniox" ? "SONIOX_API_KEY" : "DEEPGRAM_API_KEY"} missing — TTS proxy not started`);
      return;
    }
    startTtsProxy(preferredPort, {
      provider,
      apiKey,
      voice: provider === "soniox"
        ? (process.env.TTS_VOICE_ID ?? "Priya")
        : (process.env.TTS_VOICE_ID ?? "aura-2-thalia-en"),
      language: provider === "soniox" ? "bn" : (process.env.TTS_LANGUAGE ?? "en"),
      model: "tts-rt-v2",
    });
  } catch (err) {
     
    console.error(`[tts-proxy] instrumentation failed to start proxy: ${String(err)}`);
  }
}