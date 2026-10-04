"use client";

/**
 * The applicant's side of the callback, as a focused modal.
 *
 * It is a dialog rather than a panel in the page because it is the thing that
 * happens *next*: an applicant who lands on the dashboard must not be able to scroll
 * past it into a docket that does not exist yet. Dismissal is blocked while the
 * conversation plays, and only becomes available once it has finished — otherwise a
 * judge clicking through quickly loses the one moment the whole flow exists for.
 *
 * Navigation is deliberately NOT triggered on completion. Calling `router.refresh()`
 * there remounted this subtree, which handed the player a new script and restarted
 * the animation from turn 1, which read as a message loop. The player now finishes
 * quietly and the buttons appear for whoever wants to act.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ConsultationPlayer from "@/components/consultation-player";
import type { ConsultationScript } from "@/lib/case/consultation-script";

interface ConsultationResponse {
  ok: boolean;
  error?: string;
  consultationId: string;
  caseId: string | null;
  completed: boolean;
  lastSeq: number;
  panelAssignmentId: string | null;
  dlao: { id: string | null; name: string };
  panelLawyer: { id: string; name: string | null } | null;
  script: ConsultationScript;
}

export default function ConsultationPanel({
  applicantName,
  onConsultationComplete,
}: {
  applicantName: string;
  /** Fired once the case actually exists, so other panels can stop showing pre-consultation state. */
  onConsultationComplete?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "starting" | "ready" | "error">("idle");
  const [data, setData] = useState<ConsultationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [callAccepted, setCallAccepted] = useState(false);
  // Server-recorded playback position, so a reload resumes instead of restarting.
  const [lastSeq, setLastSeq] = useState(0);
  // The completion ping must carry the newest turn, not whatever the render that
  // closed the animation happened to have captured.
  const lastSeqRef = useRef(0);
  // The explanation is what an applicant reads *before* the call. Once the call is
  // running it collapses to a one-line summary, because at 900px the full block
  // pushed the conversation and the verdict below the fold.
  const [explainerOpen, setExplainerOpen] = useState(true);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const launchedRef = useRef(false);

  const onConsultationCompleteRef = useRef(onConsultationComplete);
  useEffect(() => {
    onConsultationCompleteRef.current = onConsultationComplete;
  }, [onConsultationComplete]);

  const start = useCallback(async () => {
    setState("starting");
    setError(null);
    try {
      const list = await fetch("/api/portal/applications").then((r) => r.json());
      const applicationId: string | undefined = list?.applications?.[0]?.id;
      if (!applicationId) {
        setState("idle");
        return;
      }
      const res = await fetch("/api/portal/consultations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId }),
      });
      const body: ConsultationResponse = await res.json();
      if (!body.ok) {
        setError(body.error ?? "সংলাপ শুরু করা যায়নি");
        setState("error");
        return;
      }
      setData(body);
      lastSeqRef.current = body.lastSeq ?? 0;
      setLastSeq(body.lastSeq ?? 0);
      setState("ready");
      // The single most important line here. Auto-open only when the conversation has
      // never reached the end: a reload mid-playback resumes where it stopped rather
      // than restarting, and one that was finished or skipped stays closed behind the
      // quiet "see it again" affordance. Keying this on "has begun" instead of "has
      // finished" made an interrupted playback impossible to resume.
      setOpen(!body.completed);
      setFinished(Boolean(body.completed));
      // The case and the lawyer assignment exist from this moment, not when the
      // animation ends. Anything else on the page that reads the case was fetched
      // before this point and is holding a pre-consultation snapshot.
      onConsultationCompleteRef.current?.();
    } catch {
      setError("সংলাপ শুরু করা যায়নি");
      setState("error");
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    // Launch once per mount. The consultation endpoint is idempotent, so a repeat
    // replays the same transcript rather than creating a second one.
    if (launchedRef.current) return;
    launchedRef.current = true;
    void start();
  }, [start]);

  // Lock the page behind the dialog so the dashboard cannot scroll under it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape closes only after the conversation has finished, for the same reason the
  // close button is withheld.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && finished) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Progress is best-effort. A failed ping must never interrupt playback, and the
  // worst case of losing one is that a reload resumes a turn or two early.
  const persistProgress = useCallback(
    (seq: number, completed = false) => {
      lastSeqRef.current = Math.max(lastSeqRef.current, seq);
      setLastSeq(seq);
      if (!data?.consultationId) return;
      fetch("/api/portal/consultations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consultationId: data.consultationId, lastSeq: seq, completed }),
      }).catch(() => undefined);
    },
    [data?.consultationId],
  );

  const close = useCallback(() => {
    if (!finished) return;
    setOpen(false);
    // Also flip the flag in state, not just sessionStorage: it is seeded from
    // sessionStorage on mount, so dismissing without it left the panel returning null
    // and no way back in.
  }, [finished]);

  // Replaying is a deliberate act now, so it always starts from the beginning and
  // does not leave the applicant stuck half-way again.
  const reopen = useCallback(() => {
    lastSeqRef.current = 0;
    setLastSeq(0);
    setOpen(true);
    setFinished(false);
    setCallAccepted(false);
  }, []);

  if (state === "idle") return null;

  // Closed but already loaded: offer it back rather than silently swallowing it. This
  // is the path a reload now takes, so it has to render the affordance.
  if (!open) {
    if (!data) return null;
    return (
      <div style={{ marginBottom: "var(--space-2xl)" }}>
        <button
          type="button"
          onClick={reopen}
          style={{
            font: "inherit",
            fontFamily: "var(--font-bn)",
            fontSize: "0.85rem",
            fontWeight: 700,
            padding: "11px 16px",
            borderRadius: "11px",
            border: "1px solid #0f766e",
            background: "#f0fdfa",
            color: "#0f766e",
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
          }}
        >
          <b>আপনার ডিএলএও-এর সাথে কথোপকথন</b> — আবার দেখুন
          {data.script.decision.eligible ? " (প্যানেল আইনজীবী নিয়োগ হয়েছে)" : ""}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(2,6,23,.74)",
        backdropFilter: "blur(3px)",
        display: "grid",
        placeItems: "center",
        padding: "18px",
        overflowY: "auto",
      }}
      onMouseDown={(event) => {
        // Clicking the backdrop dismisses only once it is safe to do so.
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consult-title"
        style={{
          width: "100%",
          maxWidth: 700,
          maxHeight: "92vh",
          overflowY: "auto",
          borderRadius: "18px",
          background: "#fff",
          boxShadow: "0 24px 60px rgba(2,6,23,.45)",
          outline: "none",
        }}
      >
        {/* Hide header when showing incoming call UI */}
        {(state !== "ready" || callAccepted) && (
        <div
          style={{
            background: "linear-gradient(135deg,#064e3b,#0f766e)",
            color: "#fff",
            borderRadius: "18px 18px 0 0",
            padding: "20px 22px 16px",
          }}
        >
          <h2
            id="consult-title"
            style={{ fontFamily: "var(--font-bn)", fontSize: "1.1rem", fontWeight: 800, margin: 0 }}
          >
            আপনার আবেদনের পরবর্তী ধাপ: জেলা লিগ্যাল এইড অফিসের কল
          </h2>
          {!explainerOpen ? (
            <button
              type="button"
              onClick={() => setExplainerOpen(true)}
              style={{
                font: "inherit",
                fontFamily: "var(--font-bn)",
                fontSize: "0.78rem",
                fontWeight: 700,
                marginTop: "8px",
                padding: "5px 11px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,.5)",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              এই ধাপটি কী করে, বিস্তারিত ▸
            </button>
          ) : null}
          <div hidden={!explainerOpen}>
          <p
            style={{
              fontFamily: "var(--font-bn)",
              fontSize: "0.85rem",
              lineHeight: 1.7,
              margin: "8px 0 0",
              opacity: 0.95,
            }}
          >
            আপনার আবেদন পাওয়ার পর জেলা লিগ্যাল এইড অফিসের একজন লিগ্যাল এইড অফিসার (ডিএলএও) আপনাকে ফোন করে
            সরাসরি কথা বলবেন। কথোপকথনটি একসাথে তিনটি কাজ করবে:
          </p>
          <ol
            style={{
              fontFamily: "var(--font-bn)",
              fontSize: "0.82rem",
              lineHeight: 1.75,
              margin: "10px 0 0",
              paddingLeft: "20px",
            }}
          >
            <li>
              <b>পরিচয় যাচাই</b> — আপনার নাম ও মোবাইল নম্বরের শেষ কয়েকটি সংখ্যা যাচাই করা হবে, যাতে ভুল ব্যক্তির সাথে কথা না হয়।
            </li>
            <li>
              <b>আর্থিক অবস্থা যাচাই</b> — বিনা মূল্যে আইনি সহায়তার শর্ত যাচাই করতে কয়েকটি প্রশ্ন করা হবে। আপনার উত্তরই
              নিবন্ধিত হবে, এবং এটি আপনার ক্ষতির জন্য ব্যবহৃত হবে না।
            </li>
            <li>
              <b>আনুষ্ঠানিক আলোচনা ও সিদ্ধান্ত</b> — কোন আইন আপনার সমস্যার ক্ষেত্রে প্রযোজ্য, এবং আপনি বিনা মূল্যে আইনজীবী পাবেন
              কি না — তা ডিএলএও আপনাকে সরাসরি জানাবেন।
            </li>
          </ol>
          <p
            style={{
              fontFamily: "var(--font-bn)",
              fontSize: "0.78rem",
              margin: "12px 0 0",
              opacity: 0.9,
            }}
          >
            নিচে এই কথোপকথনটি দেখানো হচ্ছে। এটি আপনার আবেদনের বাস্তব তথ্য থেকে তৈরি, এবং সম্পূর্ণটি আপনার কাছে
            নথিভুক্ত থাকবে।
          </p>
          </div>
        </div>
        )}

        {state === "starting" ? (
          <div style={{ padding: "26px" }}>
            <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "#475569", margin: 0 }}>
              ডিএলএও-এর কল প্রস্তুত হচ্ছে…
            </p>
          </div>
        ) : null}

        {state === "error" ? (
          <div style={{ padding: "22px" }}>
            <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "#b91c1c", margin: "0 0 12px" }}>
              {error}
            </p>
            <button
              type="button"
              onClick={() => void start()}
              style={{
                font: "inherit",
                fontFamily: "var(--font-bn)",
                fontSize: "0.8rem",
                fontWeight: 700,
                padding: "9px 15px",
                borderRadius: "9px",
                border: "1px solid #cbd5e1",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              আবার চেষ্টা করুন
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                font: "inherit",
                fontFamily: "var(--font-bn)",
                fontSize: "0.8rem",
                fontWeight: 700,
                padding: "9px 15px",
                marginLeft: "8px",
                borderRadius: "9px",
                border: "1px solid transparent",
                background: "transparent",
                color: "#475569",
                cursor: "pointer",
              }}
            >
              পরে দেখব
            </button>
          </div>
        ) : null}

        {state === "ready" && data && !callAccepted ? (
          <div className="incoming-call">
            <style>{`
              .incoming-call {
                padding: 40px 30px;
                text-align: center;
                background: linear-gradient(180deg, #f0fdf4 0%, #fff 100%);
              }
              .call-avatar {
                width: 90px;
                height: 90px;
                border-radius: 50%;
                background: linear-gradient(135deg, #064e3b, #0f766e);
                margin: 0 auto 20px;
                display: grid;
                place-items: center;
                font-size: 32px;
                color: #fff;
                font-weight: 800;
                animation: call-pulse 1.5s ease-in-out infinite;
                box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
              }
              @keyframes call-pulse {
                0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                70% { box-shadow: 0 0 0 20px rgba(16, 185, 129, 0); }
                100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
              }
              .call-ring {
                display: flex;
                justify-content: center;
                gap: 6px;
                margin-bottom: 20px;
              }
              .call-ring-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #10b981;
                animation: call-ring-bounce 1s ease-in-out infinite;
              }
              .call-ring-dot:nth-child(2) { animation-delay: 0.15s; }
              .call-ring-dot:nth-child(3) { animation-delay: 0.3s; }
              .call-ring-dot:nth-child(4) { animation-delay: 0.45s; }
              @keyframes call-ring-bounce {
                0%, 100% { transform: scale(1); opacity: 0.5; }
                50% { transform: scale(1.5); opacity: 1; }
              }
              .call-label {
                font-family: var(--font-bn);
                font-size: 0.85rem;
                color: #10b981;
                font-weight: 700;
                margin-bottom: 8px;
                letter-spacing: 1px;
              }
              .call-name {
                font-family: var(--font-bn);
                font-size: 1.4rem;
                font-weight: 800;
                color: #064e3b;
                margin: 0 0 6px;
              }
              .call-role {
                font-family: var(--font-bn);
                font-size: 0.9rem;
                color: #475569;
                margin: 0 0 8px;
              }
              .call-district {
                font-family: var(--font-bn);
                font-size: 0.8rem;
                color: #64748b;
                margin: 0 0 30px;
              }
              .call-actions {
                display: flex;
                justify-content: center;
                gap: 20px;
              }
              .call-btn {
                width: 70px;
                height: 70px;
                border-radius: 50%;
                border: none;
                cursor: pointer;
                display: grid;
                place-items: center;
                font-size: 28px;
                transition: transform 0.15s, box-shadow 0.15s;
              }
              .call-btn:hover {
                transform: scale(1.1);
              }
              .call-btn.accept {
                background: linear-gradient(135deg, #10b981, #059669);
                color: #fff;
                box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
              }
              .call-btn.accept:hover {
                box-shadow: 0 6px 30px rgba(16, 185, 129, 0.6);
              }
              .call-btn.decline {
                background: linear-gradient(135deg, #ef4444, #dc2626);
                color: #fff;
                box-shadow: 0 4px 20px rgba(239, 68, 68, 0.3);
              }
              .call-btn-label {
                font-family: var(--font-bn);
                font-size: 0.72rem;
                font-weight: 700;
                margin-top: 8px;
                color: #475569;
              }
            `}</style>
            <div className="call-ring">
              <span className="call-ring-dot" />
              <span className="call-ring-dot" />
              <span className="call-ring-dot" />
              <span className="call-ring-dot" />
            </div>
            <div className="call-avatar">📞</div>
            <p className="call-label">ইনকামিং কল</p>
            <h3 className="call-name">{data.dlao.name}</h3>
            <p className="call-role">জেলা লিগ্যাল এইড অফিসার (ডিএলএও)</p>
            <p className="call-district">জেলা লিগ্যাল এইড অফিস</p>
            <div className="call-actions">
              <div style={{ textAlign: "center" }}>
                <button
                  type="button"
                  className="call-btn decline"
                  onClick={() => setOpen(false)}
                  title="কল প্রত্যাখ্যান করুন"
                >
                  ✕
                </button>
                <p className="call-btn-label">প্রত্যাখ্যান</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <button
                  type="button"
                  className="call-btn accept"
                  onClick={() => setCallAccepted(true)}
                  title="কল গ্রহণ করুন"
                >
                  ✓
                </button>
                <p className="call-btn-label">গ্রহণ করুন</p>
              </div>
            </div>
          </div>
        ) : null}

        {state === "ready" && data && callAccepted ? (
          <>
            <ConsultationPlayer
              script={data.script}
              startFromSeq={lastSeq}
              dlaoName={data.dlao.name}
              panelLawyerName={data.panelLawyer?.name ?? null}
              applicantName={applicantName}
              onFirstTurn={() => setExplainerOpen(false)}
              onProgress={(seq) => persistProgress(seq, false)}
              onFinished={() => {
                // Explicit only. Doing this automatically on completion remounted this
                // subtree and restarted the animation.
                persistProgress(lastSeqRef.current, true);
                setFinished(true);
              }}
            />
            <div
              style={{
                display: "flex",
                gap: "9px",
                flexWrap: "wrap",
                alignItems: "center",
                padding: "14px 18px",
                borderTop: "1px solid #e2e8f0",
              }}
            >
              <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.76rem", color: "#475569" }}>
                কেস: <b>{data.caseId ?? "তৈরি হচ্ছে"}</b>
                {data.panelAssignmentId ? (
                  <>
                    {" "}· নিয়োগপত্র: <b>{data.panelAssignmentId.slice(0, 18)}…</b>
                  </>
                ) : null}
              </span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                onClick={close}
                disabled={!finished}
                title={finished ? undefined : "কথোপকথন শেষ হলে বন্ধ করা যাবে"}
                style={{
                  font: "inherit",
                  fontFamily: "var(--font-bn)",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  padding: "9px 16px",
                  borderRadius: "9px",
                  border: "1px solid #0f766e",
                  background: finished ? "#0f766e" : "#e2e8f0",
                  color: finished ? "#fff" : "#94a3b8",
                  cursor: finished ? "pointer" : "not-allowed",
                }}
              >
                {finished ? "ড্যাশবোর্ডে ফিরে যান" : "কথোপকথন চলছে…"}
              </button>
              <button
                type="button"
                onClick={() => {
                  close();
                  router.push("/citizen");
                }}
                style={{
                  font: "inherit",
                  fontFamily: "var(--font-bn)",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  padding: "9px 16px",
                  borderRadius: "9px",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  color: "#334155",
                  cursor: "pointer",
                }}
              >
                আমার কেস দেখুন
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
