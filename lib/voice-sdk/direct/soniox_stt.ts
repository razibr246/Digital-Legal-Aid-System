/**
 * Soniox Real-Time Speech-to-Text (wss://stt-rt.soniox.com/transcribe-websocket)
 *
 * Connected through a same-origin proxy (/v1/stt) that injects the SONIOX_API_KEY
 * server-side, so the browser never holds the credential.
 *
 * Wire-verified stream semantics (probed empirically):
 *  - Each JSON response replays every non-final token of the current segment.
 *  - When a token finalizes it is marked is_final=true once (sent in one
 *    response), afterwards the server drops it from the replay window.
 *  - Endpoint detection appends a special "<end>" final token; manual
 *    finalization returns "<fin>".
 *  - When no audio flows (greeting playback, IVR DTMF wait) the session needs
 *    {"type":"keepalive"} control messages or upstream times it out (408).
 */

import type { UnifiedStt } from "./stt_types";

interface SonioxToken {
  text?: string;
  start_ms?: number;
  end_ms?: number;
  is_final?: boolean;
}

interface SonioxResponse {
  tokens?: SonioxToken[];
  error_code?: number;
  error_message?: string;
  finished?: boolean;
}

export type SonioxSttCallbacks = {
  onInterim: (text: string) => void;
  onFinal: (text: string, utteranceEnd: boolean) => void;
  onClosed: (code: number, reason: string) => void;
};

export class SonioxStt implements UnifiedStt {
  readonly engineName = "soniox";
  private ws: WebSocket | null = null;
  private proxyUrl: string;
  private language: string;
  private sampleRate: number;
  private cb: SonioxSttCallbacks;
  private committedKeys = new Set<string>();
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Manual-finalization idle timer: Soniox semantic endpointing withholds
   *  processing of the last ~3s of audio (its revision window) and may never
   *  emit <end> once the caller goes truly silent. If no fresh tokens arrive
   *  for 2000ms while a turn is buffered, we send {"type":"finalize"} to
   *  force-close the segment (<fin>). */
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private finalizedAll: boolean = false;

  constructor(
    proxyUrl: string,
    cb: SonioxSttCallbacks,
    opts: { language?: string; sampleRate?: number } = {},
  ) {
    this.proxyUrl = proxyUrl.replace(/\/+$/, "");
    this.cb = cb;
    this.language = "bn";
    this.sampleRate = opts.sampleRate || 16000;
  }

  public configure(opts: { language?: string; sampleRate?: number }): void {
    if (opts.sampleRate) this.sampleRate = opts.sampleRate;
  }

  public connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    this.committedKeys.clear();

    return new Promise<void>((resolve, reject) => {
      const finish = () => {
        if (this.connectTimer) {
          clearTimeout(this.connectTimer);
          this.connectTimer = null;
        }
      };
      try {
        const ws = new WebSocket(`${this.proxyUrl}?language=${encodeURIComponent(this.language)}&sample_rate=${this.sampleRate}`);
        this.ws = ws;

        this.connectTimer = setTimeout(() => {
          try { ws.close(); } catch {}
          reject(new Error("Soniox STT proxy connect timeout"));
        }, 5000);

        ws.onopen = () => {
          finish();
          resolve();
        };

        ws.onmessage = (evt) => {
          if (typeof evt.data !== "string") return;
          let msg: SonioxResponse;
          try {
            msg = JSON.parse(evt.data) as SonioxResponse;
          } catch {
            return;
          }
          this.processResponse(msg);
        };

        ws.onerror = () => {
          finish();
          // Closed-before-open surfaced via onclose/reject below.
          if (ws.readyState === WebSocket.CLOSED) reject(new Error("Soniox STT proxy error"));
        };

        ws.onclose = (evt) => {
          finish();
          if (ws.readyState === WebSocket.CONNECTING) {
            reject(new Error(`Soniox STT proxy closed before handshake (${evt.code})`));
          }
          this.ws = null;
          this.cb.onClosed(evt.code, evt.reason || "");
        };
      } catch (err) {
        finish();
        reject(err);
      }
    });
  }

  /**
   * The session config (model, api_key, endpointing) is injected server-side by
   * the /v1/stt proxy, so the browser never sends or holds it.
   */
  private ensureConfig() {
    // no-op: kept for call-site symmetry
  }

  public sendAudio(pcm16: ArrayBuffer): void {
    this.ensureConfig();
    if (this.ws && this.ws.readyState === WebSocket.OPEN && pcm16.byteLength > 0) {
      this.ws.send(pcm16);
    }
  }

  public sendKeepAlive(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "keepalive" }));
      } catch {}
    }
  }

  private processResponse(msg: SonioxResponse): void {
    if (msg.error_code !== undefined) {
      console.warn("[SonioxStt] upstream error:", msg.error_code, msg.error_message);
      return;
    }

    const tokens = msg.tokens || [];
    if (tokens.length > 0) {
      this.armIdleFinalize();
      let lastTime = 0;
      for (const tok of tokens) {
        const isEnd = tok.text === "<end>" || tok.text === "<fin>";
        if (isEnd) { lastTime = tok.end_ms ?? lastTime; continue; }
        lastTime = tok.end_ms ?? lastTime;
      }
      void lastTime;
    }

    let interim = "";
    let finalSlice = "";
    let sawEnd = false;

    for (const tok of tokens) {
      const text = tok.text || "";
      if (text === "<end>") {
        sawEnd = true;
        continue;
      }
      if (text === "<fin>") {
        sawEnd = true;
        this.finalizedAll = true;
        continue;
      }
      if (tok.is_final) {
        const key = `${tok.start_ms ?? -1}`;
        if (!this.committedKeys.has(key)) {
          this.committedKeys.add(key);
          finalSlice += text;
        }
      } else {
        interim += text;
      }
    }

    if (interim.length > 0) {
      this.cb.onInterim(interim.trim());
    }
    if (finalSlice.trim().length > 0) {
      this.cb.onFinal(finalSlice.trim(), false);
    }
    if (sawEnd) {
      // Endpoint reached: the whole buffered turn is committed — hand it over.
      this.cancelIdleFinalize();
      this.cb.onFinal("", true);
    }
    if (msg.finished) {
      // Graceful stream end; treat as turn end too.
      this.cancelIdleFinalize();
      this.cb.onFinal("", true);
    }
  }

  private armIdleFinalize(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.ws && this.ws.readyState === WebSocket.OPEN && !this.finalizedAll) {
        try {
          this.ws.send(JSON.stringify({ type: "finalize" }));
        } catch {}
      }
    }, 1400);
  }

  private cancelIdleFinalize(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /** Clears per-turn commit bookkeeping (called after a turn is flushed). */
  public resetTurnBuffer(): void {
    this.cancelIdleFinalize();
    this.finalizedAll = false;
  }

  public close(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}
