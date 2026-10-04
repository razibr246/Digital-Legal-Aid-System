"use client";

import { useState } from "react";
import Link from "next/link";
import { useAgentSettings } from "@/hooks/use-agent-settings";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { MODELS, VOICES } from "@/lib/settings/agent-settings";

const PHASE_STYLES: Record<string, string> = {
  idle: "bg-slate-100 text-slate-700 border-slate-300",
  starting: "bg-amber-100 text-amber-800 border-amber-300",
  listening: "bg-emerald-100 text-emerald-800 border-emerald-300",
  speaking: "bg-blue-100 text-blue-800 border-blue-300",
  error: "bg-rose-100 text-rose-800 border-rose-300",
};

export default function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useAgentSettings();
  const { phase, transcript, start, stop } = useVoiceSession();
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form local state synced with settings
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt);
  const [greeting, setGreeting] = useState(settings.greeting);
  const [secondaryPrompt, setSecondaryPrompt] = useState(settings.secondaryPrompt);
  const [model, setModel] = useState(settings.llmModel);
  const [voiceId, setVoiceId] = useState(settings.voiceId);
  const [halfDuplex, setHalfDuplex] = useState(settings.halfDuplex);

  const handleSave = () => {
    updateSettings({
      systemPrompt,
      greeting,
      secondaryPrompt,
      llmModel: model,
      voiceId,
      halfDuplex,
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleReset = () => {
    resetSettings();
    setSystemPrompt(settings.systemPrompt);
    setGreeting(settings.greeting);
    setSecondaryPrompt(settings.secondaryPrompt);
    setModel(settings.llmModel);
    setVoiceId(settings.voiceId);
    setHalfDuplex(settings.halfDuplex);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleStartVoiceSession = async () => {
    handleSave();
    await start({
      systemPrompt,
      greeting,
      secondaryPrompt,
      llmModel: model,
      voiceId,
      language: "bn",
      halfDuplex,
    });
  };

  const handleStopVoiceSession = () => {
    stop();
  };

  const isCallActive = phase === "listening" || phase === "speaking" || phase === "starting";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased selection:bg-emerald-500/20 selection:text-emerald-900">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-50 px-4 py-3.5 shadow-xs">
         <div className="max-w-5xl mx-auto flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
           <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">

            <Link
              href="/"
              className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition font-medium"
            >
              <span>←</span>
              <span>Telephony IVR Simulator</span>
            </Link>
            <span className="text-slate-300">/</span>
            <h1 className="text-sm font-bold tracking-tight text-slate-900">
              Agent Configurations & Settings
            </h1>
          </div>

           <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
             <button
               onClick={handleReset}
               className="min-h-11 flex-1 text-xs px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer font-medium sm:flex-none"

            >
              Reset Defaults
            </button>
            <button
              onClick={handleSave}
               className="min-h-11 flex-1 text-xs font-semibold px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white transition shadow-xs cursor-pointer sm:flex-none"

            >
              {saveSuccess ? "✓ Saved!" : "Save Changes"}
            </button>
          </div>
        </div>
      </header>

      {/* Main Settings Content */}
       <div className="max-w-5xl w-full mx-auto p-3 sm:p-8 flex flex-col gap-6">

        
        {/* Title & Description */}
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            National Legal Aid Agent Configuration
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Customize system behavior, prompts, LLM model provider, and speech synthesizer voices.
          </p>
        </div>

        {/* PRIMARY AGENT CONFIGURATIONS CARD (Matches Screenshot Exactly) */}
         <section className="min-w-0 bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col gap-5 relative">

          
          {/* Active Session Indicator Pill */}
           <div className="flex flex-col items-start gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Agent Configuration Card
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                16699 Voice Pipeline
              </span>
            </div>
            <span
              className={`text-xs px-3 py-0.5 rounded-full font-medium border uppercase tracking-wider ${
                PHASE_STYLES[phase] ?? PHASE_STYLES.idle
              }`}
            >
              {phase === "speaking"
                ? "🔊 Assistant Speaking"
                : phase === "listening"
                  ? "🎙️ Listening"
                  : phase === "starting"
                    ? "⏳ Connecting"
                    : "Idle"}
            </span>
          </div>

          {/* 1. SYSTEM PROMPT */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
              SYSTEM PROMPT
            </label>
            <textarea
              rows={3}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter system prompt for the legal assistant..."
              className="w-full min-w-0 rounded-xl bg-slate-50 border border-slate-300 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 transition leading-relaxed resize-y font-sans"
            />
          </div>

          {/* 2. GREETING + INTRODUCTION */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
              GREETING + INTRODUCTION
            </label>
            <textarea
              rows={3}
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Enter initial greeting spoken when call connects..."
              className="w-full min-w-0 rounded-xl bg-slate-50 border border-slate-300 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 transition leading-relaxed resize-y font-sans"
            />
          </div>

          {/* 3. 2ND MESSAGE (IVR MENU PROMPT) */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
              2ND MESSAGE / IVR MENU PROMPT
            </label>
            <textarea
              rows={2}
              value={secondaryPrompt}
              onChange={(e) => setSecondaryPrompt(e.target.value)}
              placeholder="Enter 2nd message / IVR prompt..."
              className="w-full min-w-0 rounded-xl bg-slate-50 border border-slate-300 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 transition leading-relaxed resize-y font-sans"
            />
          </div>

          {/* 4. LLM MODEL & TTS VOICE DROPDOWNS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* LLM Model Select */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                LLM MODEL
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full min-w-0 rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 transition cursor-pointer"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </div>

            {/* TTS Voice Select */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                TTS VOICE
              </label>
              <select
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                className="w-full min-w-0 rounded-xl bg-slate-50 border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 transition cursor-pointer truncate"
              >
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 5. START & STOP ACTION BUTTONS (Exact Match to Screenshot) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <button
              onClick={handleStartVoiceSession}
              disabled={isCallActive}
              className={`w-full py-3 px-6 rounded-xl font-semibold text-sm transition shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                isCallActive
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                  : "bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white shadow-emerald-700/20"
              }`}
            >
              <span>▶</span>
              <span>Start Voice Session</span>
            </button>

            <button
              onClick={handleStopVoiceSession}
              disabled={!isCallActive}
              className={`w-full py-3 px-6 rounded-xl font-semibold text-sm transition shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                !isCallActive
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                  : "bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-rose-600/20"
              }`}
            >
              <span>⏹</span>
              <span>Stop</span>
            </button>
          </div>

          {/* Live Test Audio Transcript Display (If active) */}
          {transcript.length > 0 && (
            <div className="mt-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-2 max-h-48 overflow-y-auto">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Live Test Audio Transcript
              </span>
              {transcript.map((t, idx) => (
                <div key={idx} className="text-xs leading-relaxed">
                  <span className="font-semibold text-emerald-800">
                    {t.role === "assistant" ? "Agent: " : "You: "}
                  </span>
                  <span className="text-slate-800">{t.text}</span>
                </div>
              ))}
            </div>
          )}

        </section>

        {/* SECONDARY SETTINGS: TELEPHONY & HARDWARE AEC */}
        <section className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">
            Acoustic & Hardware AEC Telephony Options
          </h3>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <span className="text-xs font-semibold text-slate-900 block">
                Half-Duplex Hardware AEC Guard
              </span>
              <p className="text-[11px] text-slate-500">
                 Mutes microphone input while assistant audio plays to prevent speaker-to-mic acoustic feedback loops.

              </p>
            </div>
             <label className="relative inline-flex min-h-11 min-w-11 items-center justify-center cursor-pointer shrink-0">

              <input
                type="checkbox"
                checked={halfDuplex}
                onChange={(e) => setHalfDuplex(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-700"></div>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-2 border-t border-slate-200">
             <span>Current Pipeline: Soniox (STT bn) → Groq LLM → Soniox (TTS bn)</span>

            <Link
              href="/"
              className="text-emerald-800 hover:text-emerald-900 font-semibold underline underline-offset-4"
            >
              Open Softphone Simulator →
            </Link>
          </div>
        </section>

      </div>
    </main>
  );
}
