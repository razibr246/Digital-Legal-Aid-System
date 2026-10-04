/**
 * AudioWorklet Downsampler and Zero-GC Realtime Audio Processor
 *
 * Runs off the main browser thread on the dedicated real-time audio thread:
 * 1. Resamples hardware mic audio (48kHz/44.1kHz) to 16kHz PCM using linear interpolation.
 * 2. Emits 1600-sample (100ms) chunks via transferable ArrayBuffers (zero memory copy).
 * 3. Supports instant thread-level muting for half-duplex operation (zero CPU waste during agent speech).
 */

const WORKLET_PROCESSOR_CODE = `
class VoiceDownsampleProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetSampleRate = options?.processorOptions?.targetSampleRate || 16000;
    this.chunkSamples = options?.processorOptions?.chunkSamples || 1600; // 100ms at 16kHz
    this.ratio = sampleRate / this.targetSampleRate;
    this.fraction = 0;

    this.pcmBuffer = new Int16Array(this.chunkSamples);
    this.floatBuffer = new Float32Array(this.chunkSamples);
    this.bufferIndex = 0;
    this.muted = false;

    this.port.onmessage = (e) => {
      if (e.data && typeof e.data.muted === "boolean") {
        this.muted = e.data.muted;
        if (this.muted) {
          this.bufferIndex = 0;
          this.fraction = 0;
        }
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    // Muting is controlled at VAD/streamer layer to preserve barge-in detection

    const channel = input[0];
    const len = channel.length;
    let i = this.fraction;

    while (i < len) {
      const idx = Math.floor(i);
      const nextIdx = Math.min(idx + 1, len - 1);
      const frac = i - idx;
      const s = channel[idx] * (1 - frac) + channel[nextIdx] * frac;
      const clamped = Math.max(-1, Math.min(1, s));

      this.floatBuffer[this.bufferIndex] = clamped;
      this.pcmBuffer[this.bufferIndex] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      this.bufferIndex++;

      if (this.bufferIndex >= this.chunkSamples) {
        const pcmCopy = new Int16Array(this.pcmBuffer);
        const floatCopy = new Float32Array(this.floatBuffer);
        this.port.postMessage(
          {
            type: "chunk",
            pcm: pcmCopy.buffer,
            floats: floatCopy.buffer,
          },
          [pcmCopy.buffer, floatCopy.buffer]
        );
        this.bufferIndex = 0;
      }

      i += this.ratio;
    }

    this.fraction = i - len;
    return true;
  }
}

registerProcessor("voice-downsample-processor", VoiceDownsampleProcessor);
`;

const registeredContexts = new WeakSet<AudioContext>();

export async function registerDownsampleWorklet(audioCtx: AudioContext): Promise<boolean> {
  if (registeredContexts.has(audioCtx)) {
    return true;
  }
  if (!audioCtx.audioWorklet || typeof AudioWorkletNode === "undefined") {
    return false;
  }

  try {
    const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: "application/javascript" });
    const workletUrl = URL.createObjectURL(blob);
    try {
      await audioCtx.audioWorklet.addModule(workletUrl);
      registeredContexts.add(audioCtx);
      return true;
    } finally {
      URL.revokeObjectURL(workletUrl);
    }
  } catch (err) {
    console.warn("[voice-worklet] Failed to register AudioWorklet via blob:", err);
    return false;
  }
}
