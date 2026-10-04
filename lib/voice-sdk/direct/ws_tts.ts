/**
 * Persistent Streaming WebSocket TTS Client (Deepgram Aura-2 via local proxy)
 * Sub-100ms Time-To-First-Audio (TTFA) with continuous full-duplex binary audio streaming.
 *
 * Cloud-only port: the browser never holds the Deepgram key. Audio is produced by
 * Deepgram Aura-2, but the WebSocket is terminated by a local proxy (server-side)
 * which owns the key and forwards the Speak/Flush/Clear protocol verbatim.
 */

export class DeepgramWsTts {
  private ws: WebSocket | null = null;
  private voiceId: string;
  private language: string;
  private proxyUrl: string;
  private isConnected: boolean = false;
  private connectPromise: Promise<void> | null = null;
  private onAudioChunkCallback: ((pcm16Buffer: ArrayBuffer) => void) | null = null;
  private onFlushCallback: (() => void) | null = null;
  private flushResolvers: Array<() => void> = [];
  private hasUnconsumedFlush: boolean = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSpeech: string[] = [];
  private pendingFlush: boolean = false;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(proxyUrl: string, voiceId: string = "Priya", language: string = "bn") {
    this.proxyUrl = proxyUrl.replace(/\/+$/, "");
    this.voiceId = voiceId;
    this.language = language;
  }

  public connect(): Promise<void> {
    if (this.ws && this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const finish = () => {
        if (this.connectTimer) {
          clearTimeout(this.connectTimer);
          this.connectTimer = null;
        }
      };

      try {
        const url =
          `${this.proxyUrl}?model=${encodeURIComponent(this.voiceId)}` +
          `&language=${encodeURIComponent(this.language)}` +
          `&encoding=linear16&sample_rate=24000`;
        const ws = new WebSocket(url);
        this.ws = ws;
        ws.binaryType = "arraybuffer";

        this.connectTimer = setTimeout(() => {
          try {
            ws.close();
          } catch {}
          this.connectPromise = null;
          reject(
            new Error(
              `TTS proxy connect timed out (${this.proxyUrl}). Is the server running?`,
            ),
          );
        }, 5000);

        ws.onopen = () => {
          this.isConnected = true;
          this.connectPromise = null;
          finish();
          resolve();
        };

        ws.onmessage = (evt) => {
          if (evt.data instanceof ArrayBuffer) {
            // Binary audio chunk streamed through the proxy from Soniox/Deepgram
            if (this.onAudioChunkCallback && evt.data.byteLength > 0) {
              this.onAudioChunkCallback(evt.data);
            }
          } else if (typeof evt.data === "string") {
            try {
              const msg = JSON.parse(evt.data) as { type?: string };
              if (msg.type === "Flushed") {
                if (this.onFlushCallback) {
                  this.onFlushCallback();
                }
                if (this.flushResolvers.length > 0) {
                  for (const r of this.flushResolvers.splice(0)) {
                    r();
                  }
                } else {
                  this.hasUnconsumedFlush = true;
                }
              }
            } catch {}
          }
        };

        ws.onerror = () => {
          if (!this.isConnected) {
            finish();
            this.connectPromise = null;
            reject(new Error(`TTS proxy connection failed (${this.proxyUrl})`));
          }
        };

        ws.onclose = () => {
          finish();
          this.connectPromise = null;
          if (!this.isConnected) {
            reject(new Error(`TTS proxy closed before handshake (${this.proxyUrl})`));
          }
          this.isConnected = false;
          this.ws = null;
          if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
          }
          for (const r of this.flushResolvers.splice(0)) {
            r();
          }
        };
      } catch (e) {
        finish();
        this.connectPromise = null;
        reject(e);
      }
    });

    return this.connectPromise;
  }

  /** Wait for the server to finish audio synthesis and send the Flushed signal */
  public waitForFlush(timeoutMs = 7000): Promise<void> {
    if (this.hasUnconsumedFlush) {
      this.hasUnconsumedFlush = false;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          const idx = this.flushResolvers.indexOf(done);
          if (idx >= 0) this.flushResolvers.splice(idx, 1);
          resolve();
        }
      };
      this.flushResolvers.push(done);
      setTimeout(done, timeoutMs);
    });
  }

  /** Connection-level keepalive between streams */
  public sendKeepAlive(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "KeepAlive" }));
      } catch {}
    }
  }

  /** Speaks immediately if connected; otherwise connects once and drains queued chunks */
  public async speakWhenReady(text: string): Promise<void> {
    const clean = text.trim();
    if (!clean) return;
    this.pendingSpeech.push(clean);

    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isConnected) {
      const queued = this.pendingSpeech.splice(0);
      for (const t of queued) this.speak(t);
      if (this.pendingFlush) {
        this.pendingFlush = false;
        this.flush();
      }
      return;
    }

    try {
      await this.connect();
    } catch {
      this.pendingSpeech = [];
      this.pendingFlush = false;
      return;
    }

    const queued = this.pendingSpeech.splice(0);
    for (const t of queued) this.speak(t);
    if (this.pendingFlush) {
      this.pendingFlush = false;
      this.flush();
    }
  }

  public setOnAudioChunk(cb: (pcm16Buffer: ArrayBuffer) => void) {
    this.onAudioChunkCallback = cb;
  }

  public setOnFlush(cb: () => void) {
    this.onFlushCallback = cb;
  }

  public speak(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const clean = text.trim();
    if (clean.length === 0) return;
    this.ws.send(JSON.stringify({ type: "Speak", text: clean }));
  }

  public flush() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.pendingSpeech.length > 0) {
      this.pendingFlush = true;
      return;
    }
    this.hasUnconsumedFlush = false;
    this.pendingFlush = false;
    this.ws.send(JSON.stringify({ type: "Flush" }));
  }

  public clear() {
    this.pendingSpeech = [];
    this.pendingFlush = false;
    this.hasUnconsumedFlush = false;
    for (const r of this.flushResolvers.splice(0)) {
      r();
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "Clear" }));
  }

  public close() {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    this.pendingSpeech = [];
    this.pendingFlush = false;
    this.hasUnconsumedFlush = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
      this.isConnected = false;
    }
  }
}