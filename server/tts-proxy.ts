/**
 * Local WebSocket TTS proxy (server-side) with provider abstraction.
 *
 * The browser never holds a TTS secret: it opens a WS to this local proxy with
 * a Deepgram-like control protocol ({type:"Speak"|"Flush"|"Clear"} text frames
 * in, raw PCM16 24kHz binary frames + {"type":"Flushed"} acks out). The proxy
 * terminates that connection locally and relays to the authoritative upstream.
 *
 * Providers (env TTS_PROVIDER):
 *   - "soniox"  (default): real-time multilingual TTS, native Bengali (bn).
 *                wss://tts-rt.soniox.com/tts-websocket ; api_key travels in the
 *                WS config message. Soniox returns base64 audio in JSON, which
 *                the proxy decodes to the same binary frames the browser expects.
 *   - "deepgram": classic binary pass-through to Deepgram Speak (English).
 *
 * Stability contract (unchanged, stress-tested):
 *  - Binds on the preferred port but falls back to an ephemeral port if the
 *    preferred one is occupied, so a restart can never wedge the pipeline.
 *  - The actual bound port + readiness live on globalThis (Next Turbopack can
 *    instantiate this module twice) and are served via /api/voice/config.
 *  - Never throws. Upstream failures (e.g. Soniox 402 balance exhausted) are
 *    forwarded to the client as a readable error then the stream closes — the
 *    SDK surfaces them instead of hanging.
 *  - Force-closes clients and hard-exits on SIGINT/SIGTERM so stop/restart is
 *    always clean.
 */

import { randomUUID } from "node:crypto";
import WebSocket, { WebSocketServer } from "ws";

const BUILD_ID_SIZE = 5000; // Soniox max text per message; we chunk below it.

export interface TtsProxyInfo {
  port: number;
  ready: boolean;
  error?: string;
}

export interface TtsProxyConfig {
  provider: "soniox" | "deepgram";
  apiKey: string;
  voice: string;
  language: string;
  model: string;
}

/**
 * Shared registry. Next.js dev/Turbopack can instantiate this module twice
 * (once for the instrumentation graph, once for the route-handler graph), so
 * the proxy state must live on globalThis to stay observable everywhere.
 */
const STATE_KEY = Symbol.for("__legalVoiceAgentTtsProxyState");

interface ProxyState {
  started: boolean;
  info: TtsProxyInfo;
  wss: WebSocketServer | null;
}

function getState(): ProxyState {
  const g = globalThis as unknown as Record<symbol, ProxyState | undefined>;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = { started: false, info: { port: 0, ready: false }, wss: null };
  }
  return g[STATE_KEY] as ProxyState;
}

export function getTtsProxyInfo(): TtsProxyInfo {
  return { ...getState().info };
}

export function isProxyReady(): boolean {
  return getState().info.ready;
}

function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function chunkText(text: string, max = BUILD_ID_SIZE): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    parts.push(remaining.slice(0, max));
    remaining = remaining.slice(max);
  }
  return parts;
}

/**
 * Soniox real-time TTS upstream adapter.
 * Speaks the browser's "binary audio + Flushed" protocol: decodes base64 chunks
 * to raw PCM16 and ack-flushes once the server terminates each utterance stream.
 * Supports multi-turn conversations, barge-in cancellation on Clear, and dynamic voice/language.
 */
function sonioxUpstream(clientWs: WebSocket, cfg: TtsProxyConfig, reqUrl?: string): void {
  let voice = cfg.voice;
  const language = "bn";
  try {
    if (reqUrl) {
      const parsed = new URL(reqUrl, "http://127.0.0.1");
      const m = parsed.searchParams.get("model");
      if (m) voice = m;
    }
  } catch {}

  const up = new WebSocket("wss://tts-rt.soniox.com/tts-websocket");
  let upstreamOpen = false;
  const upstreamQueue: Array<Record<string, unknown>> = [];
  let currentStreamId: string | null = null;
  let streamEnded = false;
  let flushSent = false;

  const sendUp = (json: Record<string, unknown>): void => {
    if (!upstreamOpen || up.readyState !== WebSocket.OPEN) {
      upstreamQueue.push(json);
      return;
    }
    up.send(JSON.stringify(json));
  };

  const fail = (message: string): void => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: "error", message }));
      clientWs.close(1011, message.slice(0, 120));
    }
  };

  up.on("open", () => {
    upstreamOpen = true;
    for (const m of upstreamQueue.splice(0)) {
      if (up.readyState === WebSocket.OPEN) up.send(JSON.stringify(m));
    }
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: "ProxyConnected" }));
    }
  });

  up.on("message", (data) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (clientWs.readyState !== WebSocket.OPEN) return;

    if (typeof msg.error_code !== "undefined") {
      const detail = String(msg.error_type ?? "error") + ": " + String(msg.error_message ?? "");
      console.warn(`[tts-proxy] Soniox upstream error: ${detail}`);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", message: detail }));
      }
      return;
    }

    if (msg.stream_id === currentStreamId) {
      if (typeof msg.audio === "string") {
        const pcm = Buffer.from(msg.audio, "base64");
        if (pcm.length > 0 && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(pcm, { binary: true });
        }
      }

      if (msg.audio_end === true || msg.terminated === true) {
        currentStreamId = null;
        streamEnded = false;
        if (clientWs.readyState === WebSocket.OPEN && !flushSent) {
          flushSent = true;
          clientWs.send(JSON.stringify({ type: "Flushed" }));
        }
      }
    }
  });

  up.on("error", (err) => {
    console.error("[tts-proxy] Soniox TTS upstream error:", err);
    fail("Soniox TTS upstream error");
  });

  up.on("close", (code, reason) => {
    const r = reason ? reason.toString() : "";
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: "error", message: `TTS upstream closed (${code}: ${r})` }));
      clientWs.close(1000);
    }
  });

  clientWs.on("message", (data) => {
    const raw = typeof data === "string" ? data : data.toString("utf8");
    let req: { type?: string; text?: string };
    try {
      req = JSON.parse(raw);
    } catch {
      return;
    }

    if (req.type === "Speak" && typeof req.text === "string") {
      const clean = req.text.trim();
      if (!clean) return;

      if (!currentStreamId || streamEnded) {
        currentStreamId = `lva-${randomUUID()}`;
        streamEnded = false;
        flushSent = false;
        sendUp({
          api_key: cfg.apiKey,
          stream_id: currentStreamId,
          model: cfg.model,
          language,
          voice,
          audio_format: "pcm_s16le",
          sample_rate: 24000,
        });
      }

      for (const part of chunkText(clean)) {
        sendUp({ stream_id: currentStreamId, text: part, text_end: false });
      }
    } else if (req.type === "Flush") {
      if (currentStreamId && !streamEnded) {
        streamEnded = true;
        sendUp({ stream_id: currentStreamId, text: "", text_end: true });
      } else {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: "Flushed" }));
        }
      }
    } else if (req.type === "Clear") {
      if (currentStreamId) {
        if (up.readyState === WebSocket.OPEN) {
          try {
            up.send(JSON.stringify({ stream_id: currentStreamId, cancel: true }));
          } catch {}
        }
        currentStreamId = null;
        streamEnded = false;
        flushSent = false;
      }
    }
  });

  clientWs.on("close", () => {
    if (currentStreamId && up.readyState === WebSocket.OPEN) {
      try {
        up.send(JSON.stringify({ stream_id: currentStreamId, cancel: true }));
      } catch {}
    }
    if (up.readyState === WebSocket.OPEN) {
      try {
        up.close();
      } catch {}
    }
  });

  clientWs.on("error", () => {
    if (currentStreamId && up.readyState === WebSocket.OPEN) {
      try {
        up.send(JSON.stringify({ stream_id: currentStreamId, cancel: true }));
      } catch {}
    }
    if (up.readyState === WebSocket.OPEN) {
      try {
        up.close();
      } catch {}
    }
  });
}

/**
 * Deepgram Speak upstream adapter (English TTS, binary pass-through).
 */
function deepgramUpstream(clientWs: WebSocket, cfg: TtsProxyConfig): void {
  const url = new URL("wss://api.deepgram.com/v1/speak");
  url.searchParams.set("model", cfg.voice);
  url.searchParams.set("encoding", "linear16");
  url.searchParams.set("sample_rate", "24000");

  const up = new WebSocket(url.toString(), {
    headers: { Authorization: `Token ${cfg.apiKey}` },
    perMessageDeflate: false,
  });

  const upstreamQueue: Array<{ data: WebSocket.RawData; isBinary: boolean }> = [];
  let upstreamOpen = false;

  const forward = (data: WebSocket.RawData, isBinary: boolean): void => {
    if (!upstreamOpen) {
      upstreamQueue.push({ data, isBinary });
      return;
    }
    if (up.readyState === WebSocket.OPEN) up.send(data, { binary: isBinary });
  };

  up.on("open", () => {
    upstreamOpen = true;
    for (const pending of upstreamQueue.splice(0)) {
      if (up.readyState === WebSocket.OPEN) up.send(pending.data, { binary: pending.isBinary });
    }
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: "ProxyConnected" }));
    }
  });

  up.on("message", (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary });
  });

  up.on("error", () => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: "error", message: "Deepgram TTS upstream error" }));
      clientWs.close(1011);
    }
  });
  up.on("close", () => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1000);
  });

  clientWs.on("message", (data, isBinary) => forward(data, isBinary));
  clientWs.on("close", () => {
    if (up.readyState === WebSocket.OPEN) up.close();
  });
  clientWs.on("error", () => {
    if (up.readyState === WebSocket.OPEN) up.close();
  });
}

function bind(preferredPort: number, cfg: TtsProxyConfig): void {
  const state = getState();
  const server = new WebSocketServer({ host: "127.0.0.1", port: preferredPort, path: "/v1/tts" });
  state.wss = server;

  server.on("listening", () => {
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : preferredPort;
    state.info = { port, ready: true };
    console.log(`[tts-proxy] ${cfg.provider} listening on ws://127.0.0.1:${port}/v1/tts (key length: ${cfg.apiKey?.length}, voice: ${cfg.voice})`);
  });

  server.on("error", (err) => {
    const isAddrInUse = (err as NodeJS.ErrnoException).code === "EADDRINUSE";
    if (isAddrInUse && preferredPort !== 0) {
      try {
        server.close();
      } catch {}
      bind(0, cfg);
      return;
    }
    state.info = {
      ...state.info,
      ready: false,
      error:
        isAddrInUse
          ? `TTS proxy port ${preferredPort} still in use after retry`
          : `TTS proxy failed: ${String(err)}`,
    };
    console.error(`[tts-proxy] error: ${state.info.error}`);
  });

  server.on("connection", (clientWs, req) => {
    if (!isLocalOrigin(req.headers.origin)) {
      clientWs.close(4403, "origin not allowed");
      return;
    }
    if (cfg.provider === "soniox") sonioxUpstream(clientWs, cfg, req.url);
    else deepgramUpstream(clientWs, cfg);
  });
}

export function startTtsProxy(
  preferredPort: number,
  cfg: TtsProxyConfig | null,
): TtsProxyInfo {
  const state = getState();
  if (state.started) {
    return getTtsProxyInfo();
  }
  state.started = true;
  state.info = { port: preferredPort, ready: false };

  const shutdown = () => {
    try {
      const s = state.wss;
      if (s) {
        for (const client of s.clients) {
          try {
            client.close(1001, "server shutdown");
          } catch {}
        }
        s.close(() => {});
      }
      state.wss = null;
      state.started = false;
    } catch {}
    const hardExit = setTimeout(() => process.exit(0), 500);
    hardExit.unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  if (!cfg || !cfg.apiKey) {
    state.info = {
      port: preferredPort,
      ready: false,
      error: `TTS proxy start failed: missing API key for provider "${cfg?.provider ?? "unknown"}"`,
    };
    return getTtsProxyInfo();
  }

  try {
    bind(preferredPort, cfg);
  } catch (err) {
    state.info = {
      port: preferredPort,
      ready: false,
      error: `TTS proxy start failed: ${String(err)}`,
    };
  }

  return getTtsProxyInfo();
}
