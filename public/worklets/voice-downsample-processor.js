/**
 * Standalone static AudioWorklet processor for browser voice downsampling (16kHz PCM16).
 */
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
    if (this.muted) return true;

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
