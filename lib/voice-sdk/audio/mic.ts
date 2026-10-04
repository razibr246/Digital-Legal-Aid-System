/**
 * Hardware Microphone Capture & WebRTC AEC3 Audio Pipeline
 */

import { EventEmitter } from "../types";

const MIC_ACQUIRE_TIMEOUT_MS = 5000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`getUserMedia timed out after ${ms} ms (audio device busy?)`)),
      ms,
    );
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function acquireHardwareMic(emit: EventEmitter): Promise<MediaStream | null> {
  emit({ type: "system", text: "Acquiring audio stream..." });

  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      let micStream: MediaStream | null = null;
      try {
        micStream = await withTimeout(
          navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              autoGainControl: true,
              noiseSuppression: true,
              googEchoCancellation: true,
              googEchoCancellation2: true,
              googDAEchoCancellation: true,
              googAutoGainControl: true,
              googNoiseSuppression: true,
              googHighpassFilter: true,
              googTypingNoiseDetection: true,
              googAudioMirroring: false,
            } as MediaTrackConstraints,
          }),
          MIC_ACQUIRE_TIMEOUT_MS,
        );
      } catch {
        try {
          // Standard fallback constraints
          micStream = await withTimeout(
            navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                autoGainControl: true,
                noiseSuppression: true,
              },
            }),
            MIC_ACQUIRE_TIMEOUT_MS,
          );
        } catch (e) {
          emit({ type: "system", text: `Mic constraints fallback failed: ${String(e)}` });
          micStream = null;
        }
      }

      emit({ type: "system", text: "Hardware microphone acquired OK" });
      return micStream;
    }
    throw new Error("getUserMedia unavailable");
  } catch (err) {
    emit({ type: "system", text: `Hardware mic unavailable: ${String(err)}` });
    return null;
  }
}