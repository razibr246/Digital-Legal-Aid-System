"use client";

/**
 * Plays back the DLAO <-> applicant consultation.
 *
 * The animation is cosmetic; the content is not. Every turn comes from the server's
 * deterministic script, which is derived from the applicant's real data and the
 * eligibility rules, so the conversation visibly confirms identity, confirms means,
 * names the act engaged, delivers the assurance, and then either appoints a panel
 * lawyer or records a refusal — whichever the facts actually produced.
 *
 * Timers are intentionally gentle: a judge needs to be able to read each line, and
 * the point is to show the *sequence* of a real callback, not to look like a fake
 * instant messenger.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConsultationPhase, ConsultationScript, ConsultationTurn } from "@/lib/case/consultation-script";
import { consultationPhaseLabel } from "@/lib/case/consultation-script";

const SPEAKER_LABEL: Record<ConsultationTurn["speaker"], string> = {
  dlao: "ডিএলএও",
  applicant: "আবেদনকারী",
  system: "সিস্টেম",
};

const EVENT_BADGE: Record<string, string> = {
  identity_confirmed: "পরিচয় যাচাই সফল",
  finance_confirmed: "আর্থিক তথ্য নথিভুক্ত",
  disability_confirmed: "প্রতিবন্ধিতা স্বীকৃত",
  evidence_verified: "প্রমাণ যাচাই সম্পন্ন",
  evidence_confirmed: "প্রমাণ সংযুক্ত",
  act_engaged: "প্রযোজ্য আইন শনাক্ত",
  eligibility_decided: "সহায়তার সিদ্ধান্ত",
  lawyer_assigned: "আইনজীবী নিয়োগ",
  consultation_complete: "কেস নথিভুক্ত",
};

/**
 * Pacing, in one place so it can be reasoned about rather than nudged inline.
 *
 * This is set for a judge in a room who has to *read* Bangla as well as listen to
 * it — roughly two and a half times the speed that felt right on a phone. Each turn
 * gets a floor, because a short line like "জি, ধন্যবাদ" would otherwise be gone
 * before anyone had finished the previous one.
 */
const PACE = {
  /** ms before a turn's first character appears. */
  leadIn: 620,
  /** ms per ~14 characters, while the line "types". */
  perChunkTyping: 195,
  /** ms per chunk for a non-typed (system) line, which is read rather than spoken. */
  perChunkRead: 240,
  /** ms between one turn landing and the next starting. */
  betweenTurns: 950,
} as const;

function speakMs(text: string, typing: boolean): number {
  const words = Math.max(3, Math.round(text.length / 14));
  return (
    PACE.leadIn + words * (typing ? PACE.perChunkTyping : PACE.perChunkRead)
  );
}

export default function ConsultationPlayer({
  script,
  dlaoName,
  panelLawyerName,
  applicantName,
  autoStart = true,
  /** Turns at or below this seq are shown immediately, so an interrupted playback resumes. */
  startFromSeq = 0,
  onFirstTurn,
  onProgress,
  onFinished,
}: {
  script: ConsultationScript;
  dlaoName: string;
  panelLawyerName: string | null;
  applicantName: string;
  autoStart?: boolean;
  startFromSeq?: number;
  onFirstTurn?: () => void;
  /** Fired as turns land, so the caller can persist progress. */
  onProgress?: (seq: number) => void;
  onFinished?: () => void;
}) {
  // Declared before `visible`: the resume initialiser below reads it during the first
  // render, and a ref declared after it throws a temporal-dead-zone error that takes
  // the whole component down — which looks exactly like "the animation never appears".
  const turnsRef = useRef<ConsultationTurn[]>(script.turns);
  turnsRef.current = script.turns;

  const [visible, setVisible] = useState<ConsultationTurn[]>(() =>
    // Resuming: everything the applicant has already seen is shown at once, and the
    // timer chain picks up from the next unseen turn.
    startFromSeq > 0 ? turnsRef.current.filter((t) => t.seq <= startFromSeq) : [],
  );
  const [typing, setTyping] = useState<ConsultationTurn | null>(null);
  const [phase, setPhase] = useState<ConsultationPhase>("connect");
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);
  // Bumped to replay. The playback effect cannot depend on a "playing" boolean,
  // because flipping that does not re-run the effect and the timer chain would
  // simply carry on from where it was.
  const [runId, setRunId] = useState(autoStart ? 1 : 0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const finishedRef = useRef(false);
  // Held in a ref on purpose. Depending on the callback directly restarted the whole
  // animation whenever the parent re-rendered, because an inline arrow is a new
  // function every render: the effect tore down its own timer chain and began again
  // from turn 1, which looked like a message loop at the end.
  const onFinishedRef = useRef(onFinished);
  // startFromSeq is only for initial mount — must not trigger replays when the parent
  // updates lastSeq via onProgress. Storing in a ref prevents the effect restart loop.
  const startFromSeqRef = useRef(startFromSeq);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);
  const onFirstTurnRef = useRef(onFirstTurn);
  useEffect(() => {
    onFirstTurnRef.current = onFirstTurn;
  }, [onFirstTurn]);
  const onProgressRef = useRef(onProgress);
  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);
  const firstTurnRef = useRef(false);
  // Set by Skip. The timer chain checks it, because the playback effect cannot be
  // torn down from here — its deps have not changed — so without this the chain would
  // keep appending turns behind the skip and fire the completion callback twice.
  const stoppedRef = useRef(false);

  const turns = script.turns;

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [visible, typing, scrollToEnd]);

  useEffect(() => {
    if (!autoStart || runId === 0) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Resume where the applicant left off rather than replaying from turn 1.
    // Uses the ref so that onProgress -> setLastSeq in the parent does not
    // restart this effect and cause an infinite playback loop.
    const resumeFrom = startFromSeqRef.current;
    let index = Math.max(0, turns.findIndex((t) => t.seq > resumeFrom));
    if (index === -1) index = turns.length;
    if (index >= turns.length) {
      setPlaying(false);
      setDone(true);
      return;
    }

    setPlaying(true);

    const step = () => {
      if (stoppedRef.current) return;
      if (cancelled || index >= turns.length) {
        if (!cancelled) {
          setTyping(null);
          setPlaying(false);
          setDone(true);
          if (!finishedRef.current) {
            finishedRef.current = true;
            onFinishedRef.current?.();
          }
        }
        return;
      }
      const turn = turns[index];
      setPhase(turn.phase);
      setTyping(turn);
      if (!firstTurnRef.current) {
        firstTurnRef.current = true;
        // The panel collapses its explanation here: the explainer is what an
        // applicant reads before the call, but once the call is running the
        // conversation itself is the thing that needs the room.
        onFirstTurnRef.current?.();
      }
      timers.push(setTimeout(() => {
        if (cancelled || stoppedRef.current) return;
        setTyping(null);
        setVisible((prev) => (prev.some((t) => t.seq === turn.seq) ? prev : [...prev, turn]));
        onProgressRef.current?.(turn.seq);
        index += 1;
        // Extra pause for important turns (e.g., evidence verification) to catch attention
        const extraPause = turn.pauseMs ?? 0;
        timers.push(setTimeout(step, PACE.betweenTurns + extraPause));
      }, speakMs(turn.textBn, turn.speaker !== "system")));
    };

    timers.push(setTimeout(step, 900));
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // startFromSeq is read from ref, not deps — updating it must not restart playback.
  }, [autoStart, runId, turns]);

  /** Jump straight to the verdict: reveal every remaining turn at once. */
  const skipToEnd = useCallback(() => {
    stoppedRef.current = true;
    finishedRef.current = true;
    setTyping(null);
    setVisible(turns);
    onProgressRef.current?.(turns[turns.length - 1]?.seq ?? 0);
    setPhase(turns[turns.length - 1]?.phase ?? "close");
    setPlaying(false);
    setDone(true);
    onFinishedRef.current?.();
  }, [turns]);

  const restart = () => {
    finishedRef.current = false;
    stoppedRef.current = false;
    firstTurnRef.current = false;
    setVisible([]);
    setTyping(null);
    setDone(false);
    setPlaying(false);
    setPhase("connect");
    setRunId((n) => n + 1);
  };

  const activePhase = phase;

  return (
    <div className="consult">
      <style>{`
        .consult { display:flex; flex-direction:column; gap:14px; }
        .consult-hd { display:flex; align-items:center; gap:12px; flex-wrap:wrap;
          background:linear-gradient(135deg,#064e3b,#047857); color:#fff;
          padding:16px 18px; border-radius:16px 16px 0 0; }
        .consult-hd h3 { margin:0; font-size:17px; font-weight:800; letter-spacing:.2px; }
        .consult-hd p  { margin:4px 0 0; font-size:12.5px; opacity:.92; line-height:1.5; }
        .consult-dots { display:flex; align-items:center; gap:7px; }
        .consult-dot { width:11px; height:11px; border-radius:50%; background:rgba(255,255,255,.28); }
        .consult-dot.on { background:#34d399; box-shadow:0 0 0 4px rgba(52,211,153,.24); }
        .consult-dot.live { background:#fbbf24; animation:consult-pulse 1.1s ease-in-out infinite; }
        @keyframes consult-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.82)} }

        .consult-phase { display:flex; gap:6px; flex-wrap:wrap; padding:10px 18px;
          background:#f1f5f9; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0; }
        .consult-chip { font-size:11.5px; font-weight:700; padding:4px 10px; border-radius:999px;
          background:#e2e8f0; color:#64748b; }
        .consult-chip.on { background:#047857; color:#fff; }

        .consult-body { max-height:min(52vh, 460px); overflow-y:auto; padding:16px 18px;
          background:#f8fafc; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0;
          display:flex; flex-direction:column; gap:11px; }
        .consult-row { display:flex; gap:9px; align-items:flex-end; }
        .consult-row.me { flex-direction:row-reverse; }
        .consult-av { width:31px; height:31px; border-radius:50%; flex:0 0 31px;
          display:grid; place-items:center; font-size:11px; font-weight:800; color:#fff; }
        .consult-av.dlao { background:#0f766e; }
        .consult-av.applicant { background:#4338ca; }
        .consult-av.system { background:#64748b; }
        .consult-bub { max-width:78%; padding:9px 13px; border-radius:15px;
          font-size:13.5px; line-height:1.6; box-shadow:0 1px 2px rgba(15,23,42,.07); }
        .consult-row.dlao .consult-bub { background:#fff; border:1px solid #d6f5ec; border-bottom-left-radius:5px; }
        .consult-row.applicant .consult-bub { background:#eef2ff; border:1px solid #c7d2fe; border-bottom-right-radius:5px; }
        .consult-row.system .consult-bub { background:#e2e8f0; border-bottom-left-radius:5px; font-size:12.5px; }
        .consult-who { font-size:10.5px; font-weight:800; color:#64748b; margin:0 4px 3px; }
        .consult-typing { display:inline-flex; gap:3px; align-items:center; padding:3px 0; }
        .consult-typing i { width:6px; height:6px; border-radius:50%; background:#94a3b8;
          animation:consult-bounce 1.05s infinite; }
        .consult-typing i:nth-child(2){animation-delay:.16s} .consult-typing i:nth-child(3){animation-delay:.32s}
        @keyframes consult-bounce { 0%,60%,100%{transform:translateY(0);opacity:.45} 30%{transform:translateY(-4px);opacity:1} }
        .consult-badge { display:inline-block; margin-top:6px; font-size:10.5px; font-weight:800;
          padding:3px 8px; border-radius:999px; background:#d1fae5; color:#065f46; }
        .consult-badge.highlight { background:#fef3c7; color:#92400e; border:2px solid #f59e0b;
          animation:consult-highlight 1.5s ease-in-out; }
        @keyframes consult-highlight { 0%{transform:scale(1)} 50%{transform:scale(1.08)} 100%{transform:scale(1)} }
        .consult-verdict { padding:15px 18px; background:#fff; border:1px solid #e2e8f0;
          border-top:0; border-radius:0 0 16px 16px; }
        .consult-act { font-size:12.5px; font-weight:800; color:#0f766e; margin:0 0 8px; }
        .consult-assure { font-size:14px; line-height:1.7; color:#0f172a; margin:0 0 12px;
          padding:11px 13px; background:#f0fdf4; border-left:4px solid #16a34a; border-radius:0 9px 9px 0; }
        .consult-assure.no { background:#fef2f2; border-left-color:#dc2626; }
        .consult-meta { display:grid; gap:7px; font-size:12px; color:#475569; }
        .consult-meta b { color:#0f172a; }
        .consult-actions { display:flex; gap:8px; margin-top:13px; flex-wrap:wrap; }
        .consult-btn { font:inherit; font-size:12.5px; font-weight:800; padding:8px 15px;
          border-radius:9px; border:1px solid #cbd5e1; background:#fff; color:#334155; cursor:pointer; }
        .consult-btn:hover { background:#f1f5f9; }
      `}</style>

      <div className="consult-hd">
        <div className="consult-dots" aria-hidden>
          <span className="consult-dot on" />
          <span className="consult-dot live" />
          <span className="consult-dot live" />
          <span className="consult-dot live" />
        </div>
        {playing ? (
          <button
            type="button"
            onClick={skipToEnd}
            className="consult-skip"
            style={{
              font: "inherit",
              fontFamily: "var(--font-bn)",
              fontSize: "0.75rem",
              fontWeight: 800,
              padding: "8px 13px",
              borderRadius: "9px",
              border: "1px solid rgba(255,255,255,.55)",
              background: "rgba(255,255,255,.12)",
              color: "#fff",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            ফলাফল সরাসরি দেখুন ▸
          </button>
        ) : null}
        <div style={{ flex: 1, minWidth: 210 }}>
          <h3>
            {playing ? "জেলা লিগ্যাল এইড অফিস থেকে কল — সংলাপ চলছে" : done ? "কথোপকথন সম্পন্ন" : "কল শুরু হয়নি"}
          </h3>
          <p>
            ডিএলএও <b style={{ color: "#fff" }}>{dlaoName}</b> · আবেদনকারী <b style={{ color: "#fff" }}>{applicantName}</b> · কথোপকথনটি নথিভুক্ত হচ্ছে
          </p>
        </div>
      </div>

      <div className="consult-phase" aria-label="পর্যায়">
        {script.phases.map((p) => (
          <span key={p} className={`consult-chip${p === activePhase ? " on" : ""}`}>
            {consultationPhaseLabel(p)}
          </span>
        ))}
      </div>

      <div className="consult-body" ref={scrollRef} aria-live="polite">
        {visible.map((turn) => (
          <div key={turn.seq} className={`consult-row ${turn.speaker}`}>
            <span className={`consult-av ${turn.speaker}`}>
              {turn.speaker === "dlao" ? "ডিএ" : turn.speaker === "applicant" ? "আ" : "সি"}
            </span>
            <div>
              <p className="consult-who">{SPEAKER_LABEL[turn.speaker]}</p>
              <div className="consult-bub">
                {turn.textBn}
                {turn.event ? (
                  <span className={`consult-badge${turn.event === "evidence_verified" ? " highlight" : ""}`}>
                    {EVENT_BADGE[turn.event] ?? turn.event}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ))}

        {typing ? (
          <div className={`consult-row ${typing.speaker}`}>
            <span className={`consult-av ${typing.speaker}`}>
              {typing.speaker === "dlao" ? "ডিএ" : typing.speaker === "applicant" ? "আ" : "সি"}
            </span>
            <div>
              <p className="consult-who">{SPEAKER_LABEL[typing.speaker]} লিখছে…</p>
              <div className="consult-bub">
                <span className="consult-typing"><i /><i /><i /></span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {done ? (
        <div className="consult-verdict">
          <p className="consult-act">প্রযোজ্য আইন: {script.actSentenceBn}</p>
          <p className={`consult-assure${script.decision.eligible ? "" : " no"}`}>{script.decision.assuranceBn}</p>
          <div className="consult-meta">
            <div>
              সহায়তার ভিত্তি: <b>{script.decision.basisBn || "—"}</b>
              {script.decision.grounds.length > 1
                ? ` (আরও ${script.decision.grounds.length - 1}টি শর্ত প্রযোজ্য)`
                : ""}
            </div>
            <div>
              কেস ও নিয়োগ: <b>{script.outcomeSummaryBn}</b>
            </div>
            {panelLawyerName ? (
              <div>
                নিযুক্ত আইনজীবী: <b>{panelLawyerName}</b> — আবেদনকারী ও ডিএলএও উভয়ের সাথে কেস-সংযুক্ত
              </div>
            ) : null}
          </div>
          <div className="consult-actions">
            <button type="button" className="consult-btn" onClick={restart}>
              সংলাপটি আবার দেখুন
            </button>
            {onFinished ? (
              <button type="button" className="consult-btn" onClick={() => onFinishedRef.current?.()}>
                কেস ও ড্যাশবোর্ডে দেখুন
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
