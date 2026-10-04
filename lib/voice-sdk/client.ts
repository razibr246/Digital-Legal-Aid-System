/**
 * Legal Voice Agent — Web SDK Client Orchestrator (Cloud Models)
 *
 * Resolves runtime configuration (model ids and voice) from the local
 * /api/voice/config endpoint, merges caller overrides, validates that the
 * server-side prerequisites exist, and drives a DirectSession voice pipeline.
 */

import { DirectSession } from "./direct/direct_session";
import { EventEmitter, SdkConfig, VoiceSession } from "./types";

export interface VoiceRuntimeConfig {
  sttProvider: "soniox";
  sttModel: string;
  llmModel: string;
  llmProxyUrl: string;
  ttsProvider: string;
  ttsVoiceId: string;
  ttsLanguage: string;
  ttsProxyUrl: string;
  ttsProxyLive: boolean;
  ttsProxyError: string | null;
  language: string;
}

const DEFAULT_CONFIG_URL = "/api/voice/config";

export class VoiceAgent implements VoiceSession {
  private emit: EventEmitter;
  private session: DirectSession | null = null;
  private startEpoch: number = 0;

  constructor(emit: EventEmitter) {
    this.emit = emit;
  }

  async start(config: SdkConfig): Promise<void> {
    this.stop();
    const startEpoch = this.startEpoch;

    this.emit({ type: "system", text: "Loading voice runtime config..." });

    const runtime = await this.fetchRuntimeConfig();
    if (startEpoch !== this.startEpoch) return;

    const merged: SdkConfig = {
      ...config,
      sttProvider: "soniox",
      sttModel: config.sttModel ?? runtime.sttModel,
      llmModel: config.llmModel ?? runtime.llmModel,
      llmProxyUrl: config.llmProxyUrl ?? runtime.llmProxyUrl,
      voiceId: config.voiceId ?? runtime.ttsVoiceId,
      ttsProxyUrl: config.ttsProxyUrl ?? runtime.ttsProxyUrl,
      language: config.language ?? runtime.language,
      halfDuplex: config.halfDuplex ?? true,
    };

     if (!merged.ttsProxyUrl) {
       const message = runtime.ttsProxyError
         ? `TTS proxy unavailable: ${runtime.ttsProxyError}`
         : "TTS proxy is not running";
       this.emit({ type: "error", message });
       this.emit({ type: "state_changed", state: "error" });
       throw new Error(message);
     }

    const session = new DirectSession(this.emit);
    this.session = session;
    await session.start(merged);
  }

  stop(): void {
    this.startEpoch += 1;
    if (this.session) {
      this.session.stop();
      this.session = null;
    }
  }

  async sendUserMessage(text: string): Promise<void> {
    if (this.session) {
      await this.session.sendUserMessage(text);
    }
  }

  get sessionId(): string | null {
    return this.session?.sessionId ?? null;
  }

  private async fetchRuntimeConfig(): Promise<VoiceRuntimeConfig> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Voice configuration timed out")), 8000);
    });
    try {
      const res = await Promise.race([
        fetch(DEFAULT_CONFIG_URL, { cache: "no-store" }),
        timeout,
      ]);
      if (!res.ok) {
        throw new Error(`Voice config request failed: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as VoiceRuntimeConfig;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}