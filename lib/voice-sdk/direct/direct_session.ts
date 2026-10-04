/**
 * Direct Serverless Embedded Session (In-Process Cloud AI Streaming) — Cloud-Only Port
 *
 * Legal Voice Agent high-octane architecture:
 * - openai/gpt-oss-120b with Eager fast-start clause chunking (LLM via /api/llm SSE proxy)
 * - Soniox Real-Time TTS (v2) via the same-origin server-side proxy
 * - Soniox Real-Time STT (stt-rt-v3) with semantic endpoint detection
 * - Formant Neural VAD & Smart-Turn Thought Boundary Analyzer
 * - Vocom Reactor TurnPhase State Machine
 * - Mathematically Decoupled WebAudio vs TTS Latency Telemetry Profiler
 *
 * Secrets live server-side: the LLM proxy owns the Groq key and both the TTS
 * and STT proxies own the Soniox key. The browser holds no credentials.
 */

import { acquireHardwareMic } from "../audio/mic";
import { registerDownsampleWorklet } from "../audio/worklet";
import { EventEmitter, SdkConfig, VoiceSession } from "../types";
import { SmartTurnAnalyzer } from "./smart_turn";
import { SonioxStt } from "./soniox_stt";
import { TurnPhaseStateMachine } from "./turn_phase";
import type { SessionUser } from "../../auth/roles";
import { RealtimeVad, VadEvent } from "./vad";
import { DeepgramWsTts } from "./ws_tts";
import {
  classifySeverity,
  type SeverityClassification,
  type SeverityLevel,
} from "../../agent/knowledge/severity-classification";
import {
  appendPhoneDigits,
  extractPhoneDigits,
  normalizeBangladeshPhone,
  validateBangladeshPhone,
} from "../../phone/bangladesh-phone";
import { saveSimulatedSms } from "../../sms/inbox";
import { extractDistrict } from "../../legal/districts";
import { inferLegalCategory } from "../../legal/category";
import { BANGLA_LEGAL_AGENT_PROMPT } from "../../agent/prompts/bangla-legal-agent";
import { interpretSemanticBridge } from "../../agent/semantic-bridge/match-lexicon";
import type { SemanticBridgeResult } from "../../agent/semantic-bridge/types";
import type { IndigenousLanguage } from "../../agent/knowledge/indigenous-language-lexicon";

class StreamingAudioPlayer {
  private audioCtx: AudioContext;
  private outputGain: GainNode;
  private activeSources: AudioBufferSourceNode[] = [];
  private nextPlayTime: number = 0;
  private isReset: boolean = false;
  public onFirstPlay: ((tPlay: number) => void) | null = null;
  private hasPlayedFirstInTurn: boolean = false;

  // Preallocated buffer for 24kHz PCM Audio
  private sampleBuffer: Float32Array = new Float32Array(96000); // 4 seconds capacity
  private sampleCount: number = 0;
  private readonly SAMPLE_RATE = 24000;
  // 100ms prebuffer (2,400 samples) to absorb network packet jitter without noticeable latency
  private readonly INITIAL_BUFFER_SAMPLES = 2400;
  // Minimum chunk to immediately extend WebAudio timeline while playback is active (40ms = 960 samples)
  private readonly MIN_STREAM_CHUNK = 960;
  // 25ms lead time when starting from idle or true underrun
  private readonly INITIAL_LEAD_SEC = 0.025;

  constructor(audioCtx: AudioContext, recordingDestination?: AudioNode) {
    this.audioCtx = audioCtx;
    this.outputGain = audioCtx.createGain();
    this.outputGain.connect(audioCtx.destination);
    if (recordingDestination) this.outputGain.connect(recordingDestination);
  }

  public reset() {
    this.isReset = true;
    this.hasPlayedFirstInTurn = false;
    this.sampleCount = 0;
    const now = this.audioCtx.currentTime;

    try {
      this.outputGain.gain.cancelScheduledValues(now);
      this.outputGain.gain.setValueAtTime(1, now);
    } catch {}

    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    }

    this.activeSources = [];
    this.nextPlayTime = 0;
    this.isReset = false;
  }

  public enqueuePcmChunk(pcm16ArrayBuf: ArrayBuffer) {
    if (this.isReset || pcm16ArrayBuf.byteLength === 0) return;

    if (this.audioCtx.state === "suspended") {
      void this.audioCtx.resume().catch(() => undefined);
    }


    const byteLen = pcm16ArrayBuf.byteLength - (pcm16ArrayBuf.byteLength % 2);
    if (byteLen === 0) return;
    const pcm16 = new Int16Array(pcm16ArrayBuf, 0, byteLen / 2);
    const n = pcm16.length;

    // Expand buffer if needed
    if (this.sampleCount + n > this.sampleBuffer.length) {
      const newBuf = new Float32Array(Math.max(this.sampleBuffer.length * 2, this.sampleCount + n + 48000));
      newBuf.set(this.sampleBuffer.subarray(0, this.sampleCount));
      this.sampleBuffer = newBuf;
    }

    // Direct float scaling into typed buffer
    const inv32768 = 1 / 32768;
    for (let i = 0; i < n; i++) {
      this.sampleBuffer[this.sampleCount + i] = pcm16[i] * inv32768;
    }
    this.sampleCount += n;

    const now = this.audioCtx.currentTime;
    const isPlaying = this.nextPlayTime > now;

    if (isPlaying) {
      // While already playing: continuously schedule as soon as we have MIN_STREAM_CHUNK (40ms)
      while (this.sampleCount >= this.MIN_STREAM_CHUNK) {
        const chunk = this.sampleBuffer.subarray(0, this.sampleCount);
        this.schedulePcm(chunk);
        this.sampleCount = 0;
      }
    } else {
      // Cold start or after true underrun: buffer 100ms before starting
      if (this.sampleCount >= this.INITIAL_BUFFER_SAMPLES) {
        const chunk = this.sampleBuffer.subarray(0, this.sampleCount);
        this.schedulePcm(chunk);
        this.sampleCount = 0;
      }
    }
  }

  public flush() {
    // When TTS signals stream end or flush, immediately schedule whatever is remaining
    if (this.sampleCount > 0) {
      const remaining = this.sampleBuffer.subarray(0, this.sampleCount);
      this.schedulePcm(remaining);
      this.sampleCount = 0;
    }
  }

  private schedulePcm(samples: Float32Array) {
    if (samples.length === 0 || this.isReset) return;

    const audioBuf = this.audioCtx.createBuffer(1, samples.length, this.SAMPLE_RATE);
    audioBuf.getChannelData(0).set(samples);

    const sourceNode = this.audioCtx.createBufferSource();
    sourceNode.buffer = audioBuf;
    sourceNode.connect(this.outputGain);
    this.activeSources.push(sourceNode);

    sourceNode.onended = () => {
      const idx = this.activeSources.indexOf(sourceNode);
      if (idx >= 0) this.activeSources.splice(idx, 1);
    };

    const now = this.audioCtx.currentTime;
    let startTime: number;

    if (this.nextPlayTime > now) {
      // Sample-accurate gapless stitching with preceding chunk
      startTime = this.nextPlayTime;
    } else {
      // Cold start or true network underrun: slight lead time prevents glitch
      startTime = now + this.INITIAL_LEAD_SEC;
    }

    sourceNode.start(startTime);
    this.nextPlayTime = startTime + audioBuf.duration;

    if (!this.hasPlayedFirstInTurn && this.onFirstPlay) {
      this.hasPlayedFirstInTurn = true;
      const tPlay = performance.now();
      this.onFirstPlay(tPlay);
      this.onFirstPlay = null;
    }
  }

  public playAudioBuffer(audioBuf: AudioBuffer) {
    if (this.isReset) return;

    if (this.audioCtx.state === "suspended") {
      void this.audioCtx.resume().catch(() => undefined);
    }


    const sourceNode = this.audioCtx.createBufferSource();
    sourceNode.buffer = audioBuf;
    sourceNode.connect(this.outputGain);
    this.activeSources.push(sourceNode);

    sourceNode.onended = () => {
      const idx = this.activeSources.indexOf(sourceNode);
      if (idx >= 0) this.activeSources.splice(idx, 1);
    };

    const now = this.audioCtx.currentTime;
    let startTime: number;

    if (this.nextPlayTime > now) {
      startTime = this.nextPlayTime;
    } else {
      startTime = now + this.INITIAL_LEAD_SEC;
    }

    sourceNode.start(startTime);
    this.nextPlayTime = startTime + audioBuf.duration;

    if (!this.hasPlayedFirstInTurn && this.onFirstPlay) {
      this.hasPlayedFirstInTurn = true;
      const tPlay = performance.now();
      this.onFirstPlay(tPlay);
      this.onFirstPlay = null;
    }
  }

  public hasActivePlayback(): boolean {
    return this.nextPlayTime > this.audioCtx.currentTime + 0.05 || this.activeSources.length > 0;
  }

  public async waitUntilFinished(): Promise<void> {
    this.flush();
    const startWait = performance.now();
    while (
      !this.isReset &&
      (this.nextPlayTime > this.audioCtx.currentTime + 0.03 ||
      this.sampleCount > 0 ||
      this.activeSources.length > 0)
    ) {
      if (performance.now() - startWait > 30000) {
        break;
      }
      const waitMs = Math.min(
        80,
        Math.max(15, (this.nextPlayTime - this.audioCtx.currentTime) * 1000),
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
    // Reverb decay pause: allow speaker room echo to decay completely
    // before the microphone is unmuted, eliminating acoustic echo self-interruptions!
    await new Promise((r) => setTimeout(r, 120));
  }
}

let cachedGreetingAudioBuf: AudioBuffer | null = null;
let cachedGreetingLanguageBuf: AudioBuffer | null = null;
let cachedIvrAudioBuf: AudioBuffer | null = null;
let cachedOption1AudioBuf: AudioBuffer | null = null;
let cachedIntakeCompleteBuf: AudioBuffer | null = null;
let cachedPhonePrimaryBuf: AudioBuffer | null = null;
let cachedSmsPinSentBuf: AudioBuffer | null = null;
let cachedProblemStartBuf: AudioBuffer | null = null;
let cachedProblemStartWithNoteBuf: AudioBuffer | null = null;
let cachedInactivityAppQueryBuf: AudioBuffer | null = null;
let cachedInactivityNoAckBuf: AudioBuffer | null = null;
let cachedInactivityHangupBuf: AudioBuffer | null = null;
let cachedOption3TrackingBuf: AudioBuffer | null = null;
let cachedCasePinLockedBuf: AudioBuffer | null = null;

/** Re-asked when the caller stays silent during language selection. TTS, not a clip. */
const LANGUAGE_REASK_PROMPT = "আপনার ভাষা: বাংলা ১, মারমা ২, চাকমা ৩ — চাপুন।";
const LANGUAGE_SELECTION_RETRY_PROMPT =
  "আমি আপনার ভাষা বুঝতে পারিনি। বাংলার জন্য ১, মারমার জন্য ২, চাকমার জন্য ৩ চাপুন, অথবা মুখে বলুন।";

/** The 1/2/3 root menu, said exactly once per call. Matches ivr_menu.wav. */
const ROOT_MENU_PROMPT =
  "সাধারণ তথ্য জানতে ১ চাপুন, কোনো সমস্যা বা অভিযোগ জানাতে ২ চাপুন, আর আপনার নথির অবস্থা জানতে কেস ট্র্যাকিংয়ের জন্য ৩ চাপুন।";

/**
 * Welcome, recording notice and the language question as ONE clip. The caller used
 * to sit through a 10.8s greeting and then an 8.8s language prompt before they
 * could act. Matches greeting_language.wav; if you edit this, re-synthesize the
 * clip or the recording and the code will disagree.
 */
const MERGED_GREETING_PROMPT =
  "আইনি সহায়তায় স্বাগতম। আপনার কথোপকথনটি রেকর্ড হচ্ছে। ভাষা: বাংলা ১, মারমা ২, চাকমা ৩ — চাপুন, অথবা মুখে বলুন।";

type AudioKind =
  | "greeting"
  | "greeting_language"
  | "ivr"
  | "option1"
  | "intake_complete"
  | "phone_primary"
  | "sms_pin_sent"
  | "problem_start"
  | "problem_start_with_note"
  | "inactivity_app_query"
  | "inactivity_no_ack"
  | "inactivity_hangup"
  | "option3_tracking"
  | "case_pin_locked";

async function getPreRecordedAudioBuffer(
  audioCtx: AudioContext,
  kind: AudioKind,
): Promise<AudioBuffer | null> {
  try {
    if (kind === "greeting" && cachedGreetingAudioBuf) return cachedGreetingAudioBuf;
    if (kind === "greeting_language" && cachedGreetingLanguageBuf) return cachedGreetingLanguageBuf;
    if (kind === "ivr" && cachedIvrAudioBuf) return cachedIvrAudioBuf;
     if (kind === "option1" && cachedOption1AudioBuf) return cachedOption1AudioBuf;
      if (kind === "intake_complete" && cachedIntakeCompleteBuf) return cachedIntakeCompleteBuf;
      if (kind === "phone_primary" && cachedPhonePrimaryBuf) return cachedPhonePrimaryBuf;
      if (kind === "sms_pin_sent" && cachedSmsPinSentBuf) return cachedSmsPinSentBuf;
      if (kind === "problem_start" && cachedProblemStartBuf) return cachedProblemStartBuf;
      if (kind === "problem_start_with_note" && cachedProblemStartWithNoteBuf) return cachedProblemStartWithNoteBuf;
      if (kind === "inactivity_app_query" && cachedInactivityAppQueryBuf) return cachedInactivityAppQueryBuf;


    if (kind === "inactivity_no_ack" && cachedInactivityNoAckBuf) return cachedInactivityNoAckBuf;
    if (kind === "inactivity_hangup" && cachedInactivityHangupBuf) return cachedInactivityHangupBuf;
    if (kind === "option3_tracking" && cachedOption3TrackingBuf) return cachedOption3TrackingBuf;
    if (kind === "case_pin_locked" && cachedCasePinLockedBuf) return cachedCasePinLockedBuf;

    const urls: Record<AudioKind, string> = {
      greeting: "/audio/greeting.wav",
      greeting_language: "/audio/greeting_language.wav",
      ivr: "/audio/ivr_menu.wav",
       option1: "/audio/option1_prompt.wav",
       intake_complete: "/audio/intake_complete.wav",
       phone_primary: "/audio/phone_primary.wav",
       sms_pin_sent: "/audio/sms_pin_sent.wav",
       problem_start: "/audio/problem_start.wav",
       problem_start_with_note: "/audio/problem_start_with_note.wav",
       inactivity_app_query: "/audio/inactivity_app_query.wav",

      inactivity_no_ack: "/audio/inactivity_no_ack.wav",
      inactivity_hangup: "/audio/inactivity_hangup.wav",
      option3_tracking: "/audio/option3_tracking.wav",
      case_pin_locked: "/audio/case_pin_locked.wav",
    };
    const res = await fetch(urls[kind]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    const decoded = await audioCtx.decodeAudioData(arrayBuf);
    if (kind === "greeting") cachedGreetingAudioBuf = decoded;
    if (kind === "greeting_language") cachedGreetingLanguageBuf = decoded;
    if (kind === "ivr") cachedIvrAudioBuf = decoded;
     if (kind === "option1") cachedOption1AudioBuf = decoded;
      if (kind === "intake_complete") cachedIntakeCompleteBuf = decoded;
      if (kind === "phone_primary") cachedPhonePrimaryBuf = decoded;
      if (kind === "sms_pin_sent") cachedSmsPinSentBuf = decoded;
      if (kind === "problem_start") cachedProblemStartBuf = decoded;
      if (kind === "problem_start_with_note") cachedProblemStartWithNoteBuf = decoded;
      if (kind === "inactivity_app_query") cachedInactivityAppQueryBuf = decoded;


    if (kind === "inactivity_no_ack") cachedInactivityNoAckBuf = decoded;
    if (kind === "inactivity_hangup") cachedInactivityHangupBuf = decoded;
    if (kind === "option3_tracking") cachedOption3TrackingBuf = decoded;
    if (kind === "case_pin_locked") cachedCasePinLockedBuf = decoded;
    return decoded;
  } catch (err) {
    console.warn(`Failed to load/decode pre-recorded ${kind} audio:`, err);
    return null;
  }
}

export type IntakeStep =
  | "idle"
   | "language"
   | "application_confirm"
   | "problem"
   | "semantic_confirmation"
   | "disability"
  | "disability_type"
  | "gender"
  | "name"
  | "phone_primary"
  | "phone_number"
  | "address"
  | "case_tracking"
  | "case_pin"
  | "case_result"
  | "complete";

export type CallEndReason = "caller" | "timeout" | "system";

export interface IntakeData {
  problem: string;
  /** Case tracking: PIN keyed so far and how many guesses have failed. */
  casePinDraft: string;
  casePinAttempts: number;
  hasDisability: boolean | null;
  disabilityType: string | null;
  disabilityTypeCode: string | null;
  gender: string | null;
  callerName: string | null;
  phone: string | null;
  phonePrimary: boolean | null;
  phoneOperator: string | null;
  phoneDraft: string;
  address: string | null;
  indigenousLanguage: IndigenousLanguage;
  semanticMatched: boolean;
  semanticConfidence: number | null;
  semanticIntent: string | null;
  semanticNormalizedBangla: string | null;
  semanticQuestion: string | null;
  semanticMatchedTerms: string[];
  semanticLegalIntentBn: string | null;
  severityLevel: SeverityLevel | null;
  severityTags: string[];
  severityFactors: string[];
  severityCategory: string | null;
  severityCaseReference: string | null;
}

function parseBengaliYesNo(input: string): boolean | null {
  const norm = input.trim().toLowerCase();
  if (norm === "1" || norm === "১") return true;
  if (norm === "2" || norm === "২") return false;

  if (
    /^(হ্যাঁ|হাঁ|হ্যা|জি|জী|জি\s*হ্যাঁ|আছে|প্রতিবন্ধী|হ|হা)$/i.test(norm) ||
    norm.includes("হ্যাঁ") ||
    norm.includes("হাঁ") ||
    norm.includes("প্রতিবন্ধকতা আছে") ||
    norm.includes("শারীরিক সমস্যা আছে")
  ) {
    return true;
  }

  if (
    /^(না|নাই|নেই|না\s*নেই|না\s*নাই|না\s*না|কোনোটিই\s*না)$/i.test(norm) ||
    norm.includes("না") ||
    norm.includes("নেই") ||
    norm.includes("নাই") ||
    norm.includes("কোনো সমস্যা নেই") ||
    norm.includes("সুস্থ")
  ) {
    return false;
  }

  return null;
}

const DISABILITY_TYPES: Array<{ code: string; label: string; keywords: string[] }> = [
  { code: "visual", label: "দৃষ্টি", keywords: ["দৃষ্টি", "চোখ", "অন্ধ", "দেখতে পাই না"] },
  { code: "hearing", label: "শ্রবণ", keywords: ["শ্রবণ", "কান", "শুনতে পাই না", "বধির"] },
  { code: "mobility", label: "চলাফেরা", keywords: ["চলাফেরা", "হাঁটতে", "পথ চলতে", "অঙ্গ", "শরীরের চলাচল"] },
  { code: "speech", label: "বাক", keywords: ["বাক", "কথা বলতে", "ভাষা বলতে", "অটো"] },
  { code: "mental", label: "মানসিক", keywords: ["মানসিক", "উদ্বেগ", "ডিপ্রেশন", "মানসিক স্বাস্থ্য"] },
  { code: "intellectual", label: "বুদ্ধিমত্তা", keywords: ["বুদ্ধিমত্তা", "বুদ্ধি", "intellectual"] },
  { code: "learning", label: "শেখার প্রতিবন্ধকতা", keywords: ["শেখার", "পড়ার", "লেখার", "learning"] },
];

function parseDisabilityType(input: string): { code: string; label: string } | null {
  const clean = input.trim();
  if (!clean) return null;
  const normalized = clean.toLocaleLowerCase("bn-BD");
  if (/(একাধিক|multiple|দুইটি|দুই ধরনের)/.test(normalized)) {
    return { code: "multiple", label: "একাধিক ধরনের প্রতিবন্ধকতা" };
  }
  if (/(অন্যান্য|অজানা|অন্য|other|unknown)/.test(normalized)) {
    return { code: "other", label: "অন্যান্য" };
  }
  const match = DISABILITY_TYPES.find((option) =>
    option.keywords.some((keyword) => normalized.includes(keyword.toLocaleLowerCase("bn-BD"))),
  );
  if (match) return { code: match.code, label: match.label };
  if (clean.length > 2 && !/^[১২৩৪৫৬৭৮৯0-9]+$/.test(clean)) {
    return { code: "other", label: clean.slice(0, 80) };
  }
  return null;
}

function parseVoicePin(input: string): string | null {
  const raw = input.trim().toLowerCase();
  const digitWords: Record<string, string> = {
    "শূন্য": "0",
    "জিরো": "0",
    "zero": "0",
    "এক": "1",
    "১": "1",
    "one": "1",
    "দুই": "2",
    "দুইয়": "2",
    "২": "2",
    "two": "2",
    "তিন": "3",
    "৩": "3",
    "three": "3",
    "চার": "4",
    "৪": "4",
    "four": "4",
    "পাঁচ": "5",
    "পাচ": "5",
    "৫": "5",
    "five": "5",
    "ছয়": "6",
    "৬": "6",
    "six": "6",
    "সাত": "7",
    "৭": "7",
    "seven": "7",
    "আট": "8",
    "৮": "8",
    "eight": "8",
    "নয়": "9",
    "নয়টি": "9",
    "৯": "9",
    "nine": "9",
  };
  const spoken = raw
    .split(/\s+/)
    .map((token) => digitWords[token])
    .filter(Boolean)
    .join("");
  const compact = raw.replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit))).replace(/\D/g, "");
  // Speech recognition routinely drops a leading zero, so "942" is accepted for
  // a PIN issued as "0942" rather than rejected.
  if (/^\d{3}$/.test(compact)) return `0${compact}`;
  const candidate = spoken.length === 4 ? spoken : compact;
  return /^\d{4}$/.test(candidate) ? candidate : null;
}

function generateVoicePin(): string {
  // Always four spoken digits. A leading zero is easily lost by speech
  // recognition and makes for a weaker PIN.
  const value = 1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000);
  return String(value);
}

function parseBengaliGender(input: string): string | null {
  const norm = input.trim().toLowerCase();
  if (
    norm === "1" ||
    norm === "১" ||
    norm.includes("পুরুষ") ||
    norm.includes("ছেলে") ||
    norm.includes("ব্যাটা") ||
    norm.includes("পুরুষ মানুষ")
  ) {
    return "পুরুষ";
  }
  if (
    norm === "2" ||
    norm === "২" ||
    norm.includes("নারী") ||
    norm.includes("মহিলা") ||
    norm.includes("মেয়ে") ||
    norm.includes("স্ত্রীলোক")
  ) {
    return "নারী";
  }
  if (
    norm === "3" ||
    norm === "৩" ||
    norm.includes("অন্যান্য") ||
    norm.includes("হিজড়া") ||
    norm.includes("তৃতীয় লিঙ্গ")
  ) {
    return "অন্যান্য";
  }
  return null;
}

function cleanBengaliName(input: string): string {
  let clean = input.trim();
  clean = clean.replace(/^(আমার\s*নাম\s*(হলো|হচ্ছে|হল)?|আমি\s*)/i, "").trim();
  clean = clean.replace(/(\s*(বলছি|বলছিলাম|এখানে বলছি))$/i, "").trim();
  if (!clean) clean = input.trim();
  return clean;
}

export class DirectSession implements VoiceSession {
  private soniox: SonioxStt | null = null;
  private sttLanguage: string = "bn";
  private ttsWs: DeepgramWsTts | null = null;
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private player: StreamingAudioPlayer | null = null;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  private recorder: MediaRecorder | null = null;
  private recordingChunks: Blob[] = [];
  private recordingStartedAt = 0;
  private recordingDocketId: string | null = null;
  private vad: RealtimeVad = new RealtimeVad();
  private smartTurn: SmartTurnAnalyzer = new SmartTurnAnalyzer();
  private turnPhase: TurnPhaseStateMachine = new TurnPhaseStateMachine(1);
  private activeAbortCtrl: AbortController | null = null;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private speechFinalDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private conversationHistory: Array<{ role: string; content: string }> = [];
  private activityEpoch: number = 0;
  private userMessageQueue: Promise<void> = Promise.resolve();
  private assistantSpeechQueue: Promise<void> = Promise.resolve();
  private assistantSpeechGeneration = 0;
  private emit: EventEmitter;

  private sttKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private ttsKeepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private isCallActive: boolean = false;

  private currentTranscript: string = "";
  private accumulatedSegments: string[] = [];
  private t_last_mic_speech: number = 0;
  /** Throttle for interim_transcript; Soniox emits a frame every few hundred ms. */
  private t_last_interim_emit: number = 0;
  /** When the STT engine declared the current turn finished (0 = not yet). */
  private t_engine_end: number = 0;
  private t_first_pcm_chunk: number = 0;
  private micScriptNode: ScriptProcessorNode | null = null;
  private micWorkletNode: AudioWorkletNode | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private greetingSpoken: boolean = false;
  private greetingActive: boolean = false;
  private waitingForDtmf: boolean = false;
  private halfDuplex: boolean = true;
  private isAssistantSpeakingOrPlaying: boolean = false;
  private lastConfig: SdkConfig | null = null;
  private callerPhone: string | null = null;
  private indigenousLanguage: IndigenousLanguage = "bn";
  private languageSelectionPending = true;
  private pendingSemanticResult: SemanticBridgeResult | null = null;
  public sessionId: string = "call-" + Math.random().toString(36).substring(2, 9);

  // Multi-step case intake chain state
  private intakeStep: IntakeStep = "idle";
  private intakeData: IntakeData = {
    problem: "",
    hasDisability: null,
    disabilityType: null,
    disabilityTypeCode: null,
    gender: null,
    callerName: null,
    phone: null,
    phonePrimary: null,
    phoneOperator: null,
    phoneDraft: "",
    casePinDraft: "",
    casePinAttempts: 0,
    address: null,
    severityLevel: null,
    severityTags: [],
    severityFactors: [],
    severityCategory: null,
     severityCaseReference: null,
     indigenousLanguage: "bn",
     semanticMatched: false,
     semanticConfidence: null,
     semanticIntent: null,
     semanticNormalizedBangla: null,
      semanticQuestion: null,
      semanticMatchedTerms: [],
      semanticLegalIntentBn: null,
    };

  // Inactivity timer state (general inquiry / keypad-1 mode)
  // Phase 1: 10s silence → ask if wants to file case
  // Phase 2: 10s silence after that → hangup with farewell
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private inactivityPhase: "off" | "query" | "hangup_warn" = "off";
  /** Case tracking: the PIN being keyed, and how many guesses have failed. */
  private casePinDraft = "";
  private casePinAttempts = 0;
  private generalQueryMode: boolean = false; // true after keypad 1 is pressed

  /**
   * Advice-record bookkeeping for a general inquiry.
   *
   * A general inquiry used to leave no trace at all: the LLM answered, the answer was
   * spoken, and the call vanished when the tab closed. The DLAO could not answer "what
   * did we advise this person, and how long did it take?" -- which is the point of a
   * legal-aid hotline. So the turn is recorded as it happens rather than at the end: a
   * caller who hangs up mid-answer must still leave a record, and that rules out writing
   * only on a clean hangup.
   */
  private callStartedAtMs: number = 0;
  private advicePersistTimer: ReturnType<typeof setTimeout> | null = null;
  private adviceEscalated: boolean = false;
  /** Last substantive answer, kept so the record's summary is the advice actually given. */
  private lastAdviceText: string = "";
  private severityConfirmation: { query: string; classification: SeverityClassification | null } | null = null;
  private assistantTurnText = "";
  private captureAssistantTurn = false;
  private blindAccessState: "off" | "pin_ready" = "off";
  private blindVoicePin: string | null = null;
  /** One docket and one PIN per call: finalizing twice must not mint a second. */
  private caseIntakeFinalized = false;
  private voiceLoginMode: "off" | "awaiting_pin" | "awaiting_name" = "off";
  private voiceLoginPin: string | null = null;
  private voiceLoginAttempts = 0;
  private authenticatedUser: SessionUser | null = null;
  private completedBlindUser: SessionUser | null = null;
  private completedBlindDocketId: string | null = null;

  constructor(emit: EventEmitter) {
    this.emit = emit;
  }

  private startRecording(): void {
    if (!this.recordingDestination || typeof MediaRecorder === "undefined") return;
    const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
    try {
      this.recorder = mimeType
        ? new MediaRecorder(this.recordingDestination.stream, { mimeType, audioBitsPerSecond: 64000 })
        : new MediaRecorder(this.recordingDestination.stream);
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.recordingChunks.push(event.data);
      };
      this.recorder.onerror = () => {
        this.recorder = null;
      };
      this.recorder.onstop = () => {
        void this.uploadRecording();
      };
      this.recorder.start(10000);
    } catch {
      this.recorder = null;
    }
  }

  private async uploadRecording(): Promise<void> {
    const chunks = this.recordingChunks.splice(0);
    if (chunks.length === 0) return;
    const mimeType = this.recorder?.mimeType || "audio/webm";
    const durationMs = Math.max(0, Math.round(performance.now() - this.recordingStartedAt));
    const extension = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
    const formData = new FormData();
    formData.append("file", new Blob(chunks, { type: mimeType }), `${this.sessionId}.${extension}`);
    formData.append("voiceSessionId", this.sessionId);
    formData.append("docketId", this.recordingDocketId || "");
    formData.append("durationMs", String(durationMs));
    try {
      const response = await fetch("/api/recordings", { method: "POST", body: formData });
      if (!response.ok) {
        this.emit({ type: "system", text: `Call recording upload failed (${response.status})` });
      }
    } catch (error) {
      this.emit({ type: "system", text: `Call recording upload failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  private stopRecording(): void {
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
  }

  private isSttReady(): boolean {
    return this.soniox !== null && this.soniox !== undefined;
  }

  private connectStt(): void {
    if (!this.isCallActive) return;

    if (this.soniox) {
      this.soniox.close();
      this.soniox = null;
    }

    if (this.sttKeepAliveTimer) {
      clearInterval(this.sttKeepAliveTimer);
      this.sttKeepAliveTimer = null;
    }

    try {
      const proto =
        typeof window !== "undefined" && window.location.protocol === "https:" ? "wss://" : "ws://";
      const proxyUrl = `${proto}${typeof window !== "undefined" ? window.location.host : "localhost"}/v1/stt`;
      this.soniox = new SonioxStt(
        proxyUrl,
        {
          onInterim: (text) => this.handleSttInterim(text),
          onFinal: (text, utteranceEnd) => this.handleSttFinalSegment(text, utteranceEnd),
          onClosed: (code) => {
            if (!this.isCallActive) return;
            console.warn(`[DirectSession] Soniox STT closed (code ${code}), reconnecting...`);
            this.emit({ type: "system", text: "Soniox STT dropped — reconnecting" });
            setTimeout(() => {
              if (this.isCallActive) this.connectStt();
            }, 600);
          },
        },
        { language: this.sttLanguage, sampleRate: 16000 },
      );
      void this.soniox
        .connect()
        .then(() => {
          if (!this.isCallActive) return;
          console.log("[DirectSession] Soniox realtime STT connected");
          this.emit({ type: "system", text: "Soniox realtime STT connected" });
          if (!this.greetingActive && !this.waitingForDtmf) {
            this.emit({ type: "state_changed", state: "listening" });
          }
        })
        .catch((err: unknown) => {
          if (!this.isCallActive) return;
          console.error("[DirectSession] Soniox STT connect failed:", err);
          this.emit({
            type: "error",
            message: `STT unavailable (Soniox proxy): ${String(err)}`,
          });
          this.emit({ type: "state_changed", state: "error" });
          this.soniox = null;
        });

      this.setupKeepAliveHeartbeat();
    } catch (err) {
      console.error("[DirectSession] Soniox STT init failed:", err);
    }
  }

  private setupKeepAliveHeartbeat(): void {
    if (this.sttKeepAliveTimer) clearInterval(this.sttKeepAliveTimer);
    // Soniox requires {"type":"keepalive"} while audio is idle (greeting
    // playback, IVR DTMF wait) or upstream times the session out (408).
    this.sttKeepAliveTimer = setInterval(() => {
      if (!this.isCallActive) return;
      this.soniox?.sendKeepAlive();
    }, 5000);
  }

  /**
   * Partial recognition of the utterance in progress. Soniox revises this text as
   * more audio arrives, so it is emitted as a replacement rather than a delta, and
   * throttled because the provider sends a frame every few hundred milliseconds.
   *
   * This is what makes the call *feel* responsive: without it the caller sees
   * nothing at all while speaking and the whole sentence appears at once when the
   * turn commits, which reads as very slow transcription even though the
   * recognition itself was accurate and on time.
   */
  private handleSttInterim(text: string): void {
    if (text.length === 0) return;
    this.currentTranscript = text;
    const now = performance.now();
    if (now - this.t_last_interim_emit < 250) return;
    this.t_last_interim_emit = now;
    this.emit({ type: "interim_transcript", text });
  }

  private handleSttFinalSegment(text: string, utteranceEnd: boolean): void {
    if (!this.isCallActive) return;
    if (text.length > 0) {
      this.accumulatedSegments.push(text);
    }
    if (utteranceEnd) {
      // The engine declares the caller finished the turn (<end> / <fin>) —
      // commit through the mic-activity guard immediately.
      void this.attemptFlush("stt_utterance_end", true);
    } else {
      const commitDelay =
        this.intakeStep === "disability" ||
        this.intakeStep === "disability_type" ||
        this.intakeStep === "gender"
          ? 400
          : 850;
      this.armTextActivityCommit(commitDelay);
    }
  }


  public async start(config: SdkConfig): Promise<void> {
     this.lastConfig = config;
     this.callerPhone = config.callerPhone ? normalizeBangladeshPhone(config.callerPhone) : null;
     this.indigenousLanguage = "bn";
     this.languageSelectionPending = true;
     this.intakeStep = "language";
     this.emit({ type: "intake_step_changed", step: "language", data: this.intakeData });
     this.pendingSemanticResult = null;
     this.isCallActive = true;

    this.waitingForDtmf = false;
    this.sessionId = "call-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 6);
    this.callStartedAtMs = Date.now();
    this.adviceEscalated = false;
    this.lastAdviceText = "";
    this.halfDuplex = config.halfDuplex ?? true;
    this.isAssistantSpeakingOrPlaying = false;
    this.greetingSpoken = false;
    this.generalQueryMode = false;
    this.inactivityPhase = "off";
    this.severityConfirmation = null;
    this.blindAccessState = "off";
    this.blindVoicePin = null;
    this.caseIntakeFinalized = false;
    this.voiceLoginMode = "off";
    this.voiceLoginPin = null;
    this.voiceLoginAttempts = 0;
    this.authenticatedUser = null;
    this.completedBlindUser = null;
    this.completedBlindDocketId = null;
    const language = "bn";
    const voiceId = config.voiceId || "Priya";
    const ttsProxyUrl =
      config.ttsProxyUrl ||
      `ws://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:8200/v1/tts`;
    const systemPrompt = BANGLA_LEGAL_AGENT_PROMPT;

    this.conversationHistory = [{ role: "system", content: systemPrompt }];
    this.turnPhase.reset();
    this.turnPhase = new TurnPhaseStateMachine(config.minBargeInWords ?? 2);
    this.vad.reset();
    this.t_last_mic_speech = 0;
    this.t_first_pcm_chunk = 0;

    this.emit({ type: "system", text: "Starting High-Speed Streaming Voice Session..." });

    const micStream = await acquireHardwareMic(this.emit);
    if (micStream) {
      this.stream = micStream;
    } else {
      this.emit({ type: "system", text: "Microphone unavailable; continuing with keypad-only mode." });
    }

    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AudioCtxClass();
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume().catch(() => undefined);
    }

    this.recordingDestination = this.audioCtx.createMediaStreamDestination();
    this.recordingChunks = [];
    this.recordingStartedAt = performance.now();
    this.recordingDocketId = null;
    this.player = new StreamingAudioPlayer(this.audioCtx, this.recordingDestination);
    this.startRecording();

    // 3. Connect Persistent Streaming WebSocket TTS (Soniox / Deepgram via local proxy)

    this.ttsWs = new DeepgramWsTts(ttsProxyUrl, voiceId, language);
    this.ttsWs.setOnAudioChunk((pcm16) => {
      if (this.t_first_pcm_chunk === 0) {
        this.t_first_pcm_chunk = performance.now();
      }
      if (this.player) {
        this.player.enqueuePcmChunk(pcm16);
      }
    });
    this.ttsWs.setOnFlush(() => {
      if (this.player) {
        this.player.flush();
      }
    });
    void this.ttsWs.connect().catch((err: unknown) => {
      this.emit({
        type: "error",
        message: `TTS unavailable: ${String(err)}. STT is still active.`,
      });
    });
    if (this.ttsKeepAliveTimer) clearInterval(this.ttsKeepAliveTimer);
    // Soniox TTS connection keepalive between streams (every 5s to prevent idle disconnect).
    this.ttsKeepAliveTimer = setInterval(() => {
      if (!this.isCallActive || !this.ttsWs) return;
      this.ttsWs.sendKeepAlive();
    }, 5000);

     this.sttLanguage = language;
     this.accumulatedSegments = [];
     if (this.stream) {
       this.connectStt();
       void this.setupDirectMicStreamer(this.stream);
     }


    // 6. Play initial greeting & IVR menu
    const officialDefaultGreeting =
      "বাংলাদেশ সরকারের বিনামূল্যে আইনি সহায়তা হেল্পলাইনে আপনাকে স্বাগতম। " +
      "আপনাকে সঠিক সেবা প্রদান এবং ভবিষ্যতের প্রয়োজনে আমাদের এই কথোপকথনটি রেকর্ড করা হচ্ছে।";
    const officialDefaultSecondary = ROOT_MENU_PROMPT;

    const activeGreeting = config.greeting !== undefined ? config.greeting : officialDefaultGreeting;
     // On a fresh call the welcome, the recording notice and the language question
     // are a single clip, and nothing follows it: the caller goes straight to voice
     // input. Only the non-fresh path still speaks greeting, then the root menu.
     const activeSecondary = this.languageSelectionPending
       ? MERGED_GREETING_PROMPT
       : config.secondaryPrompt !== undefined ? config.secondaryPrompt : officialDefaultSecondary;

    if (activeGreeting && !this.greetingSpoken) {
      this.greetingSpoken = true;
      this.greetingActive = true;
      this.setAssistantSpeaking(true);
      this.emit({ type: "state_changed", state: "speaking" });

      // 1st Message: the one merged opening clip, else greeting + IVR menu.
      const openingText = this.languageSelectionPending ? activeSecondary : activeGreeting;
      this.emit({ type: "transcript", role: "assistant", text: openingText });
      this.conversationHistory.push({ role: "assistant", content: openingText });

      if (!this.languageSelectionPending && activeSecondary) {
        this.emit({ type: "transcript", role: "assistant", text: activeSecondary });
        this.conversationHistory.push({ role: "assistant", content: activeSecondary });
      }

      void (async () => {
        let playedOpening = false;
        try {
          if (!this.greetingActive || !this.audioCtx || !this.player) return;

          // Load and play pre-recorded Soniox audio (saves 100% of TTS credits, 0ms synthesis delay)
          if (this.languageSelectionPending) {
            // One clip: welcome + recording notice + language question.
            const openingBuf = await getPreRecordedAudioBuffer(this.audioCtx, "greeting_language");
            if (openingBuf && this.greetingActive && this.player) {
              this.player.playAudioBuffer(openingBuf);
              playedOpening = true;
            }
          } else {
            const greetingBuf = await getPreRecordedAudioBuffer(this.audioCtx, "greeting");
            if (greetingBuf && this.greetingActive && this.player) {
              this.player.playAudioBuffer(greetingBuf);
            }
            const ivrBuf = await getPreRecordedAudioBuffer(this.audioCtx, "ivr");
            if (ivrBuf && this.greetingActive && this.player) {
              this.player.playAudioBuffer(ivrBuf);
            }
          }
            if (this.greetingActive && this.player) {
              await this.player.waitUntilFinished();
            }
            if (
              this.languageSelectionPending &&
              !playedOpening &&
              this.greetingActive &&
              this.ttsWs
            ) {
              await this.ttsWs.speakWhenReady(activeSecondary);
              this.ttsWs.flush();
              await this.ttsWs.waitForFlush(8000);
              await this.player?.waitUntilFinished();
            }
         } catch (err) {
          console.warn("Failed to play pre-recorded audio, falling back to TTS:", err);
          if (this.ttsWs && this.greetingActive) {
            if (this.languageSelectionPending) {
              await this.ttsWs.speakWhenReady(activeSecondary);
            } else {
              await this.ttsWs.speakWhenReady(activeGreeting);
              if (activeSecondary) {
                await this.ttsWs.speakWhenReady(activeSecondary);
              }
            }
            this.ttsWs.flush();
            await this.ttsWs.waitForFlush(8000);
            await this.player?.waitUntilFinished();
          }
        } finally {
          if (this.greetingActive) {
            // stop() clears greetingActive, so this only broadcasts for a
            // rotating/interrupted greeting while the call is still live.
            this.greetingActive = false;
            this.setAssistantSpeaking(false);
            this.turnPhase.reset();
            if (this.isCallActive) {
             // IVR gate: transcription stays OFF until the caller presses a
             // DTMF key (1/2/...). Enter the "press a key" wait phase.
             this.enterDtmfWait();
             // Still nothing from the caller? Re-ask, then warn, then hang up.
             this.armInactivityTimer();
            }
          }
        }
      })();
    }
  }


  /**
   * Re-armed on every fresh STT final. The commit only fires when no new
   * transcript text has arrived for the full window — this is what glues
   * multi-clause speech into ONE user turn even when Soniox segments it
   * into several finalized slices.
   */
  private armTextActivityCommit(delayMs: number) {
    if (this.speechFinalDebounceTimer) {
      clearTimeout(this.speechFinalDebounceTimer);
    }
    this.speechFinalDebounceTimer = setTimeout(() => {
      void this.attemptFlush("commit_quiet_after_finals");
    }, delayMs);
  }

  /**
   * Commit gate: never dispatch the turn to the LLM while the user is still
   * physically producing speech. If mic audio is active (or was active within
   * the last 300ms), postpone instead of committing — this is the guard that
   * stops "half a sentence" turns from racing the user's own continuation.
   */
  /**
   * Commit gate: never dispatch the turn to the LLM while the user is still
   * mid-utterance.
   *
   * `engineEnded` means the STT provider itself declared the turn finished
   * (<end>/<fin>). That matters in a loud room: the local VAD decides "speech
   * stopped" from spectral energy against an adaptive noise floor, so with
   * background noise the noise floor rises and the silence detector can stay
   * latched on speech indefinitely. Waiting on it there added seconds to every
   * turn for no benefit, because the engine has already told us the caller
   * stopped. So when the engine has ended the turn we trust it — but only after
   * a bounded grace period, so a genuine mid-sentence pause is not cut off and
   * later clauses still join the same turn.
   */
  private async attemptFlush(reason: string, engineEnded = false) {
    if (this.speechFinalDebounceTimer) {
      clearTimeout(this.speechFinalDebounceTimer);
      this.speechFinalDebounceTimer = null;
    }

    if (engineEnded && this.t_engine_end === 0) this.t_engine_end = performance.now();

    const sinceMicSpeech =
      this.t_last_mic_speech > 0 ? performance.now() - this.t_last_mic_speech : Infinity;
    const vadBusy = this.vad.isSpeaking() || sinceMicSpeech < 300;
    const engineGraceElapsed =
      engineEnded && this.t_engine_end > 0 && performance.now() - this.t_engine_end >= 900;

    if (vadBusy && !engineGraceElapsed) {
      this.speechFinalDebounceTimer = setTimeout(() => {
        void this.attemptFlush(reason, engineEnded);
      }, 200);
      return;
    }

    this.t_engine_end = 0;
     await this.flushAccumulatedUtterance();
  }

  private async flushAccumulatedUtterance() {
    if (this.speechFinalDebounceTimer) {
      clearTimeout(this.speechFinalDebounceTimer);
      this.speechFinalDebounceTimer = null;
    }

    let fullText = this.accumulatedSegments.join(" ").trim();
    if (!fullText && this.currentTranscript.trim().length > 0) {
      fullText = this.currentTranscript.trim();
    }

    if (!fullText || fullText.length === 0) return;

    // Speaking is as valid as pressing a key at the root menu, so a committed
    // utterance must release the hold. The keypad path does this in
    // sendUserMessageInternal; without it here the UI would still read
    // "press a key" after the caller had already been answered.
    this.exitDtmfWait();

    // A caller who SPEAKS at the root menu is doing general enquiry — that is
    // what option 1 means. generalQueryMode used to be set only by the keypad
    // handler, so a spoken turn was answered by the LLM but left the rest of the
    // general-query loop dead: no offer to switch into the problem phase
    // (armOfferFromAssistantTurn), no inactivity escalation, no cut-call handling.
    // Enter the mode silently: they have already stated the problem, so
    // re-prompting "আপনার প্রশ্নটি বলুন" would just repeat what they said.
    if (!this.generalQueryMode && this.intakeStep === "idle" && !this.isCaseTrackingStep()) {
      this.generalQueryMode = true;
      this.inactivityPhase = "off";
    }

    const turnEpoch = ++this.activityEpoch;
    this.accumulatedSegments = [];
    this.currentTranscript = "";
    // The turn is committed, so the live line has served its purpose. An empty
    // interim clears it rather than leaving a stale partial on screen.
    this.emit({ type: "interim_transcript", text: "" });

      if (this.blindAccessState === "pin_ready") {
        if (await this.handleBlindPinInput(fullText)) return;
      }
      if (this.languageSelectionPending) {
        if (await this.handleLanguageSelectionInput(fullText)) return;
      }
      if (this.isCallCutIntent(fullText)) {
        await this.cutCall("caller");
        return;
      }
      if (this.severityConfirmation && (await this.handleApplicationOfferInput(fullText))) return;
      if (this.generalQueryMode && (await this.handleVoiceInput(fullText))) return;

     // Case Intake Multi-Step Chaining Voice Hook
     if (this.intakeStep === "semantic_confirmation") {
       await this.handleSemanticConfirmationInput(fullText);
       return;
     }

     if (this.intakeStep !== "idle" && this.intakeStep !== "complete") {
       if (this.intakeStep === "problem" && this.indigenousLanguage !== "bn") {
         const semanticResult = await this.interpretIndigenousUtterance(fullText);
         if (semanticResult?.matched && semanticResult.confidence >= 0.6) {
           this.pendingSemanticResult = semanticResult;
           this.intakeData.semanticMatched = true;
           this.intakeData.semanticConfidence = semanticResult.confidence;
           this.intakeData.semanticIntent = semanticResult.legalIntent;
           this.intakeData.semanticNormalizedBangla = semanticResult.normalizedBangla;
           this.intakeData.semanticMatchedTerms = semanticResult.matches.map((match) => match.matchedText);
           this.intakeData.semanticLegalIntentBn = semanticResult.legalIntentBn;
           this.intakeData.semanticQuestion = semanticResult.clarificationQuestionBn;
           this.intakeStep = "semantic_confirmation";
           this.emit({
             type: "intake_step_changed",
             step: "semantic_confirmation",
             data: this.intakeData,
           });
           if (semanticResult.clarificationQuestionBn) {
             await this.speakAssistantPhrase(semanticResult.clarificationQuestionBn);
           }
           return;
         }
       }

       await this.handleIntakeVoiceInput(fullText);
       return;
     }

     if (this.generalQueryMode) {
       this.clearInactivityTimer();
       if (this.inactivityPhase === "hangup_warn") {
         if (await this.handleInactivityWarningInput(fullText)) return;
         this.inactivityPhase = "off";
       }
       if (await this.handleSeverityInput(fullText)) return;
     }


    // Re-arm Soniox's idle-finalize window for the next turn.
    this.soniox?.resetTurnBuffer();

    const t_stt_final = performance.now();
    const t_speech_end =
      this.t_last_mic_speech > 0 && t_stt_final - this.t_last_mic_speech < 3000
        ? this.t_last_mic_speech
        : t_stt_final - 300;
    this.t_last_mic_speech = 0;

    const stt_ms = Math.max(0, Math.round(t_stt_final - t_speech_end));
    const llmUrl = (this.lastConfig?.llmProxyUrl || "/api/llm").replace(/\/+$/, "");
    const llmModel = this.lastConfig?.llmModel || "openai/gpt-oss-120b";

    const action = this.turnPhase.transition({
      type: "Transcript",
      text: fullText,
      isFinal: true,
    });
    await this.executeTurnAction(action, fullText, llmUrl, llmModel, stt_ms, t_speech_end);
    if (
      this.activityEpoch === turnEpoch &&
      this.generalQueryMode &&
      this.isCallActive &&
      this.intakeStep === "idle"
    ) {
      this.inactivityPhase = "off";
      this.armInactivityTimer();
    }
  }

  private async setupDirectMicStreamer(micStream: MediaStream) {
    if (!this.audioCtx) return;
     const source = this.audioCtx.createMediaStreamSource(micStream);
     this.micSourceNode = source;
     if (this.recordingDestination) source.connect(this.recordingDestination);


    const inputSampleRate = this.audioCtx.sampleRate;
    const targetSampleRate = 16000;
    const TARGET_CHUNK_SAMPLES = 1600; // 100ms at 16kHz

    const handleAudioChunk = (pcmBuffer: ArrayBuffer, floatSamples: Float32Array) => {
      if (!this.isSttReady()) return;

      const isAssistantSpeaking =
        this.isAssistantSpeakingOrPlaying ||
        (this.player ? this.player.hasActivePlayback() : false);

      this.vad.setPlaybackMode(isAssistantSpeaking);

      // In halfDuplex, ignore the mic entirely while the assistant is speaking/playing,
      // or while the opening announcement plays: this guarantees zero echo-triggered
      // barge-in, zero self-interruption of Option 1 or the greeting, and zero
      // acoustic feedback.
      //
      // waitingForDtmf is deliberately NOT in this list. It used to be, and that made
      // the root menu keypad-only: DTMF is produced by the browser's on-screen keypad
      // (playDtmfTone + sendUserMessage) and nothing in this codebase ever *detects*
      // a real DTMF tone. So a caller dialling 16699 from an actual phone, or anyone
      // who simply spoke instead of pressing a key, had their audio discarded before
      // the VAD or STT ever saw it — the call went silent with no way forward.
      // The agent is not speaking during this wait, so there is no echo to reject.
      if (this.halfDuplex && (isAssistantSpeaking || this.greetingActive)) {
        return;
      }

      // 1. Process VAD on true 16kHz formant-matched samples
      const vadEvt = this.vad.process(floatSamples);
      const isPipelineActive = isAssistantSpeaking || this.activeAbortCtrl !== null;

      if (this.vad.isSpeaking()) {
        this.t_last_mic_speech = performance.now();
      }

      if (vadEvt === VadEvent.SpeechStart) {
        if (this.speechFinalDebounceTimer) {
          clearTimeout(this.speechFinalDebounceTimer);
          this.speechFinalDebounceTimer = null;
        }
        const action = this.turnPhase.transition({
          type: "SpeechStarted",
          pipelineWasActive: isPipelineActive,
        });
        this.handleAction(action);
      } else if (vadEvt === VadEvent.SpeechEnd) {
        this.t_last_mic_speech = performance.now();
        // Smart-Turn preview over the FULL accumulated utterance (segments +
        // interim), not just the latest interim fragment.
        const previewText =
          [...this.accumulatedSegments, this.currentTranscript].filter(Boolean).join(" ").trim();
        const prediction = this.smartTurn.predict(previewText, 0);
        const action = this.turnPhase.transition({
          type: "SpeechEnded",
          smartComplete: prediction.isComplete,
        });
        this.handleAction(action);

        if (this.accumulatedSegments.length > 0 || this.currentTranscript.length > 0) {
          // Smart-Turn-gated EOT delay: a turn predicted complete commits after
          // a short confirmation pause; a turn ending mid-thought (connector
          // word, trailing filler) gets a long grace window so the rest of the
          // sentence joins the SAME turn instead of firing the LLM early.
          const delay = prediction.isComplete ? 500 : 1300;
          if (this.speechFinalDebounceTimer) clearTimeout(this.speechFinalDebounceTimer);
          this.speechFinalDebounceTimer = setTimeout(() => {
            void this.attemptFlush("vad_speech_end_smart_turn");
          }, delay);
        }
      }

      // In halfDuplex, only mute mic audio going to STT if the assistant is still speaking AND user is not actively speaking (barge-in)
      if (this.halfDuplex && isAssistantSpeaking && !this.vad.isSpeaking()) {
        return;
      }

      // 2. Transmit 16kHz PCM16 chunk directly to STT
      this.soniox?.sendAudio(pcmBuffer);
    };

    // Attempt high-performance off-main-thread AudioWorklet
    let workletReady = false;
    try {
      const registered = await registerDownsampleWorklet(this.audioCtx);
      if (registered && typeof AudioWorkletNode !== "undefined") {
        const workletNode = new AudioWorkletNode(this.audioCtx, "voice-downsample-processor", {
          processorOptions: {
            targetSampleRate,
            chunkSamples: TARGET_CHUNK_SAMPLES,
          },
        });
        workletNode.port.postMessage({ type: "set_mute", muted: false });

        workletNode.port.onmessage = (evt) => {
          if (evt.data && evt.data.type === "chunk") {
            const floatSamples = new Float32Array(evt.data.floats);
            handleAudioChunk(evt.data.pcm, floatSamples);
          }
        };

        source.connect(workletNode);
        const silentGain = this.audioCtx.createGain();
        silentGain.gain.value = 0;
        workletNode.connect(silentGain);
        silentGain.connect(this.audioCtx.destination);
        this.micWorkletNode = workletNode;
        workletReady = true;
      }
    } catch (e) {
      console.warn("[voice-session] AudioWorklet setup failed, using zero-GC ScriptProcessor fallback", e);
    }

    if (!workletReady) {
      // Fallback: Optimized Zero-GC ScriptProcessorNode
      const scriptNode = this.audioCtx.createScriptProcessor(1024, 1, 1);
      this.micScriptNode = scriptNode;

      const pcmBuffer = new Int16Array(TARGET_CHUNK_SAMPLES);
      const floatBuffer = new Float32Array(TARGET_CHUNK_SAMPLES);
      let bufIdx = 0;
      let fraction = 0;
      const ratio = inputSampleRate / targetSampleRate;

      scriptNode.onaudioprocess = (audioEvt) => {
        if (!this.isSttReady()) return;
        const inputBuffer = audioEvt.inputBuffer.getChannelData(0);
        const len = inputBuffer.length;
        let i = fraction;

        while (i < len) {
          const idx = Math.floor(i);
          const nextIdx = Math.min(idx + 1, len - 1);
          const frac = i - idx;
          const s = inputBuffer[idx] * (1 - frac) + inputBuffer[nextIdx] * frac;
          const clamped = Math.max(-1, Math.min(1, s));

          floatBuffer[bufIdx] = clamped;
          pcmBuffer[bufIdx] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
          bufIdx++;

          if (bufIdx >= TARGET_CHUNK_SAMPLES) {
            const pcmCopy = new Int16Array(pcmBuffer);
            const floatCopy = new Float32Array(floatBuffer);
            handleAudioChunk(pcmCopy.buffer, floatCopy);
            bufIdx = 0;
          }

          i += ratio;
        }

        fraction = i - len;
      };

      source.connect(scriptNode);
      const silentGain = this.audioCtx.createGain();
      silentGain.gain.value = 0;
      scriptNode.connect(silentGain);
      silentGain.connect(this.audioCtx.destination);
    }
  }

  private handleAction(action: { type: string; [k: string]: unknown }) {
    switch (action.type) {
      case "InterruptTts": {
        this.interruptAssistant();
        // Restore mic/access state after a barged-in playback so a spurious
        // spurious (echo) barge-in can never leave the session muted mid-greeting.
        this.setAssistantSpeaking(false);
        this.turnPhase.reset();
        this.emit({ type: "state_changed", state: "listening" });
        break;
      }
      case "ArmFallbackTimer": {
        if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
        this.fallbackTimer = setTimeout(() => {
          this.turnPhase.transition({ type: "FallbackTimerFired" });
        }, (action.timeoutMs as number) || 1200);
        break;
      }
      case "CancelFallbackTimer": {
        if (this.fallbackTimer) {
          clearTimeout(this.fallbackTimer);
          this.fallbackTimer = null;
        }
        break;
      }
    }
  }

  private async executeTurnAction(
    action: { type: string; text?: string },
    fullText: string,
    llmUrl: string,
    llmModel: string,
    stt_ms: number,
    t_speech_end: number,
  ) {
    if (action.type === "StartLlm" || action.type === "CommitBargeIn") {
      const textToPrompt = action.text || fullText;
      this.emit({ type: "transcript", role: "user", text: textToPrompt });
      this.setAssistantSpeaking(true);
      this.emit({ type: "state_changed", state: "speaking" });

      this.conversationHistory.push({ role: "user", content: textToPrompt });
      await this.generateAndSpeakResponse(llmUrl, llmModel, stt_ms, t_speech_end);
      this.armOfferFromAssistantTurn(textToPrompt);
    } else if (action.type === "RejectNoise") {
      // Noise was rejected but playback (+ mic mute) may already have been torn
      // down by InterruptTts — always restore the listening state so the session
      // can never get wedged with the mic muted.
      this.setAssistantSpeaking(false);
      this.turnPhase.reset();
      this.emit({ type: "state_changed", state: "listening" });
    } else if (fullText.trim().length > 0) {
      // Fallback: If turnPhase returned "None" but we have genuine user speech, NEVER discard it!
      const textToPrompt = fullText.trim();
      this.emit({ type: "transcript", role: "user", text: textToPrompt });
      this.setAssistantSpeaking(true);
      this.emit({ type: "state_changed", state: "speaking" });

      this.conversationHistory.push({ role: "user", content: textToPrompt });
      await this.generateAndSpeakResponse(llmUrl, llmModel, stt_ms, t_speech_end);
      this.armOfferFromAssistantTurn(textToPrompt);
    }
  }

  /**
   * Broad, deterministic signal that the caller has described a personal legal
   * problem. The LLM is allowed to phrase its offer however it likes, so the
   * offer question itself must never depend on the LLM's wording.
   */
  private looksLikePersonalProblem(text: string): boolean {
    const personal = /(আমার|আমাকে|আমাদের|আমি|আমার\s+(স্বামী|স্ত্রী|পিতা|মাতা|ছেলে|মেয়ে|বাবা|মা))/;
    const problem =
      /(মারধর|মারতে|মারেন|মেরেছে|মারছে|নির্যাতন|হয়েছে|হচ্ছে|ঘটেছে|ঘটে|সমস্যা|অভিযোগ|চাই|চাইছি|চায়|পাইনি|পাই|দেন না|দেয় না|নেই|নাই|চাপ|চাপে|ভয়|পারে না|পারিনি|বাধা|অন্যায়|প্রতারণা|জমি|দখল|বেতন|চাকরি|গার্মেন্ট|মামলা|জামিন|ধার|ঋণ|তালাক|যৌতুক|কর্তার|প্রতারক|হয়েছে)/;
    return personal.test(text) && problem.test(text);
  }

  private armOfferFromAssistantTurn(userText: string): void {
    if (!this.isCallActive || !this.generalQueryMode) return;
    if (this.severityConfirmation) return;
    const query = userText.trim();
    if (!query) return;

    if (this.assistantOfferedApplication(this.assistantTurnText)) {
      this.armApplicationOffer(query);
      return;
    }

    if (!this.looksLikePersonalProblem(query)) return;

    // The LLM answered but never asked the yes/no question. Ask it ourselves so
    // the caller always gets one tracked, answerable offer.
    this.armApplicationOffer(query);
    void this.speakAssistantPhrase(
      "আপনার সমস্যাটি বুঝতে পেরেছি। আপনি কি এই সমস্যার জন্য আইনি সহায়তা আবেদন ও অভিযোগ নথিভুক্ত করতে চান? হ্যাঁ অথবা না বলুন, অথবা ডায়ালপ্যাডে ১ অথবা ২ চাপুন।",
    );
  }

  private interruptAssistant() {
    this.assistantSpeechGeneration += 1;
    this.interruptAudioPlayback();
  }

  private interruptAudioPlayback() {
    if (this.speechFinalDebounceTimer) {
      clearTimeout(this.speechFinalDebounceTimer);
      this.speechFinalDebounceTimer = null;
    }
    this.greetingActive = false;
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.activeAbortCtrl) {
      this.activeAbortCtrl.abort();
      this.activeAbortCtrl = null;
    }
    if (this.ttsWs) {
      this.ttsWs.clear();
    }
    if (this.player) {
      this.player.reset();
    }
  }

  private async generateAndSpeakResponse(
    llmUrl: string,
    llmModel: string,
    stt_ms: number,
    t_speech_end: number,
  ) {
    this.interruptAssistant();
    const activityEpoch = this.activityEpoch;
    this.t_first_pcm_chunk = 0;
    this.assistantTurnText = "";
    this.captureAssistantTurn = true;

    const t_llm_start = performance.now();
    let t_llm_ttft = 0;
    let t_sentence1_sent = 0;
    let textSentToTts = false;

    const abortCtrl = new AbortController();
    this.activeAbortCtrl = abortCtrl;

    // Attach high-precision sub-millisecond audio playback telemetry hook
    if (this.player) {
      this.player.onFirstPlay = (tPlay: number) => {
        if (this.activityEpoch !== activityEpoch) return;
        const safe_ttft = t_llm_ttft > 0 ? t_llm_ttft : performance.now();
        const safe_sentence1 = t_sentence1_sent > 0 ? t_sentence1_sent : safe_ttft + 40;

        const safe_first_pcm = this.t_first_pcm_chunk > 0 ? this.t_first_pcm_chunk : tPlay - 2;

        const llm_ttft_ms = Math.max(0, Math.round(safe_ttft - t_llm_start));
        const sentence1_gen_ms = Math.max(0, Math.round(safe_sentence1 - safe_ttft));
        const tts_synthesis_ms = Math.max(0, Math.round(safe_first_pcm - safe_sentence1));
        const tts_first_audio_ms = Math.max(0, Math.round(tPlay - safe_first_pcm));
        const total_voice_latency_ms = Math.max(0, Math.round(tPlay - t_speech_end));

        this.emit({
          type: "latency_metrics",
          stt_ms,
          llm_ttft_ms,
          sentence1_gen_ms,
          tts_synthesis_ms,
          tts_first_audio_ms,
          total_voice_latency_ms,
        });
      };
    }

    try {
      const res = await fetch(llmUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          model: llmModel,
           messages: this.conversationHistory,
           authenticatedUser: this.authenticatedUser,
           indigenousLanguage: this.indigenousLanguage,
           stream: true,

          temperature: 0.7,
        }),
        signal: abortCtrl.signal,
      });

      if (this.activityEpoch !== activityEpoch || !this.isCallActive) return;

      if (!res.ok || !res.body) {
        throw new Error(`LLM request failed: ${res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullAssistantText = "";
      let sentenceBuffer = "";

      while (true) {
         const { done, value } = await reader.read();
         if (this.activityEpoch !== activityEpoch || !this.isCallActive) return;

        if (done) break;

        const chunkStr = decoder.decode(value, { stream: true });
        const lines = chunkStr.split("\n");

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.tool_call) {
              this.emit({
                type: "tool_activity",
                tool_name: parsed.tool_call.name,
                message: `Executing tool: ${parsed.tool_call.name}`,
              });
            }
            const token = parsed.choices?.[0]?.delta?.content || "";
            if (token) {
              if (t_llm_ttft === 0) {
                t_llm_ttft = performance.now();
              }

              fullAssistantText += token;
              sentenceBuffer += token;

              // Prosody-Preserving Natural Sentence & Clause Chunker:
              let flushChunk = "";
              // 1. Strong sentence boundary (. ! ? । \n)
              const strongMatch = sentenceBuffer.match(/^([\s\S]+?[.!?।\n]+)\s*(.*)$/);
              if (strongMatch) {
                flushChunk = strongMatch[1].trim();
                sentenceBuffer = strongMatch[2];
              } else {
                // 2. Meaningful clause boundary (, ; : —) with at least 15 characters
                const weakMatch = sentenceBuffer.match(/^([\s\S]+?[,;:—–])\s*(.*)$/);
                if (weakMatch && weakMatch[1].trim().length >= 15) {
                  flushChunk = weakMatch[1].trim();
                  sentenceBuffer = weakMatch[2];
                } else if (sentenceBuffer.length >= 65) {
                  // 3. Fallback on complete word boundary for very long sentences
                  const lastSpace = sentenceBuffer.lastIndexOf(" ");
                  if (lastSpace > 20) {
                    flushChunk = sentenceBuffer.substring(0, lastSpace).trim();
                    sentenceBuffer = sentenceBuffer.substring(lastSpace + 1);
                  }
                }
              }

              if (flushChunk.length > 0) {
                if (t_sentence1_sent === 0) {
                  t_sentence1_sent = performance.now();
                }
                if (this.activityEpoch !== activityEpoch) return;
                // Batched IPC dispatch (reduces 98% of synchronous CDP thread stalls)
                this.emit({ type: "transcript_chunk", role: "assistant", text: flushChunk + " " });

                if (this.ttsWs) {
                  textSentToTts = true;
                  void this.ttsWs.speakWhenReady(flushChunk);
                }
              }
            }
          } catch {}
        }
      }

      if (sentenceBuffer.trim().length > 0) {
        if (t_sentence1_sent === 0) {
          t_sentence1_sent = performance.now();
        }
        if (this.activityEpoch !== activityEpoch) return;
        this.emit({ type: "transcript_chunk", role: "assistant", text: sentenceBuffer.trim() });
        if (this.ttsWs) {
          textSentToTts = true;
          await this.ttsWs.speakWhenReady(sentenceBuffer.trim());
          if (this.activityEpoch !== activityEpoch) return;
        }
      }

      // Signal completion of utterance to WebSocket TTS and wait for synthesis + audio drain
      if (this.ttsWs && textSentToTts) {
        this.ttsWs.flush();
        await this.ttsWs.waitForFlush(8000);
        if (this.activityEpoch !== activityEpoch) return;
      }

      if (fullAssistantText.trim().length > 0) {
        this.emit({ type: "transcript", role: "assistant", text: fullAssistantText.trim() });
        this.conversationHistory.push({ role: "assistant", content: fullAssistantText.trim() });
        // Only a general inquiry is an advice record. A case intake writes a case, and
        // writing both would double-count the same call in two registers.
        if (this.generalQueryMode) {
          this.lastAdviceText = fullAssistantText.trim();
          this.persistAdviceRecord(false);
        }
      }

      if (this.player) {
        await this.player.waitUntilFinished();
        if (this.activityEpoch !== activityEpoch) return;
      }

      this.setAssistantSpeaking(false);
      this.turnPhase.reset();
      this.emit({ type: "state_changed", state: "listening" });
    } catch (err: unknown) {
      if (
        this.activityEpoch === activityEpoch &&
        (err as { name?: string })?.name !== "AbortError"
      ) {
        this.emit({ type: "error", message: `Direct LLM Error: ${String(err)}` });
      }
    } finally {
      this.captureAssistantTurn = false;
      if (this.activityEpoch === activityEpoch) {
        if (this.activeAbortCtrl === abortCtrl) {
          this.activeAbortCtrl = null;
        }
        this.setAssistantSpeaking(false);
        this.turnPhase.reset();
      }
    }
  }

  private setAssistantSpeaking(speaking: boolean) {
    this.isAssistantSpeakingOrPlaying = speaking;
    if (this.halfDuplex) {
      this.emit({ type: "mic_mute_changed", muted: speaking });
      if (this.micWorkletNode) {
        this.micWorkletNode.port.postMessage({ type: "set_mute", muted: speaking });
      }
    }
  }

  /**
   * Root-menu hold. The caller may press a key on the on-screen keypad OR simply
   * speak — the mic is deliberately left unmuted, because DTMF is only ever
   * produced by that keypad and a real telephone caller pressing 1/2/3 would
   * otherwise be silenced with no route forward. Nothing is spoken here, so
   * there is no echo for the VAD to reject.
   */
  private enterDtmfWait() {
    if (this.languageSelectionPending) {
      this.emit({ type: "state_changed", state: "listening" });
      return;
    }
    this.waitingForDtmf = true;
    this.turnPhase.reset();
    // The mic stays live, so report it as such rather than claiming it is muted.
    this.emit({ type: "mic_mute_changed", muted: false });
    this.emit({ type: "state_changed", state: "dtmf_wait" });
  }

  private exitDtmfWait() {
    if (!this.waitingForDtmf) return;
    this.waitingForDtmf = false;
    this.emit({ type: "mic_mute_changed", muted: false });
    if (this.micWorkletNode) {
      this.micWorkletNode.port.postMessage({ type: "set_mute", muted: false });
    }
    this.emit({ type: "system", text: "DTMF route selected — transcription enabled" });
  }

  /**
   * Start / restart the 10-second inactivity timer.
   * Only active when in generalQueryMode (keypad 1) and no active intake chain.
   */
  private armInactivityTimer(): void {
    this.clearInactivityTimer();
    if (!this.isCallActive) return;
    if (this.isCaseTrackingStep()) {
      // The mic is muted while a PIN is keyed, so the query/warn/hangup
      // escalation has nothing to listen for. One longer grace window, then
      // the call is closed with the recorded sign-off.
      this.inactivityTimer = setTimeout(() => {
        void this.handleCaseTrackingTimeout();
      }, 20_000);
      return;
    }
    if (!this.generalQueryMode && this.intakeStep !== "language") return;
    if (this.intakeStep !== "idle" && this.intakeStep !== "application_confirm" && this.intakeStep !== "language") {
      return; // intake chain handles its own pacing
    }
    if (this.voiceLoginMode !== "off") return;

    this.inactivityTimer = setTimeout(() => {
      void this.handleInactivityFired();
    }, 10_000);
  }

  /** Mirrors the PIN draft and attempt count into intakeData for the keypad UI. */
  private syncCasePinState(): void {
    this.intakeData.casePinDraft = this.casePinDraft;
    this.intakeData.casePinAttempts = this.casePinAttempts;
  }

  private isCaseTrackingStep(): boolean {
    return this.intakeStep === "case_tracking" || this.intakeStep === "case_pin" || this.intakeStep === "case_result";
  }

  /** Closes a tracking call that has gone quiet, with the recorded sign-off. */
  private async handleCaseTrackingTimeout(): Promise<void> {
    if (!this.isCallActive || !this.isCaseTrackingStep()) return;
    this.clearInactivityTimer();
    if (this.isAssistantSpeakingOrPlaying) {
      this.armInactivityTimer();
      return;
    }
    await this.speakAssistantPhrase(
      "দীর্ঘক্ষণ কোনো সাড়া না পাওয়ায় কলটি শেষ করা হচ্ছে। যেকোনো আইনি তথ্যের জন্য ১৬৬৯৯ নম্বরে আবার কল করুন। বাংলাদেশ লিগ্যাল এইডের সাথে থাকার জন্য ধন্যবাদ।",
      "inactivity_hangup",
    );
    this.endCaseTrackingCall();
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private blindPinPrompt(): string {
    const pin = this.blindVoicePin || "";
    return `আপনার ভয়েস লগইন পিন হলো ${pin}। আমি আবার বলছি: ${pin}। পরবর্তী কলে ১ চেপে লগইন বলুন এবং এই পিনটি দিয়ে আপনার কেসের তথ্য শুনুন। আবার শুনতে চাইলে স্টার বা অ্যাস্টেরিস্ক চিহ্ন চাপুন, আর কল শেষ করতে হ্যাশ চিহ্ন চাপুন।`;
  }

  private async handleBlindPinInput(input: string): Promise<boolean> {
    const clean = input.trim();
    if (!clean) return true;
    this.emit({ type: "transcript", role: "user", text: clean });
    this.conversationHistory.push({ role: "user", content: clean });

    if (/(?:\*|＊|আবার|আরেকবার|পুনরায়|repeat)/i.test(clean)) {
      await this.speakAssistantPhrase(this.blindPinPrompt());
      return true;
    }

    if (/(?:#|＃|কল শেষ|শেষ কর|বন্ধ কর|end)/i.test(clean)) {
      if (!this.completedBlindUser || !this.completedBlindDocketId) {
        this.blindAccessState = "off";
        await this.speakAssistantPhrase("দুঃখিত, আপনার ভয়েস লগইন তথ্য পাওয়া যায়নি। দয়া করে আবার কল করুন।");
        return true;
      }
      const closingText =
        "আপনার আইনি সহায়তার আবেদন নথিভুক্ত হয়েছে এবং ভয়েস লগইন পিনটি সংরক্ষিত আছে। ভবিষ্যতে ১ চেপে লগইন বলে পিন দিয়ে কেসের তথ্য ও আপডেট শুনতে পারবেন। আপনাকে ধন্যবাদ, কলটি শেষ করা হচ্ছে।";
      await this.speakAssistantPhrase(closingText);
      const user = this.completedBlindUser;
      const docketId = this.completedBlindDocketId;
      this.blindAccessState = "off";
      this.intakeStep = "idle";
      this.emit({ type: "intake_step_changed", step: "idle", data: this.intakeData });
      this.emit({ type: "intake_complete", docketId, user });
      return true;
    }

    await this.speakAssistantPhrase(
      "আবার শুনতে চাইলে স্টার চাপুন, আর কল শেষ করতে হ্যাশ চাপুন। আপনার পিনটি আবার বলা হল।",
    );
    return true;
  }

  private isVoiceLoginRequest(input: string): boolean {
    return /(লগইন|লগ ইন|login|ভয়েস.*পিন|আগের.*(?:কেস|আবেদন|মামলা)|আমার.*(?:কেস|আবেদন|মামলা).*(?:অবস্থা|আপডেট|স্ট্যাটাস|ট্র্যাক))/i.test(input);
  }

  private isVoiceCaseRequest(input: string): boolean {
    return (
      /(আমার|আমার আগের).*(তথ্য|অবস্থা|আপডেট|কেস|আবেদন|মামলা)/i.test(input) ||
      /(কেস|আবেদন|মামলা).*(অবস্থা|আপডেট|স্ট্যাটাস|ট্র্যাক|খবর|কী হয়েছে)|ট্র্যাক.*(?:কেস|আবেদন)/i.test(input)
    );
  }

  private getLanguageFromInput(input: string): IndigenousLanguage | null {
    const clean = input.trim();
    const digit = clean.match(/[123]/)?.[0] || clean.match(/[১২৩]/)?.[0];
    if (digit === "1" || digit === "১" || /(বাংলা|bangla|bangali|bn)/i.test(clean)) return "bn";
    if (digit === "2" || digit === "২" || /(মারমা|marma)/i.test(clean)) return "marma";
    if (digit === "3" || digit === "৩" || /(চাকমা|chakma)/i.test(clean)) return "chakma";
    return null;
  }

  private async handleLanguageSelectionInput(input: string): Promise<boolean> {
    const language = this.getLanguageFromInput(input);
    if (!language) return false;
    this.indigenousLanguage = language;
    this.languageSelectionPending = false;
    this.intakeStep = "idle";
    this.intakeData.indigenousLanguage = language;
    this.emit({ type: "intake_step_changed", step: "idle", data: this.intakeData });
    // No acknowledgement: the keypress is its own. The 1/2/3 menu is announced
    // exactly once, here, now that the language prompt no longer carries it.
    // "ivr" is the pre-recorded root menu, so this costs no TTS.
    await this.speakAssistantPhrase(ROOT_MENU_PROMPT, "ivr");
    if (this.isCallActive) this.enterDtmfWait();
    return true;
  }

  private isCallCutIntent(input: string): boolean {
    const clean = input.trim();
    if (/(কল|ফোন|কথোপকথন).*(করতে চাই না|করবেন না|কাটবেন না|রাখবেন না|নয়|না রাখুন)/i.test(clean)) return false;
    return (
      /^(#|#️⃣)$/.test(clean) ||
      /(কল|ফোন|কথোপকথন).*(শেষ করুন|শেষ করো|বন্ধ করুন|বন্ধ করো|কাটুন|কেটে দিন|ছাড়ুন|রেখে দিন|শেষ করতে চাই)/i.test(clean) ||
      /^(হ্যাঁ|হাঁ|জি)[,\s]+.*(কল|ফোন).*(শেষ|বন্ধ|কাটা)/i.test(clean)
    );
  }

  public async cutCall(reason: CallEndReason = "caller"): Promise<void> {
    // A hangup is the last chance to write, so it bypasses the debounce.
    this.persistAdviceRecord(true);
    if (!this.isCallActive) return;
    const activityEpoch = ++this.activityEpoch;
    this.clearInactivityTimer();
    this.inactivityPhase = "off";
    this.generalQueryMode = false;
    this.voiceLoginMode = "off";
    this.exitDtmfWait();
    this.interruptAssistant();
    this.setAssistantSpeaking(true);
    this.emit({ type: "state_changed", state: "speaking" });
    const text = reason === "timeout"
      ? "দীর্ঘক্ষণ কোনো সাড়া না পাওয়ায় কলটি শেষ করা হচ্ছে। যেকোনো আইনি তথ্যের জন্য ১৬৬৯৯ নম্বরে আবার কল করুন। বাংলাদেশ লিগ্যাল এইডের সাথে থাকার জন্য ধন্যবাদ।"
      : "ঠিক আছে, আপনার কল শেষ করা হচ্ছে। আপনার প্রয়োজনে ১৬৬৯৯ নম্বরে আবার কল করুন। ধন্যবাদ।";
    await this.speakAssistantPhrase(text);
    if (this.isCallActive && this.activityEpoch === activityEpoch) {
      this.emit({ type: "system", text: reason === "timeout" ? "INACTIVITY_HANGUP" : "CALLER_HANGUP" });
      setTimeout(() => {
        if (this.isCallActive && this.activityEpoch === activityEpoch) this.stop();
      }, 250);
    }
  }

  private async handleVoiceInput(input: string): Promise<boolean> {
    const clean = input.trim();
    if (!clean) return false;

    if (this.voiceLoginMode !== "off") {
      return this.handleVoiceLoginInput(clean);
    }

    if (this.authenticatedUser && this.isVoiceCaseRequest(clean)) {
      return this.handleVoiceCaseLookup(clean);
    }

    if (this.isVoiceLoginRequest(clean)) {
      this.voiceLoginMode = "awaiting_pin";
      this.voiceLoginPin = null;
      this.voiceLoginAttempts = 0;
      this.emit({ type: "transcript", role: "user", text: clean });
      this.conversationHistory.push({ role: "user", content: clean });
      await this.speakAssistantPhrase(
        "আপনার চার সংখ্যার ভয়েস লগইন পিনটি বলুন। পিন চার সংখ্যার হতে হবে।",
      );
      this.inactivityPhase = "off";
      this.armInactivityTimer();
      return true;
    }

    return false;
  }

  private async handleVoiceLoginInput(input: string): Promise<boolean> {
    const clean = input.trim();
    this.emit({ type: "transcript", role: "user", text: clean });
    this.conversationHistory.push({ role: "user", content: clean });

    if (this.voiceLoginMode === "awaiting_pin") {
      const pin = parseVoicePin(clean);
      if (!pin) {
        this.voiceLoginAttempts += 1;
        if (this.voiceLoginAttempts >= 3) {
          this.voiceLoginMode = "off";
          this.voiceLoginPin = null;
          await this.speakAssistantPhrase(
            "তিনবার সঠিক চার সংখ্যার পিন পাওয়া যায়নি। আপনি আবার লগইন চাইলে লগইন বলতে পারেন।",
          );
          return true;
        }
        await this.speakAssistantPhrase("আবার চার সংখ্যার পিনটি ধীরে ও পরিষ্কারভাবে বলুন।");
        this.inactivityPhase = "off";
        this.armInactivityTimer();
        return true;
      }

      this.voiceLoginPin = pin;
      this.voiceLoginMode = "awaiting_name";
      await this.speakAssistantPhrase(
        "পিনটি গ্রহণ করেছি। নিরাপত্তার জন্য আপনার পুরো নামটি একবার বলুন।",
      );
      this.inactivityPhase = "off";
      this.armInactivityTimer();
      return true;
    }

    if (this.voiceLoginMode === "awaiting_name") {
      try {
        const response = await fetch("/api/voice/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: this.voiceLoginPin, displayName: clean }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; user?: SessionUser; error?: string }
          | null;
        if (!response.ok || !payload?.ok || !payload.user) {
          this.voiceLoginMode = "awaiting_pin";
          this.voiceLoginPin = null;
          this.voiceLoginAttempts += 1;
          await this.speakAssistantPhrase(
            this.voiceLoginAttempts >= 3
              ? "পিন বা নাম মিলছে না। তিনবার চেষ্টা করা হয়েছে। আপনি পরে আবার লগইন বলতে পারেন।"
              : "পিন বা নাম মিলছে না। অনুগ্রহ করে নতুন করে চার সংখ্যার পিন বলুন।",
          );
          if (this.voiceLoginAttempts >= 3) this.voiceLoginMode = "off";
          this.inactivityPhase = "off";
          this.armInactivityTimer();
          return true;
        }
        await this.completeVoiceLogin(payload.user);
      } catch {
        await this.speakAssistantPhrase("লগইন সেবাটি এখন পাওয়া যায়নি। আবার চেষ্টা করতে পারেন।");
        this.inactivityPhase = "off";
        this.armInactivityTimer();
      }
      return true;
    }

    return false;
  }

  private async completeVoiceLogin(user: SessionUser): Promise<void> {
    this.authenticatedUser = user;
    this.voiceLoginMode = "off";
    this.voiceLoginPin = null;
    this.voiceLoginAttempts = 0;
    this.emit({ type: "voice_authenticated", user });
    await this.speakAssistantPhrase(
      `আপনি লগইন হয়েছেন, ${user.displayName}। এখন আপনার আবেদন বা কেসের অবস্থা জানতে চাইলে অবস্থা বা আপডেট বলুন।`,
    );
    this.inactivityPhase = "off";
    this.armInactivityTimer();
  }

  private async handleVoiceCaseLookup(input: string): Promise<boolean> {
    this.emit({ type: "transcript", role: "user", text: input });
    this.conversationHistory.push({ role: "user", content: input });
    try {
      const response = await fetch("/api/voice/cases", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; cases?: Array<{ docketId?: string; problem?: string; status?: string }> }
        | null;
      if (!response.ok || !payload?.ok) {
        await this.speakAssistantPhrase("আপনার কেসের তথ্য এখন পাওয়া যায়নি। আবার চেষ্টা করুন অথবা ১৬৬৯৯ হেল্পলাইনে কল করুন।");
        this.inactivityPhase = "off";
        this.armInactivityTimer();
        return true;
      }
      const latest = payload.cases?.[0];
      if (!latest) {
        await this.speakAssistantPhrase("আপনার নামে এখনো কোনো আবেদন পাওয়া যায়নি। নতুন সমস্যা জানাতে ২ চাপুন।");
        this.inactivityPhase = "off";
        this.armInactivityTimer();
        return true;
      }
      const status = latest.status === "submitted" ? "জমা হয়েছে" : latest.status === "under_review" ? "পর্যালোচনাধীন" : latest.status;
      await this.speakAssistantPhrase(
        `আপনার সর্বশেষ আবেদন ডকেট ${latest.docketId || "জানা নেই"}। বর্তমান অবস্থা ${status || "জমা হয়েছে"}। আরও তথ্যের জন্য ডকেট নম্বরটি বলুন।`,
      );
      this.inactivityPhase = "off";
      this.armInactivityTimer();
      return true;
    } catch {
      await this.speakAssistantPhrase("কেসের তথ্য আনতে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
      this.inactivityPhase = "off";
      this.armInactivityTimer();
      return true;
    }
  }

  /**
   * The assistant can offer to file an application either from the severity
   * classifier or ad-hoc from the LLM. Both must arm the same tracked state so
   * the caller's next "হ্যাঁ" always reaches the intake chain instead of the LLM.
   */
  private assistantOfferedApplication(text: string): boolean {
    const clean = text.trim();
    if (!clean) return false;
    const offer = /(নথিভুক্ত করতে চান|আবেদন করতে চান|অভিযোগ করতে চান|আবেদন চালিয়ে যেতে চান|আবেদন ও অভিযোগ নথিভুক্ত|আবেদন দায়ের|আবেদন নিবন্ধন|কেস নথিভুক্ত|আবেদন খুলতে চান)/i.test(clean);
    if (!offer) return false;
    // Must read as a question awaiting an answer, not a statement of fact.
    return /[?।ঃ]\s*$/.test(clean) || /(হ্যাঁ|হাঁ|হ্যা|জি|না|নাই|নেই)/.test(clean);
  }

  private armApplicationOffer(query: string, classification: SeverityClassification | null = null): void {
    this.severityConfirmation = { query, classification };
    this.intakeStep = "application_confirm";
    this.emit({ type: "intake_step_changed", step: "application_confirm", data: this.intakeData });
  }

  private clearApplicationOffer(): void {
    this.severityConfirmation = null;
    if (this.intakeStep === "application_confirm") {
      this.intakeStep = "idle";
      this.emit({ type: "intake_step_changed", step: "idle", data: this.intakeData });
    }
  }

  private async handleApplicationOfferInput(input: string): Promise<boolean> {
    const offer = this.severityConfirmation;
    if (!offer) return false;
    const clean = input.trim();
    if (!clean) return false;

    this.emit({ type: "transcript", role: "user", text: clean });
    const answer = parseBengaliYesNo(clean);
    if (answer === null) {
      await this.speakAssistantPhrase(
        "আপনি কি এই সমস্যার জন্য আইনি সহায়তা আবেদন ও অভিযোগ নথিভুক্ত করতে চান? হ্যাঁ অথবা না বলুন, অথবা ডায়ালপ্যাডে ১ অথবা ২ চাপুন।",
      );
      this.inactivityPhase = "off";
      this.armInactivityTimer();
      return true;
    }

    this.clearApplicationOffer();
    this.conversationHistory.push({ role: "user", content: clean });

    if (answer) {
      await this.startCaseIntakeChain(offer.query, offer.classification ?? undefined);      return true;
    }

    await this.speakAssistantPhrase(
      "ঠিক আছে, আমি শুনছি। আপনার যেকোনো আইনি প্রশ্ন বা পরামর্শের প্রয়োজন হলে নির্দ্বিধায় বলুন, আমি সাহায্য করছি।",
      "inactivity_no_ack",
    );
    this.inactivityPhase = "off";
    this.armInactivityTimer();
    return true;
  }

  private async handleSeverityInput(input: string): Promise<boolean> {
    if (!this.generalQueryMode) return false;
    const clean = input.trim();
    if (!clean) return false;
    // A pending offer owns the next turn; see handleApplicationOfferInput.
    if (this.severityConfirmation) return false;

    const classification = classifySeverity(clean);
    if (!classification.needsApplicationConfirmation) return false;

    this.armApplicationOffer(clean, classification);
    this.emit({ type: "transcript", role: "user", text: clean });
    this.conversationHistory.push({ role: "user", content: clean });
    void this.syncDocketPatch({
      incidentSummary: clean,
      severityLevel: classification.severity,
      severityTags: classification.matchedTags,
      severityFactors: classification.factors,
      severityCategory: classification.category,
      severityCaseReference: classification.caseReference,
      urgency:
        classification.severity === "emergency"
          ? "emergency_danger"
          : classification.severity === "standard"
            ? "normal"
            : "urgent",
    });
    await this.speakAssistantPhrase(classification.acknowledgmentBn);
    this.inactivityPhase = "off";
    this.armInactivityTimer();
    return true;
  }

  private async handleInactivityWarningInput(input: string): Promise<boolean> {
    const clean = input.trim();
    const parsed = parseBengaliYesNo(clean);
    const isYes =
      parsed === true ||
      clean === "1" ||
      clean === "১" ||
      clean === "১ (সাধারণ তথ্য ও নিয়মাবলী)";
    const isNo =
      parsed === false ||
      clean === "2" ||
      clean === "২" ||
      clean === "২ (সমস্যা বা নতুন অভিযোগ)";
    if (!isYes && !isNo) return false;

    const activityEpoch = this.activityEpoch;
    this.inactivityPhase = "off";
    this.emit({ type: "transcript", role: "user", text: clean });

    if (isYes) {
      const pendingSeverity = this.severityConfirmation;
      this.clearApplicationOffer();
      await this.startCaseIntakeChain(pendingSeverity?.query ?? "", pendingSeverity?.classification ?? undefined);
      return true;
    }

    this.clearApplicationOffer();
    const noAckText = "ঠিক আছে, আমি শুনছি। আপনার যেকোনো আইনি প্রশ্ন বা পরামর্শের প্রয়োজন হলে নির্দ্বিধায় বলুন, আমি সাহায্য করছি।";
    this.interruptAssistant();
    this.setAssistantSpeaking(true);
    this.emit({ type: "state_changed", state: "speaking" });
    this.emit({ type: "transcript", role: "assistant", text: noAckText });
    this.conversationHistory.push({ role: "assistant", content: noAckText });
    try {
      if (this.audioCtx && this.player) {
        const buf = await getPreRecordedAudioBuffer(this.audioCtx, "inactivity_no_ack");
        if (this.activityEpoch !== activityEpoch || !this.isCallActive) return true;
        if (buf && this.isCallActive) {
          this.player.playAudioBuffer(buf);
          await this.player.waitUntilFinished();
        } else if (this.ttsWs) {
          await this.ttsWs.speakWhenReady(noAckText);
          if (this.activityEpoch !== activityEpoch) return true;
          this.ttsWs.flush();
          await this.ttsWs.waitForFlush(8000);
          await this.player?.waitUntilFinished();
        }
      }
    } catch {
      if (this.activityEpoch !== activityEpoch || !this.isCallActive) return true;
      if (this.ttsWs) {
        await this.ttsWs.speakWhenReady(noAckText).catch(() => {});
        if (this.activityEpoch !== activityEpoch) return true;
        this.ttsWs.flush();
        await this.ttsWs.waitForFlush(5000).catch(() => {});
      }
    } finally {
      if (
        this.isCallActive &&
        this.generalQueryMode &&
        this.activityEpoch === activityEpoch
      ) {
        this.setAssistantSpeaking(false);
        this.turnPhase.reset();
        this.emit({ type: "state_changed", state: "listening" });
        this.inactivityPhase = "off";
        this.armInactivityTimer();
      }
    }
    return true;
  }

  private async handleInactivityFired(): Promise<void> {
    if (!this.isCallActive) return;
    if (this.isCaseTrackingStep()) return;
    if (!this.generalQueryMode && this.intakeStep !== "language") return;
    if (this.intakeStep !== "idle" && this.intakeStep !== "application_confirm" && this.intakeStep !== "language") {
      this.clearInactivityTimer();
      return;
    }
    if (this.isAssistantSpeakingOrPlaying) {
      // Re-arm: don't interrupt the agent while it's speaking
      this.armInactivityTimer();
      return;
    }

    const sinceMicSpeech =
      this.t_last_mic_speech > 0 ? performance.now() - this.t_last_mic_speech : Infinity;
    if (this.vad.isSpeaking() || sinceMicSpeech < 300) {
      this.armInactivityTimer();
      return;
    }

    const activityEpoch = ++this.activityEpoch;

    if (this.inactivityPhase === "off" || this.inactivityPhase === "query") {
      // === Phase 1: Ask if they want to file a case ===
      this.inactivityPhase = "hangup_warn";
      this.interruptAssistant();
      this.setAssistantSpeaking(true);
      this.emit({ type: "state_changed", state: "speaking" });

      // A silent caller is re-asked with the language question alone. Replaying the
      // whole merged intro would cost another 9s of silence on top of the wait.
      const queryText = this.languageSelectionPending
        ? LANGUAGE_REASK_PROMPT
        : "আপনি কি সরকারি আইনি সহায়তার জন্য কোনো আবেদন বা অভিযোগ নথিভুক্ত করতে চান? হ্যাঁ অথবা না বলুন, অথবা আপনার অন্য কোনো প্রশ্ন থাকলে করতে পারেন।";
      this.emit({ type: "transcript", role: "assistant", text: queryText });
      this.conversationHistory.push({ role: "assistant", content: queryText });

      await this.speakAssistantPhrase(
        queryText,
        this.languageSelectionPending ? undefined : "inactivity_app_query",
      );
       if (this.isCallActive && this.activityEpoch === activityEpoch) {
         this.inactivityPhase = "hangup_warn";
         this.armInactivityTimer();
       }
    } else {
      await this.cutCall("timeout");
    }
  }

  private async speakAssistantPhrase(text: string, preRecordedKind?: AudioKind): Promise<void> {
    const generation = this.assistantSpeechGeneration;
    const run = this.assistantSpeechQueue.then(() => {
      if (generation !== this.assistantSpeechGeneration) return;
      return this.playAssistantPhrase(text, preRecordedKind, generation);
    });
    this.assistantSpeechQueue = run.catch(() => undefined);
    return run;
  }

  private async playAssistantPhrase(
    text: string,
    preRecordedKind: AudioKind | undefined,
    generation: number,
  ): Promise<void> {
    const clean = text.trim();
    if (!clean) return;
    if (this.captureAssistantTurn) this.assistantTurnText += `${clean} `;
    this.interruptAudioPlayback();
    const activityEpoch = this.activityEpoch;
    this.setAssistantSpeaking(true);
    this.emit({ type: "state_changed", state: "speaking" });
    this.emit({ type: "transcript", role: "assistant", text: clean });
    this.conversationHistory.push({ role: "assistant", content: clean });

    if (preRecordedKind && this.audioCtx && this.player) {
       const preRecorded = await getPreRecordedAudioBuffer(this.audioCtx, preRecordedKind);
       if (this.activityEpoch !== activityEpoch || this.assistantSpeechGeneration !== generation || !this.isCallActive) return;

      if (preRecorded) {
         this.player.playAudioBuffer(preRecorded);
         await this.player.waitUntilFinished();
         if (this.activityEpoch !== activityEpoch || this.assistantSpeechGeneration !== generation) return;

        this.setAssistantSpeaking(false);
        this.turnPhase.reset();
        this.emit({ type: "state_changed", state: "listening" });
        return;
      }
    }

     if (this.ttsWs) {
       await this.ttsWs.speakWhenReady(clean);
       if (this.activityEpoch !== activityEpoch || this.assistantSpeechGeneration !== generation) return;

      this.ttsWs.flush();
      await this.ttsWs.waitForFlush(8000);
    }
     if (this.player) {
       await this.player.waitUntilFinished();
       if (this.activityEpoch !== activityEpoch || this.assistantSpeechGeneration !== generation) return;
     }
     if (this.isCallActive && this.activityEpoch === activityEpoch && this.assistantSpeechGeneration === generation) {

      this.setAssistantSpeaking(false);
      this.turnPhase.reset();
      this.emit({ type: "state_changed", state: "listening" });
    }
  }

  private async syncDocketPatch(patch: Record<string, unknown>): Promise<void> {
    try {
      await fetch("/api/agent/docket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.sessionId,
          patch,
        }),
      });
    } catch (err) {
      console.warn("Failed to sync docket patch:", err);
    }
  }

  private async interpretIndigenousUtterance(transcript: string): Promise<SemanticBridgeResult | null> {
    if (this.indigenousLanguage === "bn") return null;
    try {
      const response = await fetch("/api/indigenous-language/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.sessionId,
          transcript,
          language: this.indigenousLanguage,
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { result?: SemanticBridgeResult };
        if (payload.result) return payload.result;
      }
    } catch {}
    return interpretSemanticBridge(transcript, this.indigenousLanguage);
  }

  private async handleSemanticConfirmationInput(input: string): Promise<boolean> {
    const result = this.pendingSemanticResult;
    if (!result) {
      this.intakeStep = "problem";
      this.pendingSemanticResult = null;
      this.emit({ type: "intake_step_changed", step: "problem", data: this.intakeData });
      return true;
    }
    const confirmed = /^(হ্যাঁ|হাঁ|হ্যা|জি|ঠিক|সঠিক|yes|y|1|১|বুঝেছি|ঠিক আছে)/i.test(input.trim());
    const rejected = /^(না|নাই|নেই|না না|ভুল|টাকাবাজ|না$|no|n|2|২)/i.test(input.trim());
    if (confirmed) {
      this.intakeData.problem = result.normalizedBangla;
      this.intakeData.semanticMatched = true;
      this.intakeData.semanticConfidence = result.confidence;
      this.intakeData.semanticIntent = result.legalIntent;
      this.intakeData.semanticNormalizedBangla = result.normalizedBangla;
      this.intakeData.semanticQuestion = null;
      this.pendingSemanticResult = null;
      await this.advanceFromProblemStep();
      return true;
    }
    if (rejected) {
      this.intakeData.problem = "";
      this.intakeData.semanticMatched = false;
      this.intakeData.semanticConfidence = null;
      this.intakeData.semanticIntent = null;
      this.intakeData.semanticNormalizedBangla = null;
      this.intakeData.semanticQuestion = null;
      this.intakeData.semanticMatchedTerms = [];
      this.intakeData.semanticLegalIntentBn = null;
      this.pendingSemanticResult = null;
      this.intakeStep = "problem";
      this.emit({ type: "intake_step_changed", step: "problem", data: this.intakeData });
      await this.speakAssistantPhrase("ঠিক আছে, আপনার সমস্যাটি আরেকবার সংক্ষেপে বলুন।");
      return true;
    }
    await this.speakAssistantPhrase("আপনি কি আমার বুঝানো বাংলা অর্থটি ঠিক বলেছেন? হ্যাঁ অথবা না বলুন।");
    return true;
  }

  public async startCaseIntakeChain(
    initialProblem = "",
    classification?: SeverityClassification,
  ): Promise<void> {
    this.activityEpoch += 1;
    this.clearInactivityTimer();
    this.generalQueryMode = false;
    this.inactivityPhase = "off";
    this.severityConfirmation = null;
      this.intakeStep = "problem";
      this.intakeData = {
         problem: initialProblem,
         indigenousLanguage: this.indigenousLanguage,
         semanticMatched: false,
         semanticConfidence: null,
         semanticIntent: null,
         semanticNormalizedBangla: null,
         semanticQuestion: null,
      semanticMatchedTerms: [],
      semanticLegalIntentBn: null,
         hasDisability: null,
       disabilityType: null,
       disabilityTypeCode: null,
       gender: null,

       callerName: null,
       phone: null,
       phonePrimary: null,
       phoneOperator: null,
       phoneDraft: "",
    casePinDraft: "",
    casePinAttempts: 0,
       address: null,

      severityLevel: classification?.severity ?? null,
      severityTags: classification?.matchedTags ?? [],
      severityFactors: classification?.factors ?? [],
      severityCategory: classification?.category ?? null,
      severityCaseReference: classification?.caseReference ?? null,
    };
    this.exitDtmfWait();
    this.emit({
      type: "intake_step_changed",
      step: "problem",
      data: this.intakeData,
    });

     const languagePrompt = this.indigenousLanguage === "marma"
       ? "আপনি মারমা ভাষায় সমস্যার কথা বলতে পারেন। আমি শুধু মারমা শব্দের অর্থ বাংলায় বুঝে নেব।"
       : this.indigenousLanguage === "chakma"
         ? "আপনি চাকমা ভাষায় সমস্যার কথা বলতে পারেন। আমি শুধু চাকমা শব্দের অর্থ বাংলায় বুঝে নেব।"
         : "";
     const prompt = initialProblem
       ? `আপনার সমস্যার প্রাথমিক বর্ণনা আমি নোট করেছি। ${languagePrompt} নতুন কোনো তথ্য থাকলে বলুন, অথবা বলা শেষ হলে ডায়ালপ্যাডের ১ চাপুন।`
       : `জি, আমি শুনছি। ${languagePrompt} আপনার পুরো আইনি সমস্যাটি বিস্তারিত বলুন। বলা শেষ হলে ডায়ালপ্যাডের ১ চাপুন।`;
    await this.speakAssistantPhrase(prompt, initialProblem ? "problem_start_with_note" : "problem_start");
  }

  public async advanceFromProblemStep(): Promise<void> {
    const cleanProblem = this.intakeData.problem.trim();
    if (cleanProblem.length === 0) {
      const retryPrompt = "দয়া করে আপনার সমস্যাটি মুখে বলুন, তারপর ১ চাপুন। আমি শুনছি।";
      await this.speakAssistantPhrase(retryPrompt);
      return;
    }

    this.intakeStep = "disability";
    this.emit({
      type: "intake_step_changed",
      step: "disability",
      data: this.intakeData,
    });

    void this.syncDocketPatch({
      incidentSummary: cleanProblem,
    });

    const prompt = "আপনার সমস্যাটি নথিভুক্ত করা হয়েছে। আপনার কি কোনো শারীরিক বা বিশেষ প্রতিবন্ধকতা রয়েছে? হ্যাঁ অথবা না বলুন।";
    await this.speakAssistantPhrase(prompt);
  }

  public async handleIntakeDisabilityInput(input: string): Promise<void> {
    const parsed = parseBengaliYesNo(input);
    if (parsed === null) {
      const retryPrompt = "দয়া করে হ্যাঁ অথবা না বলুন, কিংবা ডায়ালপ্যাডে ১ অথবা ২ চাপুন।";
      await this.speakAssistantPhrase(retryPrompt);
      return;
    }

    this.intakeData.hasDisability = parsed;
    this.intakeData.disabilityType = null;
    this.intakeData.disabilityTypeCode = null;
    void this.syncDocketPatch({
      hasDisability: parsed,
      disabilityType: null,
      disabilityTypeCode: null,
      eligibilityStatus: parsed ? "eligible_100_free" : "pending",
    });

    if (!parsed) {
      this.intakeStep = "gender";
      this.emit({
        type: "intake_step_changed",
        step: "gender",
        data: this.intakeData,
      });
      const prompt = "তথ্যটি সংরক্ষিত হয়েছে। আপনার লিঙ্গ কী? পুরুষ, নারী, নাকি অন্যান্য বলুন।";
      await this.speakAssistantPhrase(prompt);
      return;
    }

    this.intakeStep = "disability_type";
    this.emit({
      type: "intake_step_changed",
      step: "disability_type",
      data: this.intakeData,
    });
    await this.speakAssistantPhrase(
      "আপনার কোন ধরনের শারীরিক বা বিশেষ প্রতিবন্ধকতা আছে? উদাহরণ হিসেবে দৃষ্টি, শ্রবণ, চলাফেরা, বাক, মানসিক, বুদ্ধিমত্তা বা শেখার প্রতিবন্ধকতা বলতে পারেন।",
    );
  }

  public async handleIntakeDisabilityTypeInput(input: string): Promise<void> {
    const parsed = parseDisabilityType(input);
    if (!parsed) {
      const retryPrompt =
        "দয়া করে প্রতিবন্ধকতার ধরন বলুন, যেমন দৃষ্টি, শ্রবণ, চলাফেরা, বাক, মানসিক, বুদ্ধিমত্তা বা শেখার প্রতিবন্ধকতা।";
      await this.speakAssistantPhrase(retryPrompt);
      return;
    }

    this.intakeData.disabilityType = parsed.label;
    this.intakeData.disabilityTypeCode = parsed.code;
    this.intakeStep = "gender";
    this.emit({
      type: "intake_step_changed",
      step: "gender",
      data: this.intakeData,
    });

    void this.syncDocketPatch({
      disabilityType: parsed.label,
      disabilityTypeCode: parsed.code,
      eligibilityStatus: "eligible_100_free",
    });

    const prompt = "ধন্যবাদ। আপনার লিঙ্গ কী? পুরুষ, নারী, নাকি অন্যান্য বলুন।";
    await this.speakAssistantPhrase(prompt);
  }

  public async handleIntakeGenderInput(input: string): Promise<void> {
    const parsed = parseBengaliGender(input);
    if (parsed === null) {
      const retryPrompt = "দয়া করে আপনার লিঙ্গ পুরুষ, নারী, নাকি অন্যান্য বলুন, অথবা ১, ২ বা ৩ চাপুন।";
      await this.speakAssistantPhrase(retryPrompt);
      return;
    }

    this.intakeData.gender = parsed;
    this.intakeStep = "name";
    this.emit({
      type: "intake_step_changed",
      step: "name",
      data: this.intakeData,
    });

    void this.syncDocketPatch({
      gender: parsed,
      eligibilityStatus: parsed === "নারী" || this.intakeData.hasDisability ? "eligible_100_free" : "pending",
    });

    const prompt = "ধন্যবাদ। এবার আপনার পূর্ণ নামটি বলুন।";
    await this.speakAssistantPhrase(prompt);
  }

  public async handleIntakeNameInput(input: string): Promise<void> {
    const cleanName = cleanBengaliName(input);
    if (cleanName.length === 0) {
      const retryPrompt = "দয়া করে আপনার পূর্ণ নামটি পরিষ্কার করে বলুন।";
      await this.speakAssistantPhrase(retryPrompt);
      return;
    }

     this.intakeData.callerName = cleanName;
     this.intakeStep = "phone_primary";
     this.emit({
       type: "intake_step_changed",
       step: "phone_primary",
       data: this.intakeData,
     });

     void this.syncDocketPatch({
       callerName: cleanName,
     });

     const honorific = this.intakeData.gender === "নারী" ? "জনাবা" : "জনাব";
     const prompt = `ধন্যবাদ ${honorific} ${cleanName}। আপনি কি এই ফোন নম্বরটি আপনার প্রাথমিক নম্বর, যেখানে আমরা আপনাকে সহজেই ফোন করতে পারি? হ্যাঁ অথবা না বলুন।`;
     await this.speakAssistantPhrase(prompt, "phone_primary");
   }

   public async handleIntakePhonePrimaryInput(input: string): Promise<void> {
     const parsed = parseBengaliYesNo(input);
     if (parsed === null) {
       await this.speakAssistantPhrase("দয়া করে হ্যাঁ অথবা না বলুন, কিংবা ডায়ালপ্যাডে ১ অথবা ২ চাপুন।");
       return;
     }

     this.intakeData.phonePrimary = parsed;
     this.intakeData.phoneDraft = "";
     const callerPhone = this.callerPhone ? validateBangladeshPhone(this.callerPhone) : null;
     if (parsed && callerPhone?.valid) {
       this.intakeData.phone = callerPhone.normalized;
       this.intakeData.phoneOperator = callerPhone.operator;
       this.intakeStep = "address";
       this.emit({ type: "intake_step_changed", step: "address", data: this.intakeData });
       void this.syncDocketPatch({
         phone: this.intakeData.phone,
         phonePrimary: true,
         phoneOperator: this.intakeData.phoneOperator,
       });
       await this.speakAssistantPhrase("আপনার বর্তমান ফোন নম্বরটি যোগাযোগের জন্য সংরক্ষণ করা হয়েছে। এখন আপনার বর্তমান ঠিকানা ও জেলার নাম বলুন।");
       return;
     }

     this.intakeStep = "phone_number";
     this.emit({ type: "intake_step_changed", step: "phone_number", data: this.intakeData });
     const prompt = parsed
       ? "আপনার বর্তমান নম্বরটি আমাদের কাছে নেই। যে নম্বরে আমরা আপনাকে ফোন করতে পারি, সেটি ১১ সংখ্যায় ডায়ালপ্যাডে লিখুন।"
       : "ঠিক আছে। যে ফোন নম্বরে আমরা আপনাকে সহজে ফোন করতে পারি, সেটি ১১ সংখ্যায় ডায়ালপ্যাডে লিখুন।";
     await this.speakAssistantPhrase(prompt);
   }

   public async handleIntakePhoneNumberInput(input: string): Promise<void> {
     const digits = extractPhoneDigits(input);
     if (!digits) {
       await this.speakAssistantPhrase("ডায়ালপ্যাডে ১১ সংখ্যার ফোন নম্বরটি লিখুন। প্রতিটি সংখ্যার পর কোনো কাজ করতে হবে না।");
       return;
     }

     this.intakeData.phoneDraft = appendPhoneDigits(this.intakeData.phoneDraft, digits);
     this.emit({ type: "intake_step_changed", step: "phone_number", data: this.intakeData });
     if (this.intakeData.phoneDraft.length < 11) return;

     const validation = validateBangladeshPhone(this.intakeData.phoneDraft);
     if (!validation.valid) {
       this.intakeData.phoneDraft = "";
       this.emit({ type: "intake_step_changed", step: "phone_number", data: this.intakeData });
       await this.speakAssistantPhrase(`${validation.reasonBn} আবার ১১ সংখ্যার নম্বরটি লিখুন।`);
       return;
     }

     this.intakeData.phone = validation.normalized;
     this.intakeData.phoneOperator = validation.operator;
     this.intakeData.phoneDraft = "";
     this.intakeStep = "address";
     this.emit({ type: "intake_step_changed", step: "address", data: this.intakeData });
     void this.syncDocketPatch({
       phone: this.intakeData.phone,
       phonePrimary: this.intakeData.phonePrimary,
       phoneOperator: this.intakeData.phoneOperator,
     });
     const operatorText = this.intakeData.phoneOperator === "Robi/Airtel" ? "রবি বা এয়ারটেল" : this.intakeData.phoneOperator;
     await this.speakAssistantPhrase(`ফোন নম্বরটি বৈধ এবং অপারেটর ${operatorText}। এখন আপনার বর্তমান ঠিকানা ও জেলার নাম বলুন।`);
   }

  // ---------- Case tracking (root menu option 3) ----------

  /**
   * Enters the tracking branch. The PIN is keyed exactly like the phone
   * number, digit by digit on the keypad, so the caller already knows how to
   * do it and no new gesture has to be taught.
   */
  private async startCaseTracking(): Promise<void> {
    this.clearApplicationOffer();
    this.generalQueryMode = false;
    this.casePinDraft = "";
    this.casePinAttempts = 0;
    this.intakeStep = "case_pin";
    this.syncCasePinState();
    this.emit({ type: "intake_step_changed", step: "case_pin", data: this.intakeData });
    this.emit({ type: "state_changed", state: "dtmf_wait" });
    await this.speakAssistantPhrase(
      "কেস ট্র্যাকিংয়ের জন্য আপনার চার সংখ্যার ভয়েস লগইন পিনটি ডায়ালপ্যাডে লিখুন। প্রতিটি সংখ্যার পর কোনো কাজ করতে হবে না।",
      "option3_tracking",
    );
    this.armInactivityTimer();
  }

  /** Appends keypad digits to the PIN and looks it up once four have landed. */
  private async handleCasePinInput(input: string): Promise<void> {
    const digits = extractPhoneDigits(input);
    if (!digits) {
      await this.speakAssistantPhrase("ডায়ালপ্যাডে আপনার চার সংখ্যার পিনটি লিখুন।");
      return;
    }

    this.casePinDraft = `${this.casePinDraft}${digits}`.slice(0, 4);
    this.syncCasePinState();
    this.emit({ type: "intake_step_changed", step: "case_pin", data: this.intakeData });
    if (this.casePinDraft.length < 4) return;

    const pin = this.casePinDraft;
    this.casePinDraft = "";
    this.syncCasePinState();
    this.inactivityPhase = "off";
    this.emit({ type: "state_changed", state: "listening" });

    type CaseStatus = { found: boolean; state: string | null; docketId: string | null };
    let result: CaseStatus | null = null;
    try {
      const response = await fetch("/api/voice/case-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (response.ok) {
        result = (await response.json()) as CaseStatus;
      }
    } catch {
      result = null;
    }

    if (!result) {
      await this.speakAssistantPhrase(
        "এই মুহূর্তে পিন যাচাই করা যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন, অথবা ১৬৬৯৯ এ কল করে সাহায্য নিন।",
      );
      this.endCaseTrackingCall();
      return;
    }

    if (result.found && result.state) {
      this.intakeStep = "case_result";
      this.emit({ type: "intake_step_changed", step: "case_result", data: this.intakeData });
      const docket = result.docketId ? `আপনার ডকেট নম্বর ${result.docketId}। ` : "";
      if (result.state === "filed") {
        await this.speakAssistantPhrase(
          `${docket}আপনার মামলাটি সফলভাবে নথিভুক্ত হয়েছে এবং প্যানেল আইনজীবীর কাছে পাঠানো হয়েছে। বিস্তারিত জানতে ডিএলএও অফিসে যোগাযোগ করুন অথবা পোর্টালে ডকেট নম্বর দিয়ে ট্র্যাক করুন।`,
        );
      } else {
        await this.speakAssistantPhrase(
          `${docket}আপনার আবেদনটি সফলভাবে গ্রহণ করা হয়েছে এবং এখনো প্রক্রিয়াধীন আছে। জেলা আইনগত সহায়তা অফিসে যাচাইয়ের পর পরবর্তী ধাপ জানানো হবে।`,
        );
      }
      this.armInactivityTimer();
      return;
    }

    // Wrong PIN. Three failures and the call is closed, so the keypad cannot be
    // used to guess PINs one at a time.
    this.casePinAttempts += 1;
    this.syncCasePinState();
    this.emit({ type: "intake_step_changed", step: "case_pin", data: this.intakeData });
    if (this.casePinAttempts >= 3) {
      await this.speakAssistantPhrase(
        "তিনবার ভুল পিন দেওয়া হয়েছে। নিরাপত্তার জন্য কলটি এখানেই শেষ করা হচ্ছে। সঠিক পিন সম্পর্কে জানতে ভয়েস ইনটেকের সময় যে বার্তা পেয়েছিলেন তা দেখুন, অথবা ১৬৬৯৯ এ কল করুন।",
        "case_pin_locked",
      );
      this.endCaseTrackingCall();
      return;
    }

    const left = 3 - this.casePinAttempts;
    await this.speakAssistantPhrase(
      `পিনটি সঠিক হয়নি। আর ${left} বার সুযোগ আছে। আবার চার সংখ্যার পিনটি ডায়ালপ্যাডে লিখুন।`,
    );
    this.armInactivityTimer();
  }

  /**
   * Leaves the tracking branch and hands the caller back to the root menu, so
   * they can pick another option rather than being dropped into intake.
   */
  private async handleCaseResultInput(input: string): Promise<void> {
    const clean = input.trim();
    this.emit({ type: "transcript", role: "user", text: clean });
    this.intakeStep = "idle";
    this.casePinDraft = "";
    this.emit({ type: "intake_step_changed", step: "idle", data: this.intakeData });
    this.inactivityPhase = "off";
    await this.speakAssistantPhrase(
      "আরও কোনো তথ্যের প্রয়োজন হলে বলুন। সাধারণ তথ্যের জন্য ১, নতুন সমস্যা বা অভিযোগের জন্য ২, আর কেস ট্র্যাকিংয়ের জন্য ৩ চাপতে পারেন।",
    );
    this.armInactivityTimer();
  }

  /** Closes the call after a tracking attempt is finished or abandoned. */
  private endCaseTrackingCall(): void {
    this.casePinDraft = "";
    this.casePinAttempts = 0;
    this.syncCasePinState();
    this.intakeStep = "idle";
    this.inactivityPhase = "off";
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    this.emit({ type: "intake_step_changed", step: "idle", data: this.intakeData });
    setTimeout(() => {
      this.stop();
    }, 400);
  }

   public async handleIntakeAddressInput(input: string): Promise<void> {

    const cleanAddress = input.trim();
    if (cleanAddress.length === 0) {
      const retryPrompt = "দয়া করে আপনার বর্তমান ঠিকানা ও জেলার নাম বলুন।";
      await this.speakAssistantPhrase(retryPrompt);
      return;
    }

    this.intakeData.address = cleanAddress;
    this.intakeStep = "complete";
    this.emit({
      type: "intake_step_changed",
      step: "complete",
      data: this.intakeData,
    });

    await this.finalizeCaseIntake();
  }

  private async speakIntakeCompletion(text: string): Promise<void> {
    await this.speakAssistantPhrase(text, "intake_complete");
  }

  private async createCitizenSession(
    docketId: string,
    district: string,
    category: string,
    pin?: string,
  ): Promise<{ user: SessionUser; applicationId: string; applicationTime: string | null }> {
    const response = await fetch("/api/roles/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voiceSessionId: this.sessionId,
        docketId,
        displayName: this.intakeData.callerName || "নাগরিক",
        phone: this.intakeData.phone,
        problem: this.intakeData.problem,
        hasDisability: this.intakeData.hasDisability,
        disabilityType: this.intakeData.disabilityType,
        disabilityTypeCode: this.intakeData.disabilityTypeCode,
        pin,
        gender: this.intakeData.gender,
        address: this.intakeData.address,
        indigenousLanguage: this.intakeData.indigenousLanguage,
        semanticMatched: this.intakeData.semanticMatched,
        semanticConfidence: this.intakeData.semanticConfidence,
        semanticIntent: this.intakeData.semanticIntent,
        semanticNormalizedBangla: this.intakeData.semanticNormalizedBangla,
        semanticMatchedTerms: this.intakeData.semanticMatchedTerms,
        legalIntentBn: this.intakeData.semanticLegalIntentBn,
         originalTranscript: this.intakeData.semanticNormalizedBangla || this.intakeData.problem,
         intakeSummary: this.intakeData.semanticNormalizedBangla || this.intakeData.problem,
         urgency: this.intakeData.severityLevel === "emergency" ? "emergency_danger" : this.intakeData.severityLevel === "high" ? "urgent" : "normal",
         priority: this.intakeData.severityLevel === "emergency" ? "urgent" : this.intakeData.severityLevel === "high" ? "high" : "normal",
         severityLevel: this.intakeData.severityLevel,
         severityCategory: this.intakeData.severityCategory,
         severityFactors: this.intakeData.severityFactors,
         district,
        category,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      user?: SessionUser;
      applicationId?: string;
      applicationTime?: string | null;
      error?: string;
    } | null;
    if (!response.ok || !payload?.user || !payload.applicationId) {
      throw new Error(payload?.error || "Citizen session could not be created");
    }
    return {
      user: payload.user,
      applicationId: payload.applicationId,
      applicationTime: payload.applicationTime || null,
    };
  }

  private async finalizeCaseIntake(): Promise<void> {
     if (this.caseIntakeFinalized) return;
     this.caseIntakeFinalized = true;
     const docketId = "DLAS-2025-" + Math.floor(1000 + Math.random() * 9000);
     this.recordingDocketId = docketId;
     const district = extractDistrict(this.intakeData.address || "") || "ঢাকা";

     const category = inferLegalCategory(this.intakeData.problem || "");
     const isBlind =
       this.intakeData.hasDisability === true &&
       (this.intakeData.disabilityTypeCode === "visual" || this.intakeData.severityTags.includes("PWD_Visual"));
     const voicePin = generateVoicePin();

      await this.syncDocketPatch({

        callerName: this.intakeData.callerName,
        phone: this.intakeData.phone,
        phonePrimary: this.intakeData.phonePrimary,
        phoneOperator: this.intakeData.phoneOperator,
        incidentSummary: this.intakeData.problem,

        gender: this.intakeData.gender,
        hasDisability: this.intakeData.hasDisability,
        disabilityType: this.intakeData.disabilityType,
        disabilityTypeCode: this.intakeData.disabilityTypeCode,
        district,

       thana: this.intakeData.address,
       category,
        eligibilityStatus: "eligible_100_free",
        severityLevel: this.intakeData.severityLevel,
        severityTags: this.intakeData.severityTags,
        severityFactors: this.intakeData.severityFactors,
        severityCategory: this.intakeData.severityCategory,
        severityCaseReference: this.intakeData.severityCaseReference,
        docketId,
        urgency:
          this.intakeData.severityLevel === "emergency"
            ? "emergency_danger"
            : this.intakeData.severityLevel === "high" || this.intakeData.severityLevel === "priority"
              ? "urgent"
              : "normal",
        assignedOffice: `জেলা লিগ্যাল এইড অফিস, ${district}`,

     });

     let citizenUser: SessionUser;
     let applicationId: string;
     let applicationTime: string | null;
     try {
       const application = await this.createCitizenSession(docketId, district, category, voicePin);
       citizenUser = application.user;
       applicationId = application.applicationId;
       applicationTime = application.applicationTime;
     } catch {
       try {
         const retry = await this.createCitizenSession(docketId, district, category, voicePin);
         citizenUser = retry.user;
         applicationId = retry.applicationId;
         applicationTime = retry.applicationTime;
       } catch (retryError) {
         this.emit({
           type: "error",
           message: `আবেদনটি সংরক্ষণ করা যায়নি: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
         });
         this.intakeStep = "idle";
         this.emit({ type: "intake_step_changed", step: "idle", data: this.intakeData });
         await this.speakAssistantPhrase(
           "দুঃখিত, আপনার আবেদনটি এই মুহূর্তে সংরক্ষণ করা যায়নি। দয়া করে কিছুক্ষণ পরে আবার ১৬৬৯৯ নম্বরে কল করুন। আপনার সমস্যার কোনো ক্ষতি হয়নি।",
         );
         return;
       }
     }

     // Everyone gets the written copy, including blind and visually impaired
     // citizens, for whom it is the only written record of the PIN. Sending it
     // after the blind branch below left their inbox showing a PIN belonging to
     // an earlier registration, which read as the PIN having changed.
     if (this.intakeData.phone && voicePin) {
       saveSimulatedSms(
         this.intakeData.phone,
         `${this.intakeData.callerName || "নাগরিক"}, আপনার ১৬৬৯৯ ভয়েস লগইন পিন: ${voicePin}। ডকেট নম্বর ${docketId}। এই পিনটি ৩০ দিনের জন্য ব্যবহার করতে পারবেন।`,
       );
     }

     if (isBlind && voicePin) {
      this.completedBlindUser = citizenUser;
      this.completedBlindDocketId = docketId;
      this.blindVoicePin = voicePin;
      this.blindAccessState = "pin_ready";
      this.intakeStep = "complete";
      await this.speakAssistantPhrase(
        `আপনার আইনি অভিযোগ ও তথ্যবলী সফলভাবে নথিভুক্ত হয়েছে। আপনার ডকেট নম্বর ${docketId}। আপনার ভয়েস লগইন পিন হলো ${voicePin}। আমি আবার বলছি: ${voicePin}। পরবর্তী কলে ১ চেপে লগইন বলুন এবং এই পিন দিয়ে কেসের তথ্য ও আপডেট শুনুন। আবার শুনতে চাইলে স্টার বা অ্যাস্টেরিস্ক চিহ্ন চাপুন, আর কল শেষ করতে হ্যাশ চিহ্ন চাপুন।`,
      );
      return;
    }


     const closingPrompt =
       "আপনার আইনি অভিযোগ ও তথ্যবলী সফলভাবে নথিভুক্ত করা হয়েছে। আপনার ডকেট নম্বরটি কথোপকথনের রেকর্ডে সংরক্ষিত আছে। আপনার যোগাযোগের ফোন নম্বরে ৪ সংখ্যার ভয়েস লগইন পিন পাঠানো হয়েছে। এই পিন দিয়ে ভবিষ্যতে লগইন করে কেসের তথ্য ও আপডেট দেখতে পারবেন। জাতীয় আইনগত সহায়তা প্রদান সংস্থা থেকে আমাদের প্যানেল আইনজীবী যোগাযোগ করবেন। আপনাকে ধন্যবাদ।";
      await this.speakAssistantPhrase(closingPrompt, "sms_pin_sent");
      await this.speakIntakeCompletion(closingPrompt);

     this.intakeStep = "idle";
     this.emit({
       type: "intake_step_changed",
       step: "idle",
       data: this.intakeData,
     });
     this.emit({ type: "intake_complete", docketId, applicationId, applicationTime, user: citizenUser });
   }


  private async handleIntakeVoiceInput(clean: string): Promise<void> {
    if (!clean) return;

    if (this.intakeStep === "language") {
      this.emit({ type: "transcript", role: "user", text: clean });
      await this.speakAssistantPhrase(LANGUAGE_SELECTION_RETRY_PROMPT);
      return;
    }

    if (this.intakeStep === "application_confirm") {
      await this.handleApplicationOfferInput(clean);
      return;
    }

    if (this.intakeStep === "problem") {
      if (clean.includes("বলা শেষ") || clean.includes("কথা শেষ") || clean.includes("সমাপ্ত")) {
        const cleaned = clean.replace(/বলা শেষ|কথা শেষ|সমাপ্ত/g, "").trim();
        if (cleaned) {
          this.intakeData.problem = (this.intakeData.problem + " " + cleaned).trim();
        }
        await this.advanceFromProblemStep();
      } else {
        this.intakeData.problem = (this.intakeData.problem + " " + clean).trim();
        this.emit({ type: "transcript", role: "user", text: clean });
        this.emit({ type: "intake_step_changed", step: "problem", data: this.intakeData });
        void this.syncDocketPatch({ incidentSummary: this.intakeData.problem });
      }
      return;
    }

     if (this.intakeStep === "disability") {
       this.emit({ type: "transcript", role: "user", text: clean });
       await this.handleIntakeDisabilityInput(clean);
       return;
     }

     if (this.intakeStep === "disability_type") {
       this.emit({ type: "transcript", role: "user", text: clean });
       await this.handleIntakeDisabilityTypeInput(clean);
       return;
     }

     if (this.intakeStep === "gender") {

      this.emit({ type: "transcript", role: "user", text: clean });
      await this.handleIntakeGenderInput(clean);
      return;
    }

     if (this.intakeStep === "name") {
       this.emit({ type: "transcript", role: "user", text: clean });
       await this.handleIntakeNameInput(clean);
       return;
     }

     if (this.intakeStep === "phone_primary") {
       this.emit({ type: "transcript", role: "user", text: clean });
       await this.handleIntakePhonePrimaryInput(clean);
       return;
     }

     if (this.intakeStep === "phone_number") {
       this.emit({ type: "transcript", role: "user", text: clean });
       await this.handleIntakePhoneNumberInput(clean);
       return;
     }

     if (this.intakeStep === "address") {

      this.emit({ type: "transcript", role: "user", text: clean });
      await this.handleIntakeAddressInput(clean);
      return;
    }
  }

  public sendUserMessage(text: string): Promise<void> {
    const queued = this.userMessageQueue.then(() => this.sendUserMessageInternal(text));
    this.userMessageQueue = queued.catch(() => {});
    return queued;
  }

  private async sendUserMessageInternal(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !this.isCallActive) return;
    this.activityEpoch += 1;
    const activityEpoch = this.activityEpoch;
     this.interruptAssistant();
     this.exitDtmfWait();

     if (this.languageSelectionPending && (await this.handleLanguageSelectionInput(trimmed))) return;

     if (this.blindAccessState === "pin_ready") {
      if (await this.handleBlindPinInput(trimmed)) return;
    }
     if (this.isCallCutIntent(trimmed)) {
       await this.cutCall("caller");
       return;
     }
     if (this.generalQueryMode && this.inactivityPhase === "hangup_warn") {
       if (await this.handleInactivityWarningInput(trimmed)) return;
       this.inactivityPhase = "off";
     }
     if (this.severityConfirmation && (await this.handleApplicationOfferInput(trimmed))) return;
     if (this.generalQueryMode && (await this.handleVoiceInput(trimmed))) return;
     if (await this.handleSeverityInput(trimmed)) return;


     // 1. If currently in Intake Chain:
     if (this.intakeStep !== "idle" && this.intakeStep !== "complete") {
      // Case tracking: PIN digits and the post-result turn are handled before
      // anything else so a keyed digit can never be read as problem text.
      if (this.intakeStep === "case_pin") {
        this.emit({ type: "transcript", role: "user", text: trimmed });
        await this.handleCasePinInput(trimmed);
        return;
      }

      if (this.intakeStep === "case_result") {
        await this.handleCaseResultInput(trimmed);
        return;
      }

      if (this.intakeStep === "semantic_confirmation") {
        this.emit({ type: "transcript", role: "user", text: trimmed });
        await this.handleSemanticConfirmationInput(trimmed);
        return;
      }

      if (this.intakeStep === "language") {
        this.emit({ type: "transcript", role: "user", text: trimmed });
        await this.speakAssistantPhrase(LANGUAGE_SELECTION_RETRY_PROMPT);
        return;
      }

      if (this.intakeStep === "problem") {
        if (
          trimmed === "১ (সাধারণ তথ্য ও নিয়মাবলী)" ||
          trimmed === "1" ||
          trimmed === "১" ||
          trimmed.includes("বলা শেষ") ||
          trimmed.includes("কথা শেষ")
        ) {
          await this.advanceFromProblemStep();
          return;
        } else {
          this.intakeData.problem = (this.intakeData.problem + " " + trimmed).trim();
          this.emit({ type: "transcript", role: "user", text: trimmed });
          this.emit({ type: "intake_step_changed", step: "problem", data: this.intakeData });
          void this.syncDocketPatch({ incidentSummary: this.intakeData.problem });
          return;
        }
      }

       if (this.intakeStep === "disability") {
         const val =
           trimmed.includes("1") || trimmed.includes("১")
             ? "1"
             : trimmed.includes("2") || trimmed.includes("২")
               ? "2"
               : trimmed;
         this.emit({ type: "transcript", role: "user", text: trimmed });
         await this.handleIntakeDisabilityInput(val);
         return;
       }

       if (this.intakeStep === "disability_type") {
         this.emit({ type: "transcript", role: "user", text: trimmed });
         await this.handleIntakeDisabilityTypeInput(trimmed);
         return;
       }

       if (this.intakeStep === "gender") {

        const val =
          trimmed.includes("1") || trimmed.includes("১")
            ? "1"
            : trimmed.includes("2") || trimmed.includes("২")
              ? "2"
              : trimmed.includes("3") || trimmed.includes("৩")
                ? "3"
                : trimmed;
        this.emit({ type: "transcript", role: "user", text: trimmed });
        await this.handleIntakeGenderInput(val);
        return;
      }

      if (this.intakeStep === "name") {
        this.emit({ type: "transcript", role: "user", text: trimmed });
        await this.handleIntakeNameInput(trimmed);
        return;
      }

       if (this.intakeStep === "phone_primary") {
         const val =
           trimmed.includes("1") || trimmed.includes("১")
             ? "1"
             : trimmed.includes("2") || trimmed.includes("২")
               ? "2"
               : trimmed;
         this.emit({ type: "transcript", role: "user", text: trimmed });
         await this.handleIntakePhonePrimaryInput(val);
         return;
       }

       if (this.intakeStep === "phone_number") {
         this.emit({ type: "transcript", role: "user", text: trimmed });
         await this.handleIntakePhoneNumberInput(trimmed);
         return;
       }

       if (this.intakeStep === "address") {
         this.emit({ type: "transcript", role: "user", text: trimmed });
         await this.handleIntakeAddressInput(trimmed);
         return;
       }

    }

    // 2. Case tracking via Keypad 3 / Option 3
    if (
      trimmed === "৩ (কেস ট্র্যাকিং)" ||
      trimmed === "3" ||
      trimmed === "৩" ||
      trimmed.includes("ট্র্যাকিং") ||
      trimmed.includes("কেস ট্র্যাক")
    ) {
      await this.startCaseTracking();
      return;
    }

    // 3. Starting Case Intake Chain via Keypad 2 / Option 2
    if (
      trimmed === "২ (সমস্যা বা নতুন অভিযোগ)" ||
      trimmed === "2" ||
      trimmed === "২" ||
      trimmed.includes("অভিযোগ") ||
      trimmed.includes("সমস্যা জানাতে চাই")
    ) {
      await this.startCaseIntakeChain();
      return;
    }

    this.emit({ type: "transcript", role: "user", text: trimmed });
    this.conversationHistory.push({ role: "user", content: trimmed });
    this.setAssistantSpeaking(true);
    this.emit({ type: "state_changed", state: "speaking" });

    // The on-screen keypad sends the BARE digit for this step
    // (DTMF_BY_STEP.idle = { "1": "১", ... }), so matching only the long label
    // meant pressing 1 fell through to the LLM with "১" as the query. Options 2
    // and 3 already accept the bare digit; this now matches them.
    if (trimmed === "১ (সাধারণ তথ্য ও নিয়মাবলী)" || trimmed === "1" || trimmed === "১") {
      const opt1Text = "জি, সাধারণ তথ্যের জন্য আপনার প্রশ্নটি বলুন, আমি শুনছি।";
      await this.speakAssistantPhrase(opt1Text, "option1");
      if (this.isCallActive && this.activityEpoch === activityEpoch) {
        this.generalQueryMode = true;
        this.inactivityPhase = "off";
        this.armInactivityTimer();
      }
      return;
    }

    const llmUrl = (this.lastConfig?.llmProxyUrl || "/api/llm").replace(/\/+$/, "");
    const llmModel = this.lastConfig?.llmModel || "openai/gpt-oss-120b";
    try {
      await this.generateAndSpeakResponse(llmUrl, llmModel, 0, performance.now());
      this.armOfferFromAssistantTurn(trimmed);
    } finally {
      if (this.isCallActive && this.activityEpoch === activityEpoch) {
        this.activeAbortCtrl = null;
        this.setAssistantSpeaking(false);
        this.turnPhase.reset();
        this.emit({ type: "state_changed", state: "listening" });
        // Re-arm inactivity timer after each general query response
        if (this.generalQueryMode) {
          this.inactivityPhase = "off";
          this.armInactivityTimer();
        }
      }
    }
  }

  /**
   * Records the general inquiry so far as an advice record.
   *
   * Debounced, because it fires on every answered turn and each write is a network round
   * trip; a three-question call should not make three concurrent POSTs for the same row.
   * `final` skips the debounce so a hangup is written immediately rather than being lost
   * to a pending timer.
   *
   * Fire-and-forget on purpose. A failed record must never interrupt a live call -- the
   * citizen on the line matters more than the log -- so this swallows its own errors.
   */
  private persistAdviceRecord(final: boolean): void {
    if (this.advicePersistTimer) {
      clearTimeout(this.advicePersistTimer);
      this.advicePersistTimer = null;
    }
    const write = async () => {
      this.advicePersistTimer = null;
      try {
        const startedAt = this.callStartedAtMs || Date.now();
        // The browser softphone has no real caller number, so one is simulated and
        // *labelled* simulated. Recording it without the flag would let a made-up number
        // be read back to a citizen as their own.
        const phone = this.callerPhone;
        await fetch("/api/portal/advice", {
          method: "POST",
          headers: { "content-type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            voiceSessionId: this.sessionId,
            callerPhone: phone ?? this.simulatedCallerNumber(),
            phoneIsSimulated: !phone,
            language: this.indigenousLanguage || "bn",
            startedAt: new Date(startedAt).toISOString(),
            endedAt: new Date().toISOString(),
            durationSeconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
            transcript: this.conversationHistory,
            advice: this.lastAdviceText || null,
            topics: null,
            category: this.adviceEscalated ? "severity" : "general",
            escalated: this.adviceEscalated,
          }),
        });
      } catch {
        // Swallowed on purpose. See above: never break a live call over a log write.
      }
    };
    if (final) void write();
    else this.advicePersistTimer = setTimeout(() => void write(), 1200);
  }

  /**
   * A synthetic caller number for the browser softphone.
   *
   * The 0177 prefix is used rather than a real subscriber range so a simulated number can
   * never be mistaken for -- or dialled as -- an actual 16699 caller, and the record's
   * `phone_is_simulated` flag says so independently.
   */
  private simulatedCallerNumber(): string {
    const seed = Math.abs(
      [...this.sessionId].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 7),
    );
    const tail = String(seed % 100000000).padStart(8, "0");
    return `0177${tail}`;
  }

  public stop(): void {
    this.persistAdviceRecord(true);
    this.stopRecording();
    this.activityEpoch += 1;
     this.isCallActive = false;
     this.waitingForDtmf = false;
     this.languageSelectionPending = false;
     this.intakeStep = "idle";
    this.casePinDraft = "";
    this.casePinAttempts = 0;
    this.intakeData = {
       problem: "",
       hasDisability: null,
       disabilityType: null,
       disabilityTypeCode: null,
       gender: null,

       callerName: null,
       phone: null,
       phonePrimary: null,
       phoneOperator: null,
       phoneDraft: "",
    casePinDraft: "",
    casePinAttempts: 0,
       address: null,

      severityLevel: null,
      severityTags: [],
      severityFactors: [],
      severityCategory: null,
       severityCaseReference: null,
       indigenousLanguage: this.indigenousLanguage,
       semanticMatched: false,
       semanticConfidence: null,
       semanticIntent: null,
       semanticNormalizedBangla: null,
       semanticQuestion: null,
      semanticMatchedTerms: [],
      semanticLegalIntentBn: null,
     };
    if (this.sttKeepAliveTimer) {
      clearInterval(this.sttKeepAliveTimer);
      this.sttKeepAliveTimer = null;
    }
    if (this.ttsKeepAliveTimer) {
      clearInterval(this.ttsKeepAliveTimer);
      this.ttsKeepAliveTimer = null;
    }
    if (this.speechFinalDebounceTimer) {
      clearTimeout(this.speechFinalDebounceTimer);
      this.speechFinalDebounceTimer = null;
    }
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    // Clear inactivity timer
    this.clearInactivityTimer();
    this.generalQueryMode = false;
    this.inactivityPhase = "off";
    this.blindAccessState = "off";
    this.blindVoicePin = null;
    this.caseIntakeFinalized = false;
    this.voiceLoginMode = "off";
    this.voiceLoginPin = null;
    this.voiceLoginAttempts = 0;
    this.authenticatedUser = null;
    this.completedBlindUser = null;
    this.completedBlindDocketId = null;
    this.greetingActive = false;
    this.setAssistantSpeaking(false);
    this.interruptAssistant();

    if (this.micWorkletNode) {
      try {
        this.micWorkletNode.port.onmessage = null;
        this.micWorkletNode.disconnect();
      } catch {}
      this.micWorkletNode = null;
    }
    if (this.micScriptNode) {
      try {
        this.micScriptNode.onaudioprocess = null;
        this.micScriptNode.disconnect();
      } catch {}
      this.micScriptNode = null;
    }
    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch {}
      this.micSourceNode = null;
    }

    if (this.soniox) {
      this.soniox.close();
      this.soniox = null;
    }

    if (this.ttsWs) {
      try {
        this.ttsWs.close();
      } catch {}
      this.ttsWs = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      this.stream = null;
    }

    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    this.player = null;
    this.recordingDestination = null;
    this.currentTranscript = "";
    this.t_engine_end = 0;
    this.accumulatedSegments = [];
    this.conversationHistory = [];

    this.turnPhase.reset();
    this.vad.reset();
    this.emit({ type: "state_changed", state: "idle" });
  }
}