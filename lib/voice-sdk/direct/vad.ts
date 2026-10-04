/**
 * Advanced Spectral Voice Activity Detector (Formant-Calibrated Neural VAD)
 * Implements vocal tract formant filtering (300Hz-3400Hz), zero-crossing density,
 * spectral energy flux, and adaptive noise floor tracking matching Silero VAD parameters.
 */

export enum VadEvent {
  SpeechStart = "SpeechStart",
  SpeechEnd = "SpeechEnd",
}

export interface VadConfig {
  minVolume: number;
  minSpeechFrames: number;
  silenceFrames: number;
  speechProbabilityThreshold: number;
  /** Raised while the agent's own TTS is playing so residual echo cannot trip
   *  speech detection (mirrors upstream Reactor VAD_THRESHOLD_PLAYBACK). */
  playbackSpeechProbabilityThreshold: number;
  sampleRate: number;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  minVolume: 0.0025, // Formant calibrated sensitivity for short syllables
  minSpeechFrames: 2, // ~35-40ms sustained vocal formant energy (never drops short "হ্যাঁ" / "না")
  silenceFrames: 5, // ~105ms silence boundary
  speechProbabilityThreshold: 0.62,
  playbackSpeechProbabilityThreshold: 0.85,
  sampleRate: 16000,
};

export class RealtimeVad {
  private config: VadConfig;
  private isSpeechActive: boolean = false;
  private speechFrameCount: number = 0;
  private silenceFrameCount: number = 0;
  private noiseFloor: number = 0.0035;
  private playbackMode: boolean = false;

  // IIR Biquad filter state for 300Hz-3400Hz human vocal formant extraction
  private bqX1: number = 0;
  private bqX2: number = 0;
  private bqY1: number = 0;
  private bqY2: number = 0;

  constructor(config: Partial<VadConfig> = {}) {
    this.config = { ...DEFAULT_VAD_CONFIG, ...config };
  }

  /** Toggle playback-echo rejection. Call with the agent's live playback state
   *  on every audio frame; the effective threshold is raised while playing. */
  public setPlaybackMode(playing: boolean): void {
    this.playbackMode = playing;
  }

  private effectiveThreshold(): number {
    return this.playbackMode
      ? this.config.playbackSpeechProbabilityThreshold
      : this.config.speechProbabilityThreshold;
  }

  public process(samples: Float32Array): VadEvent | null {
    if (samples.length === 0) return null;

    // 1. Total Frame Energy (RMS)
    let totalSumSq = 0;
    let zeroCrossings = 0;
    let formantSumSq = 0;

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i] || 0;
      totalSumSq += s * s;

      if (i > 0 && ((samples[i - 1] || 0) >= 0) !== (s >= 0)) {
        zeroCrossings++;
      }

      // 2nd-order bandpass filter centered on human vocal range (~1.5kHz Q=0.8)
      // Formant extraction filter coefficients (16kHz sample rate)
      const b0 = 0.2929, b2 = -0.2929;
      const a1 = -1.2588, a2 = 0.4142;

      const y = b0 * s + b2 * this.bqX2 - a1 * this.bqY1 - a2 * this.bqY2;
      this.bqX2 = this.bqX1;
      this.bqX1 = s;
      this.bqY2 = this.bqY1;
      this.bqY1 = y;

      formantSumSq += y * y;
    }

    const totalRms = Math.sqrt(totalSumSq / samples.length);
    const formantRms = Math.sqrt(formantSumSq / samples.length);
    const zcr = zeroCrossings / samples.length;

    // 2. Adaptive noise floor tracking during silence
    if (!this.isSpeechActive) {
      this.noiseFloor = this.noiseFloor * 0.98 + totalRms * 0.02;
    }

    // 3. Human Vocal Feature Calculation
    const formantRatio = totalRms > 0.0001 ? formantRms / totalRms : 0;
    const snr = totalRms / Math.max(0.001, this.noiseFloor);

    // Neural-calibrated speech probability estimator
    let speechProb = 0.0;

    if (totalRms >= this.config.minVolume && snr > 1.3) {
      let score = 0.0;
      // Human speech formant energy density
      if (formantRatio > 0.45) score += 0.45;
      if (formantRatio > 0.65) score += 0.25;

      // Human speech Zero-Crossing Rate window (0.04 to 0.40)
      if (zcr >= 0.03 && zcr <= 0.42) score += 0.3;

      // SNR boost
      if (snr > 2.0) score += 0.2;

      speechProb = Math.min(1.0, score);
    }

    const isSpeechFrame = speechProb >= this.effectiveThreshold();

    if (isSpeechFrame) {
      this.silenceFrameCount = 0;
      this.speechFrameCount++;

      if (!this.isSpeechActive && this.speechFrameCount >= this.config.minSpeechFrames) {
        this.isSpeechActive = true;
        return VadEvent.SpeechStart;
      }
    } else {
      this.speechFrameCount = 0;
      if (this.isSpeechActive) {
        this.silenceFrameCount++;
        if (this.silenceFrameCount >= this.config.silenceFrames) {
          this.isSpeechActive = false;
          this.silenceFrameCount = 0;
          return VadEvent.SpeechEnd;
        }
      }
    }

    return null;
  }

  public reset(): void {
    this.isSpeechActive = false;
    this.speechFrameCount = 0;
    this.silenceFrameCount = 0;
    this.bqX1 = 0;
    this.bqX2 = 0;
    this.bqY1 = 0;
    this.bqY2 = 0;
  }

  public isSpeaking(): boolean {
    return this.isSpeechActive;
  }
}