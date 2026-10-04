"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SIMULATIONS, getSimulation } from "@/lib/demo/simulations";
import { getPersona } from "@/lib/demo/personas";
import { SimulationDialog } from "@/components/demo/simulation-dialog";

/**
 * Simulation launcher.
 *
 * Each scenario now opens in a large dialog rather than swapping the page, so the demo
 * keeps its context: the picker stays one click away, the dialog can be dismissed with
 * Escape or a click outside, and the page behind does not scroll. On a projector that
 * matters — a judge can see the launcher, the run, and the next scenario without a page
 * load in between.
 *
 * The dialog takes ~95% of the viewport because the proof panel and the transcript have to
 * be readable side by side; at the old 1180px the two columns were cramped enough that the
 * Bangla wrapped badly.
 */
export default function SimulationModePage() {
  const [openId, setOpenId] = useState<string | null>(null);

  // The login panel's merged A1+A2 entry links here with ?scenario=moyuri-ripon, so the
  // dialog opens straight onto the right script. Read in an effect rather than with
  // useSearchParams, which would force this page behind a Suspense boundary for a value
  // that is only known in the browser.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("scenario");
    if (wanted && getSimulation(wanted)) setOpenId(wanted);
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "var(--portal-bg, #f8fafc)", padding: "var(--space-2xl, 32px) var(--space-xl, 24px)" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-xl, 24px)" }}>
        <header>
          <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--portal-accent-text, #15803d)", margin: "0 0 6px" }}>
            Simulation Mode
          </p>
          <h1 style={{ fontFamily: "var(--font-bn)", fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-text, #0f172a)", margin: "0 0 8px" }}>
            সিমুলেশন — ভয়েস থেকে সিদ্ধান্ত পর্যন্ত
          </h1>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", color: "var(--portal-text-secondary, #475569)", margin: "0 0 6px", maxWidth: "78ch", lineHeight: 1.7 }}>
            এখানে কোনো কিছু হাতে লেখা নেই। প্রতিটি উত্তর-এর শ্রেণি <strong>আসল শ্রেণিবিভাগ ইঞ্জিন</strong> ঠিক করে, ঠিক যেভাবে ১৬৬৯৯ এ ফোনে করে।
            এজন্যই একটি মিল থাকা কথা বদলে দিলে শ্রেণিও বদলে যাবে — এটিই প্রমাণ।
          </p>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text-muted, #94a3b8)", margin: 0 }}>
            যেকোনো সিমুলেশনে ক্লিক করলে সেটি বড় পপ-আপে খুলবে। উপরে ✕ বা Esc চাপলে ফিরে আসবেন।
          </p>
        </header>

        {/* min(100%, 300px) rather than a bare 280px: a bare minimum is wider than a
            360px phone once padding is counted, so the grid overflowed sideways. */}
        <div style={{ display: "grid", gap: "var(--space-md, 16px)", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
          {SIMULATIONS.map((s) => {
            const p = getPersona(s.personaId);
            return (
              <button
                key={s.id}
                type="button"
                data-scenario={s.id}
                onClick={() => setOpenId(s.id)}
                style={{
                  textAlign: "left",
                  background: "#fff",
                  border: "1.5px solid var(--portal-border, #e2e8f0)",
                  borderLeft: "5px solid var(--portal-accent, #15803d)",
                  borderRadius: 12,
                  padding: "var(--space-lg, 18px)",
                  minHeight: "var(--touch-min, 2.75rem)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  transition: "transform var(--transition-fast), box-shadow var(--transition-fast)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 22px rgba(15,23,42,0.12)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--portal-accent-text, #15803d)" }}>
                  {p?.code} · {p?.districtBn} · {s.turns.length} ধাপ
                </div>
                <div style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", fontWeight: 700, color: "var(--portal-text, #0f172a)", lineHeight: 1.5 }}>
                  {s.title}
                </div>
                <div style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-secondary, #475569)", lineHeight: 1.6 }}>
                  {s.premise}
                </div>
                <div style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", fontWeight: 700, color: "var(--portal-accent-text, #15803d)", marginTop: 4 }}>
                  সিমুলেশন দেখুন →
                </div>
              </button>
            );
          })}
        </div>

        <footer style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/demo" style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", fontWeight: 600, color: "var(--portal-accent-text, #15803d)", textDecoration: "none" }}>
            ← পাঁচটি সিনারিও
          </Link>
          <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-muted, #94a3b8)" }}>
            পূর্বালচিত ভয়েস ব্যবহারের কারণে সিমুলেশন চালানোর জন্য কোনো STT বা TTS খরচ হয় না।
          </span>
        </footer>
      </div>

      {openId ? <SimulationDialog scenarioId={openId} onClose={() => setOpenId(null)} /> : null}
    </main>
  );
}
