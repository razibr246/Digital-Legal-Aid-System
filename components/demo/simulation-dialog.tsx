"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SIMULATIONS, allTurns, clipUrl, type Simulation, type SimulationTurn } from "@/lib/demo/simulations";
import { getPersona } from "@/lib/demo/personas";
import { classifySeverity, type SeverityClassification } from "@/lib/agent/knowledge/severity-classification";
import type { SettlementDraft } from "@/lib/case/settlement-draft";
import { SettlementDraftAnimation } from "@/components/mediation/settlement-draft-animation";
import MediationBookingVisual from "@/components/mediation/mediation-booking-visual";

/**
 * Simulation Mode.
 *
 * Two things this is honest about, because a demo that overstates itself is worse than
 * no demo:
 *
 *  - The caller lines are fed to the REAL `classifySeverity`. Nothing here decides that
 *    this text "is" the Moyuri case; the classifier does, from the words, exactly as the
 *    live 16699 agent would. The proof panel prints what it derived. Reorder or reword a
 *    line and the derivation changes with it.
 *
 *  - The agent's voice is a pre-recorded clip, so a run costs nothing and can be repeated
 *    in front of judges without touching the STT/TTS budget. A missing clip degrades to a
 *    captioned line instead of failing.
 *
 * The workflow step that matters is a REAL call: the mediation booking posts to
 * /api/portal/mediations and is subject to the same gate as any officer's booking.
 */

/** Speaker labels. The four are colour-coded in the status bar and the turn card. */
const SPEAKER_COLOUR: Record<SimulationTurn["speaker"], string> = {
  agent: "#15803d",
  caller: "#1d4ed8",
  narrator: "#a16207",
  // Her own account, in her own voice. A different colour from `caller` on purpose: the
  // whole point of the turn is that this record is NOT the proxy's.
  moyuri: "#7e22ce",
};

const SPEAKER_BN: Record<SimulationTurn["speaker"], string> = {
  agent: "এজেন্ট",
  caller: "কলকারী",
  narrator: "সিস্টেম",
  moyuri: "আবেদনকারী",
};

interface Derivation {
  turn: SimulationTurn;
  index: number;
  result: SeverityClassification | null;
}

/** The live safe-window state, exactly as /api/portal/safe-contact reports it. */
interface WindowInfo {
  ok: boolean;
  hasWindow: boolean;
  message?: string;
  window?: { start: string; end: string; days: number[]; labelBn: string };
  open?: boolean;
  minutesRemaining?: number | null;
  minutesUntilOpen?: number;
  nextOpenAtBn?: string;
  blockReasonBn?: string;
  reminders?: Array<{ id: string; body: string | null; deferred_until: string | null; why_bn: string | null }>;
  blockedDestinations?: Array<{ channel: string; kind_bn: string | null; rule: string; why_bn: string }>;
}

const SEVERITY_TONE: Record<string, { bg: string; fg: string; bn: string }> = {
  emergency: { bg: "#fde8ec", fg: "#9f1239", bn: "জরুরি" },
  high: { bg: "#fff4e5", fg: "#a16207", bn: "উচ্চ" },
  priority: { bg: "#e0edff", fg: "#1d4ed8", bn: "অগ্রাধিকার" },
  standard: { bg: "#f1f5f9", fg: "#475569", bn: "সাধারণ" },
};

export function SimulationDialog({
  scenarioId,
  onClose,
}: {
  scenarioId: string;
  onClose: () => void;
}) {
  const activeId = scenarioId;
  // Selection belongs to the launcher now; the dialog is told which one to show.
  const setActiveId = useCallback((_id: string) => undefined, []);
  const sim = useMemo(() => SIMULATIONS.find((s) => s.id === activeId) ?? SIMULATIONS[0], [activeId]);


  const [index, setIndex] = useState(0);
  // A single cursor over the FLATTENED turn list, so the phase headers can mark where
  // the story is. The cursor is global on purpose: it is the only way the proof panel
  // and the settlement chain can agree on "how far through are we".
  const timeline = useMemo(() => allTurns(sim), [sim]);
  const phaseStarts = useMemo(() => {
    const marks: Array<{ id: string; n: number; titleBn: string; caption: string; at: number }> = [];
    let at = 0;
    for (const phase of sim.phases ?? []) {
      marks.push({ id: phase.id, n: phase.n, titleBn: phase.titleBn, caption: phase.caption, at });
      at += phase.turns.length;
    }
    return marks;
  }, [sim]);
  /** Has the story reached this phase? Panels reveal on arrival and then STAY. */
  const hasReachedPhase = useCallback(
    (id: string) => {
      const at = phaseStarts.find((m) => m.id === id)?.at;
      return at === undefined ? false : index >= at;
    },
    [phaseStarts, index]
  );

  const currentPhase = useMemo(
    () => [...phaseStarts].reverse().find((m) => index >= m.at) ?? null,
    [phaseStarts, index]
  );
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<Derivation[]>([]);
  const [audioState, setAudioState] = useState<"idle" | "playing" | "missing">("idle");
  const [booking, setBooking] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [bookingBusy, setBookingBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** The clip currently loaded, exposed on the DOM so a test can read it. */
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persona = getPersona(sim.personaId);
  const turn = timeline[index];
  const finished = index >= timeline.length;

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    audioRef.current?.pause();
    setRunning(false);
  }, []);

  useEffect(() => stop, [stop]);

  function reset(nextId: string) {
    stop();
    setActiveId(nextId);
    setIndex(0);
    setHistory([]);
    setBooking(null);
    setAudioState("idle");
  }

  /**
   * The recognition step. This is the real classifier, called with the real text.
   * Nothing in this file knows which scenario is running.
   */
  function derive(current: SimulationTurn): SeverityClassification | null {
    if (current.speaker !== "caller") return null;
    return classifySeverity(current.text);
  }

  /**
   * Plays a pre-recorded clip and resolves when it ends.
   *
   * A RENDERED <audio> element rather than `new Audio()`, for two reasons: the element is
   * inspectable (so a test can assert a clip really is playing rather than trusting a
   * state flag), and a detached `Audio` is invisible to anything that pauses playback on
   * visibility change.
   */
  function playAudio(src: string): Promise<void> {
    return new Promise((resolve) => {
      const audio = audioRef.current;
      if (!audio) { setAudioState("missing"); resolve(); return; }
      audio.src = src;
      audio.currentTime = 0;
      setAudioSrc(src);
      setAudioState("playing");
      const done = () => { setAudioState("idle"); resolve(); };
      audio.onended = done;
      audio.onerror = () => { setAudioState("missing"); resolve(); };
      audio.play().catch(() => { setAudioState("missing"); resolve(); });
    });
  }

  const advance = useCallback(() => {
    setHistory((h) => [...h, { turn, index, result: derive(turn) }]);
    if (index + 1 >= timeline.length) {
      setIndex(timeline.length);
      setRunning(false);
      return;
    }
    setIndex(index + 1);
  }, [index, timeline.length, turn]);

  async function start() {
    setRunning(true);
    setIndex(0);
    setHistory([]);
    setBooking(null);
  }

  // Auto-advance while running: play the clip if there is one, otherwise caption it.
  useEffect(() => {
    if (!running || finished || !turn) return;
    let cancelled = false;
    (async () => {
      const clip = clipUrl(turn);
      if (clip) {
        await playAudio(clip);
        if (cancelled) return;
      } else {
        setAudioState("idle");
        // Slow enough to read a Bangla line aloud in your head. At 1.1s a judge could not
        // keep up with the transcript, and the point of the run is that they follow the
        // argument rather than watch text scroll past.
        await new Promise((r) => setTimeout(r, 2600));
        if (cancelled) return;
      }
      advance();
    })();
    return () => { cancelled = true; };
  }, [running, turn, finished, advance]);

  async function bookMediation(date?: string, time?: string) {
    const cfg = sim.config?.bookMediation;
    if (!cfg) return;
    setBookingBusy(true);
    setBooking({ tone: "ok", text: "নিবন্ধন হচ্ছে…" });
    // Fall back to the next working day only if the visual did not supply one.
    let when = date;
    if (!when) {
      for (let i = 2; i <= 16 && !when; i += 1) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        if (d.getDay() <= 4) {
          when = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }
      }
    }
    if (!when) { setBookingBusy(false); setBooking({ tone: "err", text: "উপযুক্ত তারিখ পাওয়া যায়নি।" }); return; }
    try {
      const res = await fetch("/api/portal/mediations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          caseId: cfg.caseId,
          date: when,
          time: time || "11:00",
          venue: cfg.venue,
          mediatorName: cfg.mediatorName,
          notes: `সিমুলেশন: ${sim.title}`,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setBooking({ tone: "err", text: body.error || "নিবন্ধন করা যায়নি।" });
        return;
      }
      setBooking({ tone: "ok", text: `মধ্যস্থতা নির্ধারিত — ${when} ${time || "১১:০০"}, ${cfg.venue}` });
    } catch {
      setBooking({ tone: "err", text: "সংযোগ বিচ্ছিন্ন।" });
    } finally {
      setBookingBusy(false);
    }
  }

  const lastDerivation = history.filter((h) => h.result).slice(-1)[0]?.result ?? null;

  const [windowState, setWindowState] = useState<WindowInfo | null>(null);
  const [windowBusy, setWindowBusy] = useState(false);
  const [reminder, setReminder] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // The settlement drafting chain: book -> settle -> AI draft. Each step is a real API
  // call, so the draft on screen is the draft the system actually stored.
  const [chainBusy, setChainBusy] = useState(false);
  const [chainLog, setChainLog] = useState<string[]>([]);
  const [draft, setDraft] = useState<SettlementDraft | null>(null);

  async function runSettlementChain() {
    const cfg = sim.config?.bookMediation;
    if (!cfg) return;
    setChainBusy(true);
    setChainLog([]);
    setDraft(null);
    const say = (line: string) => setChainLog((l) => [...l, line]);
    try {
      const H = { "Content-Type": "application/json" };
      // A DLAO session: booking mediation is an officer action, and the chain has to run
      // through the same gate any officer's booking would.
      await page_fetch("/api/portal/login", { role: "dlao" });
      say("কর্মকর্তা সেশন — গেট একই");

      let date: string | null = null;
      for (let i = 2; i <= 16 && !date; i += 1) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        if (d.getDay() <= 4) {
          date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }
      }
      if (!date) { say("উপযুক্ত কার্যদিবস পাওয়া যায়নি"); return; }

      const booked = await page_fetch("/api/portal/mediations", {
        caseId: cfg.caseId, date, time: "11:00", venue: cfg.venue,
        mediatorName: cfg.mediatorName, notes: "সিমুলেশন: সালিশ সনদ প্রদর্শন",
      });
      if (!booked.ok) { say(`মধ্যস্থতা নির্ধারণ ব্যর্থ — ${booked.error ?? booked.reason}`); return; }
      say(`১. মধ্যস্থতা নির্ধারিত — ${date} ১১:০০, ${cfg.venue}`);

      const settled = await page_fetch("/api/portal/mediations", {
        mediationId: booked.mediation?.id, outcome: "settled",
      });
      if (!settled.ok) { say(`ফলাফল নথিভুক্ত ব্যর্থ — ${settled.error}`); return; }
      say("২. মধ্যস্থতা সালিশ হিসেবে নথিভুক্ত");

      if (settled.draft) {
        setDraft(settled.draft as SettlementDraft);
        const open = (settled.draft as SettlementDraft).openClauseIds?.length ?? 0;
        say(`৩. AI সালিশ সনদ প্রস্তুত করেছে — ${(settled.draft as SettlementDraft).clauses.length}টি অংশ, ${open}টি অনির্ধারিত`);
        say(`৪. স্বাক্ষর আটকে আছে: ${open}টি অংশ না থাকা পর্যন্ত কেউ স্বাক্ষর করবেন না।`);
      } else {
        say("৩. প্রস্তাবি ফেরত পাওয়া যায়নি");
      }
    } catch {
      say("সংযোগ বিচ্ছিন্ন");
    } finally {
      setChainBusy(false);
    }
  }

  /** Minimal authenticated POST helper for the chain. */
  async function page_fetch(path: string, payload: Record<string, unknown>) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { /* an empty body is still a valid answer */ }
    return { status: res.status, ok: res.ok && data.ok === true, ...data } as {
      status: number; ok: boolean; error?: string; reason?: string;
      mediation?: { id: string }; draft?: SettlementDraft;
    };
  }

  const loadWindow = useCallback(async (caseId: string) => {
    try {
      const res = await fetch(`/api/portal/safe-contact?caseId=${encodeURIComponent(caseId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const body = await res.json();
      if (res.ok && body?.ok) setWindowState(body as WindowInfo);
    } catch {
      /* The panel is an addition; a failure must not take the simulation down. */
    }
  }, []);

  useEffect(() => {
    const caseId = sim.config?.safeWindow?.caseId;
    if (caseId) void loadWindow(caseId);
    else setWindowState(null);
  }, [sim, loadWindow]);

  async function createReminder() {
    const caseId = sim.config?.safeWindow?.caseId;
    if (!caseId) return;
    setWindowBusy(true);
    setReminder(null);
    try {
      const res = await fetch("/api/portal/safe-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ caseId }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setReminder({ tone: "err", text: body.error || "অনুস্মারক নির্ধারণ করা যায়নি।" });
        return;
      }
      setReminder({ tone: "ok", text: `অনুস্মারক নির্ধারিত — ${body.reminder.labelBn}` });
      await loadWindow(caseId);
    } catch {
      setReminder({ tone: "err", text: "সংযোগ বিচ্ছিন্ন।" });
    } finally {
      setWindowBusy(false);
    }
  }
  // Escape closes, and the page behind must not scroll while the dialog is up.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={sim.title}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(15,23,42,0.62)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(8px, 2vh, 28px)",
      }}
    >
      <div
        style={{
          width: "min(1500px, 100%)",
          height: "100%",
          overflowY: "auto",
          background: "var(--portal-bg, #f8fafc)",
          borderRadius: 18,
          boxShadow: "0 32px 80px rgba(15,23,42,0.45)",
          padding: "clamp(16px, 2.4vw, 32px)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-lg, 20px)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="সিমুলেশন বন্ধ করুন"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            alignSelf: "flex-end",
            background: "#fff",
            color: "#0f172a",
            border: "1.5px solid var(--portal-border, #e2e8f0)",
            borderRadius: "var(--radius-full)",
            minWidth: "var(--touch-min, 2.75rem)",
            minHeight: "var(--touch-min, 2.75rem)",
            fontSize: "1.125rem",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 2px 10px rgba(15,23,42,0.12)",
          }}
        >
          ✕
        </button>
    <div style={{ maxWidth: "1180px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-xl, 24px)" }}>

      <header>
        <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--portal-accent-text, #15803d)", margin: "0 0 6px" }}>
          Simulation Mode
        </p>
        <h1 style={{ fontFamily: "var(--font-bn)", fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-text, #0f172a)", margin: "0 0 8px" }}>
          সিমুলেশন — ভয়েস থেকে সিদ্ধান্ত পর্যন্ত
        </h1>
        <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", color: "var(--portal-text-secondary, #475569)", margin: 0, maxWidth: "78ch", lineHeight: 1.7 }}>
          এখানে কোনো কিছু হাতে লেখা নেই। প্রতিটি উত্তর-এর শ্রেণি <strong>আসল শ্রেণিবিভাগ ইঞ্জিন</strong> ঠিক করে, ঠিক যেভাবে ১৬৬৯৯ এ ফোনে করে।
          এজন্যই একটি মিল থাকা কথা বদলে দিলে শ্রেণিও বদলে যাবে — এটিই প্রমাণ।
        </p>
      </header>

      {/* scenario picker */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {SIMULATIONS.map((s) => {
          const p = getPersona(s.personaId);
          const on = s.id === activeId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => reset(s.id)}
              style={{
                border: `1.5px solid ${on ? "var(--portal-accent, #15803d)" : "var(--portal-border, #e2e8f0)"}`,
                background: on ? "var(--portal-accent-subtle, #f0fdf4)" : "#fff",
                borderRadius: 10,
                padding: "10px 14px",
                minHeight: "var(--touch-min, 2.75rem)",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "var(--font-bn)",
              }}
            >
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--portal-accent-text, #15803d)" }}>
                {p?.code} · {p?.districtBn}
              </div>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--portal-text, #0f172a)" }}>{p?.nameBn}</div>
            </button>
          );
        })}
      </div>

      {/* One column on a phone, two only when there is genuinely room.
          The previous fixed `1.25fr 1fr` forced two columns at every width, which on a
          360px screen left ~150px per column and wrapped the Bangla into ribbons. */}
      <div
        style={{
          display: "grid",
          gap: "var(--space-xl, 24px)",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
          alignItems: "start",
        }}
      >

        {/* ---- the call ---- */}
        <section style={{ background: "#fff", border: "1px solid var(--portal-border, #e2e8f0)", borderRadius: 14, padding: "var(--space-lg, 20px)", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <h2 style={{ fontFamily: "var(--font-bn)", fontSize: "1.0625rem", fontWeight: 700, margin: "0 0 6px" }}>{sim.title}</h2>
            <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text-secondary, #475569)", margin: "0 0 10px", lineHeight: 1.65 }}>{sim.premise}</p>

            {/* The story, as steps. Each phase is a stage of the case rather than a line
                of dialogue, so this strip is the map a judge follows. */}
            {phaseStarts.length ? (
              <ol data-phase-strip="" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {phaseStarts.map((phase) => {
                  const done = index >= phase.at + (sim.phases?.find((p) => p.id === phase.id)?.turns.length ?? 0);
                  const active = currentPhase?.id === phase.id && !done;
                  return (
                    <li
                      key={phase.id}
                      aria-current={active ? "step" : undefined}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 11px",
                        borderRadius: "var(--radius-full)",
                        border: `1.5px solid ${active ? "var(--portal-accent, #15803d)" : done ? "#a7f3d0" : "var(--portal-border, #e2e8f0)"}`,
                        background: active ? "var(--portal-accent-subtle, #f0fdf4)" : done ? "#f0fdf4" : "#fff",
                        fontFamily: "var(--font-bn)",
                        fontSize: "0.75rem",
                        fontWeight: active ? 700 : 600,
                        color: active ? "var(--portal-accent-text, #15803d)" : done ? "#047857" : "var(--portal-text-muted, #94a3b8)",
                      }}
                    >
                      <span aria-hidden="true" style={{ fontWeight: 700 }}>{done ? "✓" : phase.n}</span>
                      {phase.titleBn}
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={running ? stop : start}
              style={{
                background: running ? "#b91c1c" : "var(--portal-accent, #15803d)",
                color: "#fff", border: "none", borderRadius: 8,
                padding: "0 20px", minHeight: "var(--touch-min, 2.75rem)",
                fontFamily: "var(--font-bn)", fontWeight: 700, fontSize: "0.9375rem", cursor: "pointer",
              }}
            >
              {running ? "থামান" : finished ? "আবার চালান" : `সিমুলেশন চালান (${timeline.length} ধাপ)`}
            </button>
            <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-muted, #94a3b8)" }}>
              {finished ? "সম্পন্ন" : `ধাপ ${index + 1} / ${timeline.length}`}
              {audioState === "playing" ? " · ভয়েস চলছে" : audioState === "missing" ? " · অডিও নেই, লেখা দেখানো হচ্ছে" : ""}
            </span>
          </div>

          {booking ? (
            <p role="status" style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", fontWeight: 600, margin: 0, padding: "10px 12px", borderRadius: 8, background: booking.tone === "ok" ? "#dff3ea" : "#fde8ec", color: booking.tone === "ok" ? "#047857" : "#9f1239" }}>
              {booking.text}
            </p>
          ) : null}

          {/* ---- the live actions, revealed at the phase where they belong ----
              The safe window and the mediation booking are not curiosities parked at the
              end: the window governs the paralegal visit in phase 3, and the booking
              happens in phase 5. Revealing each when its phase arrives is the difference
              between a story and a form. */}
          {hasReachedPhase("window") && sim.config?.safeWindow && windowState?.hasWindow ? (
            <section style={{ border: "1.5px solid #1d4ed8", borderRadius: 12, background: "#eff6ff", padding: "var(--space-lg, 20px)" }}>
              <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", fontWeight: 700, margin: "0 0 4px", color: "#1e3a8a" }}>
                এই মুহূর্তে যা ঘটছে
              </h3>
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "#1e3a8a", margin: "0 0 10px", lineHeight: 1.65 }}>
                {windowState.window?.labelBn} — {windowState.open
                  ? `এখন খোলা, ${windowState.minutesRemaining} মিনিট বাকি।`
                  : `এখন বন্ধ। পরবর্তী সুযোগ ${windowState.nextOpenAtBn}।`}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={createReminder}
                  disabled={windowBusy}
                  style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "0 16px", minHeight: "var(--touch-min, 2.75rem)", fontFamily: "var(--font-bn)", fontWeight: 700, cursor: windowBusy ? "wait" : "pointer", opacity: windowBusy ? 0.6 : 1 }}
                >
                  {windowBusy ? "নির্ধারণ হচ্ছে…" : "কর্মকর্তার অনুস্মারক নির্ধারণ করুন"}
                </button>
                {reminder ? (
                  <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", fontWeight: 600, color: reminder.tone === "ok" ? "#047857" : "#9f1239" }}>
                    {reminder.text}
                  </span>
                ) : null}
              </div>
              {windowState.blockedDestinations?.length ? (
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "#9f1239", margin: "10px 0 0" }}>
                  বন্ধ ঠিকানা: {windowState.blockedDestinations.map((b) => b.kind_bn || b.channel).join(", ")} — স্বামীর কাছে কোনো তথ্য যাবে না।
                </p>
              ) : null}
            </section>
          ) : null}

          {hasReachedPhase("mediation") ? (
            <section style={{ border: "1.5px solid #1d4ed8", borderRadius: 12, background: "#eff6ff", padding: "var(--space-lg, 20px)" }}>
              <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", fontWeight: 700, margin: "0 0 4px", color: "#1e3a8a" }}>
                মধ্যস্থতা নির্ধারণ
              </h3>
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "#1e3a8a", margin: "0 0 10px", lineHeight: 1.65 }}>
                কর্মকর্তা কার্যদিবসে তারিখ বেছে নিচ্ছেন, আর মধ্যস্থতাকারীকে আমন্ত্রণ জানাচ্ছেন।
              </p>
              {sim.config?.bookMediation ? (
                <>
                  <MediationBookingVisual
                    config={sim.config.bookMediation}
                    busy={bookingBusy}
                    onBook={(date, time) => bookMediation(date, time)}
                  />

                  {/*
                    The chain is gated on `finished` while the booking is not, and the
                    difference is deliberate: booking IS what the officer does in this
                    phase, so it appears on arrival. The chain then books, records an
                    outcome and drafts the decree — which is the NEXT two phases, so
                    offering it mid-story would let a judge skip the story it summarises.
                  */}
                  {finished ? (
                    <div style={{ borderTop: "1px solid #bfdbfe", paddingTop: 12, marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={runSettlementChain}
                        disabled={chainBusy}
                        style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "0 18px", minHeight: "var(--touch-min, 2.75rem)", fontFamily: "var(--font-bn)", fontWeight: 700, fontSize: "0.875rem", cursor: chainBusy ? "wait" : "pointer", opacity: chainBusy ? 0.6 : 1 }}
                      >
                        {chainBusy ? "চলছে…" : "পুরো চেইন চালান: নির্ধারণ → সালিশ → সনদ"}
                      </button>
                      <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "#1e3a8a", margin: "6px 0 0" }}>
                        এক ক্লিকে নির্ধারণ, সালিশ ফলাফল এবং AI-এর সালিশ সনদ প্রস্তুত — তিনটিই আসল API।
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
          ) : null}

          {/* The engine status bar. Reads like a process rather than a form: what stage,
              which speaker, and whether audio is playing right now. */}
          <div
            data-engine-status=""
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              padding: "10px 12px",
              borderRadius: 10,
              background: "#0f172a",
              color: "#e2e8f0",
              fontFamily: "var(--font-ui)",
              fontSize: "0.75rem",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: running ? "#4ade80" : "#64748b",
                  boxShadow: running ? "0 0 0 3px rgba(74,222,128,0.25)" : "none",
                }}
              />
              {running ? "চলছে" : finished ? "সম্পন্ন" : "প্রস্তুত"}
            </span>
            <span style={{ color: "#94a3b8" }}>ধাপ</span>
            <span style={{ fontWeight: 700, color: "#e2e8f0" }}>{Math.min(index + 1, timeline.length)}/{timeline.length}</span>
            {currentPhase ? (
              <>
                <span style={{ color: "#94a3b8" }}>পর্ব</span>
                <span style={{ fontWeight: 700, color: "#a78bfa" }}>{currentPhase.n}. {currentPhase.titleBn}</span>
              </>
            ) : null}
            {turn ? (
              <>
                <span style={{ color: "#94a3b8" }}>বক্তা</span>
                <span style={{ fontWeight: 700, color: turn.speaker === "caller" ? "#7dd3fc" : turn.speaker === "narrator" ? "#fcd34d" : "#86efac" }}>
                  {SPEAKER_BN[turn.speaker]}
                </span>
              </>
            ) : null}
            <span style={{ color: "#94a3b8" }}>ভয়েস</span>
            <span style={{ fontWeight: 700, color: audioState === "playing" ? "#4ade80" : audioState === "missing" ? "#f87171" : "#64748b" }}>
              {audioState === "playing" ? "চলছে" : audioState === "missing" ? "ক্লিপ নেই" : "নীরব"}
            </span>
            <div
              aria-hidden="true"
              style={{ flex: "1 1 90px", minWidth: 70, height: 4, borderRadius: 999, background: "#1e293b", overflow: "hidden" }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${timeline.length ? (index / timeline.length) * 100 : 0}%`,
                  background: "linear-gradient(90deg,#4ade80,#a78bfa)",
                  transition: "width 400ms ease-out",
                }}
              />
            </div>
          </div>

          {/* The pre-recorded player. Kept in the DOM (not detached) so it is
              inspectable and controllable, and so a browser can throttle it with the rest
              of the page. `preload="auto"` because the next clip is known ahead of time. */}
          <audio
            ref={audioRef}
            preload="auto"
            data-audio-src={audioSrc ?? ""}
            data-audio-state={audioState}
            style={{ display: "none" }}
          />

          {/* current line */}
          {!finished && turn ? (
            <div
              style={{
                border: `1.5px solid ${SPEAKER_COLOUR[turn.speaker]}`,
                borderLeft: `4px solid ${SPEAKER_COLOUR[turn.speaker]}`,
                borderRadius: 10, padding: "12px 14px", background: "#fbfdff",
              }}
            >
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: SPEAKER_COLOUR[turn.speaker], marginBottom: 4 }}>
                {SPEAKER_BN[turn.speaker]}
                {turn.step ? ` · ${turn.step}` : ""}
              </div>
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", lineHeight: 1.7, color: "var(--portal-text, #0f172a)", margin: 0 }}>
                {turn.text}
              </p>
            </div>
          ) : null}

          {finished ? (
            <div style={{ border: "1.5px solid #047857", borderRadius: 10, padding: "12px 14px", background: "#f0fdf4" }}>
              <strong style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", color: "#047857" }}>ফলাফল</strong>
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "#065f46", margin: "6px 0 0", lineHeight: 1.65 }}>{sim.outcome}</p>
            </div>
          ) : null}

          {/* ---- the AI's settlement drafting, shown as it happens ---- */}
          {chainLog.length ? (
            <section style={{ border: "1.5px solid #7c3aed", borderRadius: 12, background: "#faf5ff", padding: "var(--space-lg, 20px)" }}>
              <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 700, margin: "0 0 8px", color: "#5b21b6" }}>
                মধ্যস্থতা থেকে সালিশ সনদ — AI নথিভুক্ত করছে
              </h3>
              <ol style={{ margin: "0 0 14px", padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 5 }}>
                {chainLog.map((line, i) => (
                  <li key={i} style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", lineHeight: 1.6, color: "#5b21b6" }}>
                    {line}
                  </li>
                ))}
              </ol>

              {draft ? (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                    <strong style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", color: "#5b21b6" }}>
                      {draft.titleBn} — {draft.docketId}
                    </strong>
                    <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#7c3aed" }}>
                      {draft.clauses.length - draft.openClauseIds.length}/{draft.clauses.length} অংশ নথি থেকে নির্ধারিত
                    </span>
                  </div>
                  <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "#5b21b6", margin: "0 0 12px", lineHeight: 1.65 }}>
                    প্রতিটি অংশের পাশে তার উৎস। উৎস নেই এমন অংশ ফাঁকা রাখা হয়েছে — সালিশ সনদ একটি বাস্তবায়নযোগ্য দলিল, তাই নথিতে না থাকা কোনো শর্ত বানিয়ে লেখা হয় না।
                  </p>

                  <SettlementDraftAnimation draft={draft} />

                  <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                    <a
                      href={`/demo/settlement-print?caseId=${encodeURIComponent(sim.config?.bookMediation?.caseId || "")}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ background: "#5b21b6", color: "#fff", textDecoration: "none", borderRadius: 8, padding: "10px 16px", minHeight: "var(--touch-min, 2.75rem)", display: "inline-flex", alignItems: "center", fontFamily: "var(--font-bn)", fontWeight: 700, fontSize: "0.875rem" }}
                    >
                      সালিশ সনদ PDF নামান
                    </a>
                    <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "#6d28d9", alignSelf: "center" }}>
                      A4 নথি — ছাপলেই PDF। অনির্ধারিত অংশ ফাঁকা রেখা ছাপা হবে, কিছু বানিয়ে লেখা হবে না।
                    </span>
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          {/* transcript */}
          <div>
            <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", fontWeight: 700, margin: "0 0 8px", color: "var(--portal-text-secondary, #475569)" }}>
              ট্রান্সক্রিপ্ট
            </h3>
            {history.length === 0 ? (
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text-muted, #94a3b8)", margin: 0 }}>
                সিমুলেশন চালালে এখানে কথোপকথন তৈরি হবে।
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
                {history.map((h) => (
                  <div key={h.index}>
                    <div style={{ fontSize: "0.625rem", fontWeight: 700, color: SPEAKER_COLOUR[h.turn.speaker]}}>
                      {SPEAKER_BN[h.turn.speaker]}{h.turn.step ? ` · ${h.turn.step}` : ""}
                    </div>
                    <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", lineHeight: 1.6, color: "var(--portal-text, #0f172a)", margin: "2px 0 0" }}>{h.turn.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ---- the proof ---- */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* The 15-minute window: the part of A1 that a judge will press on, because
              "contact her sometime" is not a safety control. */}
          {sim.config?.safeWindow ? (
            <section style={{ background: "#fff", border: "1px solid var(--portal-border, #e2e8f0)", borderRadius: 14, padding: "var(--space-lg, 20px)" }}>
              <h2 style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", fontWeight: 700, margin: "0 0 4px" }}>
                নিরাপদ সময় — ১৫ মিনিট
              </h2>
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-secondary, #475569)", margin: "0 0 12px", lineHeight: 1.6 }}>
                মোয়ূরীর সঙ্গে যোগাযোগ করা যায় শুধু এই সময়সীমার ভিতরে। বাইরে কল করলে স্বামী ধরতে পারেন।
              </p>

              {!windowState ? (
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text-muted, #94a3b8)", margin: 0 }}>
                  নিরাপদ সময় লোড হচ্ছে…
                </p>
              ) : !windowState.hasWindow ? (
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "#b45309", margin: 0 }}>
                  {windowState.message}
                </p>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    <span style={{ background: windowState.open ? "#dff3ea" : "#f1f5f9", color: windowState.open ? "#047857" : "#475569", borderRadius: 999, padding: "5px 12px", fontFamily: "var(--font-bn)", fontSize: "0.8125rem", fontWeight: 700 }}>
                      {windowState.open
                        ? `এখন খোলা — ${windowState.minutesRemaining} মিনিট বাকি`
                        : `এখন বন্ধ — ${windowState.minutesUntilOpen} মিনিট পর খুলবে`}
                    </span>
                  </div>
                  <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", fontWeight: 600, color: "var(--portal-text, #0f172a)", margin: "0 0 4px" }}>
                    {windowState.window?.labelBn}
                  </p>
                  <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-secondary, #475569)", margin: "0 0 10px" }}>
                    পরবর্তী সুযোগ: {windowState.nextOpenAtBn}
                  </p>

                  {!windowState.open && windowState.blockReasonBn ? (
                    <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "#b91c1c", margin: "0 0 10px", padding: "8px 10px", background: "#fef2f2", borderRadius: 8, lineHeight: 1.6 }}>
                      {windowState.blockReasonBn}
                    </p>
                  ) : null}

                  {windowState.blockedDestinations?.length ? (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--portal-text-secondary, #475569)", marginBottom: 5 }}>
                        সম্পূর্ণ বন্ধ ঠিকানা
                      </div>
                      {windowState.blockedDestinations.map((b) => (
                        <p key={b.channel} style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "#9f1239", margin: "0 0 4px" }}>
                          {b.kind_bn || b.channel} — {b.why_bn}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={createReminder}
                    disabled={windowBusy}
                    style={{ background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "0 16px", minHeight: "var(--touch-min, 2.75rem)", fontFamily: "var(--font-bn)", fontWeight: 700, fontSize: "0.875rem", cursor: windowBusy ? "wait" : "pointer", opacity: windowBusy ? 0.6 : 1 }}
                  >
                    {windowBusy ? "নির্ধারণ হচ্ছে…" : "AI কর্মকর্তার অনুস্মারক নির্ধারণ করুন"}
                  </button>

                  {reminder ? (
                    <p role="status" style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", fontWeight: 600, margin: "8px 0 0", color: reminder.tone === "ok" ? "#047857" : "#9f1239" }}>
                      {reminder.text}
                    </p>
                  ) : null}

                  {windowState.reminders?.length ? (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--portal-border, #e2e8f0)" }}>
                      <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--portal-text-secondary, #475569)", marginBottom: 5 }}>
                        অপেক্ষমাণ অনুস্মারক
                      </div>
                      {windowState.reminders.map((r) => (
                        <p key={r.id} style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text, #0f172a)", margin: "0 0 4px" }}>
                          {r.body}
                          {r.why_bn ? (
                            <span style={{ display: "block", color: "var(--portal-text-secondary, #475569)" }}>{r.why_bn}</span>
                          ) : null}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          <section style={{ background: "#fff", border: "1px solid var(--portal-border, #e2e8f0)", borderRadius: 14, padding: "var(--space-lg, 20px)" }}>
            <h2 style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", fontWeight: 700, margin: "0 0 4px" }}>
              শ্রেণিবিভাগ — আসল ইঞ্জিনের ফলাফল
            </h2>
            <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-secondary, #475569)", margin: "0 0 12px", lineHeight: 1.6 }}>
              কলকারীর বাক্যটি <code>classifySeverity()</code>-এর মধ্যে দেওয়া হয়েছে। ফলাফল নিচে যা আসছে তা কোডের উত্তর, কোনো লিখে রাখা উত্তর নয়।
            </p>

            {lastDerivation ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  <span style={{ background: SEVERITY_TONE[lastDerivation.severity]?.bg, color: SEVERITY_TONE[lastDerivation.severity]?.fg, borderRadius: 999, padding: "5px 12px", fontFamily: "var(--font-bn)", fontSize: "0.8125rem", fontWeight: 700 }}>
                    {SEVERITY_TONE[lastDerivation.severity]?.bn} · {lastDerivation.severity}
                  </span>
                  <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", fontWeight: 600, color: "var(--portal-text, #0f172a)" }}>
                    {lastDerivation.categoryBn || lastDerivation.category}
                  </span>
                </div>
                {lastDerivation.matchedTagsBn?.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                    {lastDerivation.matchedTagsBn.map((tag) => (
                      <span key={tag} style={{ background: "#f1f5f9", color: "#334155", borderRadius: 6, padding: "3px 8px", fontFamily: "var(--font-bn)", fontSize: "0.6875rem" }}>{tag}</span>
                    ))}
                  </div>
                ) : null}
                {lastDerivation.caseReference ? (
                  <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-secondary, #475569)", margin: 0 }}>
                    মিল পাওয়া প্রতিভাতি: <strong>{lastDerivation.caseReference}</strong>
                  </p>
                ) : null}
                {lastDerivation.acknowledgmentBn ? (
                  <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text, #0f172a)", margin: "10px 0 0", lineHeight: 1.65, borderTop: "1px solid var(--portal-border, #e2e8f0)", paddingTop: 10 }}>
                    {lastDerivation.acknowledgmentBn}
                  </p>
                ) : null}
              </>
            ) : (
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text-muted, #94a3b8)", margin: 0 }}>
                কোনো কলকারীর উত্তর এখনো বিশ্লেষণ করা হয়নি।
              </p>
            )}
          </section>

          <section style={{ background: "#fff", border: "1px solid var(--portal-border, #e2e8f0)", borderRadius: 14, padding: "var(--space-lg, 20px)" }}>
            <h2 style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", fontWeight: 700, margin: "0 0 10px" }}>
              প্রতিটি ধাপ কী প্রমাণ করে
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {(sim.phases ?? [{ id: "all", n: 1, titleBn: sim.title, caption: "", narration: "", turns: timeline }]).map((phase, pi) => {
                const at = sim.phases?.length ? phaseStarts.find((m) => m.id === phase.id)?.at ?? 0 : 0;
                const started = index >= at;
                return (
                  <div key={phase.id}>
                    {sim.phases?.length ? (
                      <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: started ? "var(--portal-accent-text, #15803d)" : "var(--portal-text-muted, #94a3b8)", marginBottom: 6 }}>
                        {phase.n}. {phase.titleBn}
                      </div>
                    ) : null}
                    <ol style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {phase.turns.map((t) => {
                        const done = started && history.some((h) => h.turn.text === t.text);
                        return (
                          <li key={t.text.slice(0, 40)} style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", lineHeight: 1.6, color: done ? "var(--portal-text, #0f172a)" : "var(--portal-text-muted, #94a3b8)" }}>
                            <strong style={{ color: done ? "#047857" : "inherit" }}>{done ? "✓ " : ""}</strong>
                            {t.proves}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </div>

      <footer style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Link
          href="/demo"
          style={{
            fontFamily: "var(--font-bn)",
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "var(--portal-accent-text, #15803d)",
            textDecoration: "none",
            // A bare text link is 21px tall, which is a thumb-sized mistake on a phone and
            // unusable for the blind and low-literacy users this portal is built for.
            display: "inline-flex",
            alignItems: "center",
            minHeight: "var(--touch-min, 2.75rem)",
            padding: "0 12px",
            borderRadius: 8,
            border: "1.5px solid var(--portal-border, #e2e8f0)",
            background: "#fff",
          }}
        >
          ← পাঁচটি সিনারিও
        </Link>
        <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-muted, #94a3b8)" }}>
          পূর্বালচিত ভয়েস ব্যবহারের কারণে এই সিমুলেশন চালানোর জন্য কোনো STT বা TTS খরচ হয় না।
        </span>
      </footer>
    </div>
      </div>
    </div>
  );
}

export default SimulationDialog;
