/**
 * Streaming Speech-to-Text abstraction (engine-agnostic).
 *
 * A live STT engine feeds the DirectSession turn manager through:
 *  - onInterim:  continuously updated non-final transcript (shown live)
 *  - onFinal:    a finalized segment slice (appended to the turn buffer);
 *                utteranceEnd=true marks the caller truly finished the turn
 *  - onClosed:   unexpected disconnect (session may retry/fallback)
 */

export interface UnifiedStt {
  connect(): Promise<void>;
  sendAudio(pcm16: ArrayBuffer): void;
  close(): void;
  sendKeepAlive(): void;
  /** Human-readable engine name for telemetry. */
  readonly engineName: string;
  /** Update language (late config). */
  configure(opts: { language?: string; sampleRate?: number }): void;
}
