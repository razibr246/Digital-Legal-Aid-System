"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceAgent } from "@/lib/voice-sdk/client";
import type { SessionUser } from "@/lib/auth/roles";
import type { SdkConfig, SdkEvent } from "@/lib/voice-sdk/types";
import type { SeverityLevel } from "@/lib/agent/knowledge/severity-classification";
import type { IndigenousLanguage } from "@/lib/agent/knowledge/indigenous-language-lexicon";
import { generateRandomBangladeshPhone } from "@/lib/phone/bangladesh-phone";

export type SessionPhase =
  | "idle"
  | "starting"
  | "listening"
  | "speaking"
  | "dtmf_wait"
  | "error";

export interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  ts: number;
}

export interface LatencyMetrics {
  stt_ms: number;
  llm_ttft_ms: number;
  sentence1_gen_ms: number;
  tts_synthesis_ms: number;
  tts_first_audio_ms: number;
  total_voice_latency_ms: number;
}

export interface LogEntry {
  kind: "system" | "error" | "transcript";
  text: string;
  ts: number;
}

export type IntakeStep =
  | "idle"
   | "problem"
   | "language"
   | "application_confirm"
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

export interface IntakeData {
   problem?: string;
  /** Case tracking: PIN keyed so far and how many guesses have failed. */
  casePinDraft?: string;
  casePinAttempts?: number;
   hasDisability?: boolean | null;
   disabilityType?: string | null;
   disabilityTypeCode?: string | null;
   gender?: string | null;

    callerName?: string | null;
    phone?: string | null;
    phonePrimary?: boolean | null;
    phoneOperator?: string | null;
    phoneDraft?: string;
     address?: string | null;

     indigenousLanguage?: IndigenousLanguage;
     semanticMatched?: boolean;
     semanticConfidence?: number | null;
     semanticIntent?: string | null;
     semanticNormalizedBangla?: string | null;
     semanticQuestion?: string | null;
     semanticMatchedTerms?: string[];
     semanticLegalIntentBn?: string | null;

   severityLevel?: SeverityLevel | null;
   severityTags?: string[];
   severityFactors?: string[];
   severityCategory?: string | null;
   severityCaseReference?: string | null;

}

interface UseVoiceSessionResult {
  phase: SessionPhase;
  sessionId: string | null;
  currentUser: SessionUser | null;
  activeTool: string | null;
  isMicMuted: boolean;
  intakeStep: IntakeStep;
  intakeData: IntakeData;
  transcript: TranscriptEntry[];
  /** Live partial recognition, cleared when the turn commits. */
  interimText: string;
  logs: LogEntry[];
  metrics: LatencyMetrics | null;
  metricHistory: LatencyMetrics[];
  start(config?: Partial<SdkConfig>): Promise<void>;
  sendMessage(text: string): Promise<void>;
  stop(): void;
}

const MAX_LOGS = 200;

export function useVoiceSession(onSdkEvent?: (evt: SdkEvent) => void): UseVoiceSessionResult {
  const agentRef = useRef<VoiceAgent | null>(null);
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [intakeStep, setIntakeStep] = useState<IntakeStep>("idle");
  const [intakeData, setIntakeData] = useState<IntakeData>({});
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  /** Live partial recognition of the utterance in progress. */
  const [interimText, setInterimText] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [metrics, setMetrics] = useState<LatencyMetrics | null>(null);
  const [metricHistory, setMetricHistory] = useState<LatencyMetrics[]>([]);

  const pushLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [...prev.slice(-(MAX_LOGS - 1)), entry]);
  }, []);

  useEffect(() => {
    let mounted = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { user?: SessionUser | null }) => {
        if (mounted && payload.user) setCurrentUser(payload.user);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const handleEvent = useCallback(
    (evt: SdkEvent) => {
      onSdkEvent?.(evt);

      switch (evt.type) {
        case "state_changed": {
          if (
            evt.state === "listening" ||
            evt.state === "speaking" ||
            evt.state === "dtmf_wait" ||
            evt.state === "error"
          ) {
            setPhase(evt.state);
            setIsMicMuted(evt.state === "speaking" || evt.state === "dtmf_wait");
            if (evt.state === "listening") {
              setActiveTool(null);
            }
          } else if (evt.state === "idle") {
            setPhase("idle");
            setIsMicMuted(false);
            setActiveTool(null);
          }
          break;
        }
        case "tool_activity": {
          setActiveTool(evt.tool_name || null);
          pushLog({ kind: "system", text: `[Tool] ${evt.message || evt.tool_name}`, ts: Date.now() });
          break;
        }
        case "mic_mute_changed": {
          setIsMicMuted(evt.muted);
          break;
        }
        case "system": {
          pushLog({ kind: "system", text: evt.text, ts: Date.now() });
          if (evt.text === "INACTIVITY_HANGUP") {
            // Agent is hanging up due to inactivity — auto-stop the session
            agentRef.current?.stop();
            agentRef.current = null;
            setPhase("idle");
            setIntakeStep("idle");
            setIntakeData({});
            setIsMicMuted(false);
            setActiveTool(null);
            setSessionId(null);
          }
          break;
        }
         case "intake_complete": {
           setCurrentUser(evt.user);
           agentRef.current?.stop();

          agentRef.current = null;
          setPhase("idle");
          setIntakeStep("idle");
          setIntakeData({});
          setIsMicMuted(false);
          setActiveTool(null);
          setSessionId(null);
          break;
        }
         case "voice_authenticated": {
           setCurrentUser(evt.user);
           pushLog({ kind: "system", text: `Voice login successful: ${evt.user.displayName}`, ts: Date.now() });
           break;
         }
         case "error": {

          pushLog({ kind: "error", text: evt.message, ts: Date.now() });
          setPhase("error");
          break;
        }
        case "interim_transcript": {
          // Throttled upstream; a replacement, not an append. An empty string
          // is the turn committing, which clears the live line.
          setInterimText(evt.text);
          break;
        }
        case "transcript": {
          setInterimText("");
          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && evt.role === "assistant") {
              return [...prev.slice(0, -1), { role: "assistant", text: evt.text, ts: Date.now() }];
            }
            return [...prev, { role: evt.role as "user" | "assistant", text: evt.text, ts: Date.now() }];
          });
          pushLog({ kind: "transcript", text: `${evt.role}: ${evt.text}`, ts: Date.now() });
          break;
        }
        case "transcript_chunk": {
          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant") {
              const updated = [...prev.slice(0, -1), { ...last, text: last.text + evt.text }];
              return updated;
            }
            return [...prev, { role: "assistant", text: evt.text, ts: Date.now() }];
          });
          break;
        }
        case "intake_step_changed": {
          setIntakeStep(evt.step);
          setIntakeData(evt.data);
          break;
        }
        case "latency_metrics": {
          const m: LatencyMetrics = {
            stt_ms: evt.stt_ms,
            llm_ttft_ms: evt.llm_ttft_ms,
            sentence1_gen_ms: evt.sentence1_gen_ms,
            tts_synthesis_ms: evt.tts_synthesis_ms,
            tts_first_audio_ms: evt.tts_first_audio_ms,
            total_voice_latency_ms: evt.total_voice_latency_ms,
          };
          setMetrics(m);
          setMetricHistory((prev) => [...prev.slice(-9), m]);
          break;
        }
      }
    },
    [onSdkEvent, pushLog],
  );

  const start = useCallback(
    async (config?: Partial<SdkConfig>) => {
      agentRef.current?.stop();
      agentRef.current = null;
      setPhase("starting");
      setIntakeStep("idle");
      setIntakeData({});
      setTranscript([]);
      setInterimText("");
      setMetricHistory([]);
      setMetrics(null);
      setActiveTool(null);

      const agent = new VoiceAgent(handleEvent);
      agentRef.current = agent;
      if (typeof window !== "undefined") {
         (window as Window & { __voiceAgent?: VoiceAgent }).__voiceAgent = agent;
      }
      try {
        const callerPhone = config?.callerPhone ?? generateRandomBangladeshPhone();
        await agent.start({ ...(config ?? {}), callerPhone });
        if (agentRef.current !== agent) {
          agent.stop();
          return;
        }
        setSessionId(agent.sessionId);
      } catch (error) {
         if (agentRef.current === agent) {
           agent.stop();
           agentRef.current = null;
           setPhase("error");
           setSessionId(null);
         }

        throw error;
      }
    },
    [handleEvent],
  );

  const sendMessage = useCallback(async (text: string) => {
    if (agentRef.current) {
      await agentRef.current.sendUserMessage(text);
    }
  }, []);

  const stop = useCallback(() => {
    agentRef.current?.stop();
    agentRef.current = null;
    setPhase("idle");
    setIntakeStep("idle");
    setIntakeData({});
    setIsMicMuted(false);
    setActiveTool(null);
    setSessionId(null);
  }, []);

  return { phase, sessionId, currentUser, activeTool, isMicMuted, intakeStep, intakeData, transcript, interimText, logs, metrics, metricHistory, start, sendMessage, stop };
}