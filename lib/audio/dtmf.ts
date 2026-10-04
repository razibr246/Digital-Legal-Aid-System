/**
 * Web Audio DTMF (Dual-Tone Multi-Frequency) Synthesizer & Telephony Sound Effects
 * Generates standard ITU-T telephony tones for keys 0-9, *, #,
 * plus ringback, call end, and transfer signals.
 */

const DTMF_FREQS: Record<string, [number, number]> = {
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  "*": [941, 1209],
  "0": [941, 1336],
  "#": [941, 1477],
};

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx || audioCtx.state === "closed") {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioCtxClass();
    }
    if (audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Play a standard ITU-T dual-frequency DTMF keypad tone.
 */
export function playDtmfTone(key: string, durationMs = 120): void {
  const freqs = DTMF_FREQS[key];
  if (!freqs) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const [lowFreq, highFreq] = freqs;
    const now = ctx.currentTime;

    const oscLow = ctx.createOscillator();
    const oscHigh = ctx.createOscillator();
    const gain = ctx.createGain();

    oscLow.type = "sine";
    oscLow.frequency.setValueAtTime(lowFreq, now);

    oscHigh.type = "sine";
    oscHigh.frequency.setValueAtTime(highFreq, now);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

    oscLow.connect(gain);
    oscHigh.connect(gain);
    gain.connect(ctx.destination);

    oscLow.start(now);
    oscHigh.start(now);

    oscLow.stop(now + durationMs / 1000);
    oscHigh.stop(now + durationMs / 1000);
  } catch (err) {
    console.warn("DTMF tone generation failed:", err);
  }
}

/**
 * Play a standard telephony ringback tone ("Tring... Tring...")
 * Simulates network connection establishment before the IVR agent answers.
 */
export function playRingbackTone(durationMs = 1200): Promise<void> {
  return new Promise((resolve) => {
    const ctx = getAudioContext();
    if (!ctx) {
      setTimeout(resolve, durationMs);
      return;
    }

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(400, now);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(450, now);

      // Ring envelope (ring 0.4s, quiet 0.2s, ring 0.4s)
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.setValueAtTime(0.05, now + 0.35);
      gain.gain.setValueAtTime(0.0001, now + 0.4);
      gain.gain.setValueAtTime(0.05, now + 0.6);
      gain.gain.setValueAtTime(0.05, now + 0.95);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);

      osc1.stop(now + durationMs / 1000);
      osc2.stop(now + durationMs / 1000);

      setTimeout(resolve, durationMs);
    } catch {
      setTimeout(resolve, durationMs);
    }
  });
}

/**
 * Play a standard busy/disconnect tone when hanging up the call.
 */
export function playCallEndTone(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(480, t);

      gain.gain.setValueAtTime(0.06, t);
      gain.gain.setValueAtTime(0.0001, t + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.14);
    }
  } catch (err) {
    console.warn("Call end tone failed:", err);
  }
}
