"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  bdDayOfMonth,
  formatBn,
  fromDateKey,
  isWorkday,
  toDateKey,
  weekdayBn,
  weekdayBnShort,
  workdaysOfWeek,
} from "@/lib/case/mediation";

/**
 * Mediation booking, shown as a booking.
 *
 * The brief asks for the date to be *visible*, and a date rendered as a string in a table
 * is easy to nod along to without actually reading. So the chosen day is shown three
 * ways: a rolling two-week strip of working days, a step list of what the booking will do,
 * and the date in full Bangla with its weekday spelled out.
 *
 * Friday and Saturday are simply absent from the strip. Not disabled — ABSENT. An officer
 * who can see a greyed-out Saturday learns that Saturday exists and might try to force it;
 * one who cannot see it at all cannot misread the calendar. The reasoning is in
 * `lib/case/mediation.ts`, and the server enforces it independently.
 */

const SLOTS = ["10:00", "11:00", "11:30", "14:00", "15:30"] as const;

export interface MediationBookingConfig {
  caseId: string;
  docketId: string;
  venue: string;
  mediatorName: string;
}

export function MediationBookingPanel({
  config,
  busy,
  onBook,
}: {
  config: MediationBookingConfig;
  busy: boolean;
  onBook: (date: string, time: string) => void;
}) {
  const [date, setDate] = useState<string>(() => {
    const week = workdaysOfWeek(new Date());
    for (let i = 1; i <= 14; i += 1) {
      const d = addDays(new Date(), i);
      if (isWorkday(d) && d >= week[0]) return toDateKey(d);
    }
    return toDateKey(addDays(new Date(), 1));
  });
  const [time, setTime] = useState<string>("11:00");

  // Two rolling weeks of working days, starting tomorrow.
  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 1; i <= 21 && out.length < 10; i += 1) {
      const d = addDays(new Date(), i);
      if (isWorkday(d)) out.push(d);
    }
    return out;
  }, []);

  const chosen = fromDateKey(date);
  // `weekdayBn` already resolves the BANGLADESH weekday; re-deriving it from getDay()
  // here is the bug this codebase already paid for once.
  const label = weekdayBn(chosen);

  const steps = [
    { bn: "কার্যদিবস যাচাই", ok: true, detail: "রবি থেকে বৃহস্পতি" },
    { bn: "নিরাপদ সময়ের সঙ্গে মিল", ok: true, detail: "যোগাযোগযোগ্য সময়" },
    { bn: "মধ্যস্থতাকারী নিশ্চিত", ok: Boolean(config.mediatorName), detail: config.mediatorName || "নির্বাচন করা হয়নি" },
    { bn: "স্থান বরাদ্দ", ok: Boolean(config.venue), detail: config.venue },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* the date, chosen as a working day */}
      <div>
        <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--portal-text-secondary, #475569)", marginBottom: 7 }}>
          তারিখ — কার্যদিবস
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {days.map((d) => {
            const key = toDateKey(d);
            const on = key === date;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDate(key)}
                aria-pressed={on}
                style={{
                  flex: "0 0 auto",
                  minWidth: 64,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: `1.5px solid ${on ? "var(--portal-accent, #15803d)" : "var(--portal-border, #e2e8f0)"}`,
                  background: on ? "var(--portal-accent-subtle, #f0fdf4)" : "#fff",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                <div style={{ fontFamily: "var(--font-bn)", fontSize: "0.625rem", fontWeight: 600, color: "var(--portal-text-secondary, #64748b)" }}>
                  {weekdayBnShort(d)}
                </div>
                <div style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", fontWeight: 700, color: on ? "var(--portal-accent-text, #15803d)" : "var(--portal-text, #0f172a)" }}>
                  {bdDayOfMonth(d)}
                </div>
              </button>
            );
          })}
        </div>
        <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-secondary, #64748b)", margin: "6px 0 0" }}>
          শুক্র ও শনি দেখানো হয়নি — সপ্তাহে পাঁচ কার্যদিবস।
        </p>
      </div>

      {/* the time */}
      <div>
        <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--portal-text-secondary, #475569)", marginBottom: 7 }}>
          সময়
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => setTime(slot)}
              aria-pressed={slot === time}
              style={{
                padding: "8px 14px",
                minHeight: "var(--touch-min, 2.75rem)",
                borderRadius: 8,
                border: `1.5px solid ${slot === time ? "var(--portal-accent, #15803d)" : "var(--portal-border, #e2e8f0)"}`,
                background: slot === time ? "var(--portal-accent-subtle, #f0fdf4)" : "#fff",
                fontFamily: "var(--font-bn)",
                fontSize: "0.875rem",
                fontWeight: 700,
                color: slot === time ? "var(--portal-accent-text, #15803d)" : "var(--portal-text, #0f172a)",
                cursor: "pointer",
              }}
            >
              {toBanglaTime(slot)}
            </button>
          ))}
        </div>
      </div>

      {/* what the booking will do */}
      <div>
        <div style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--portal-text-secondary, #475569)", marginBottom: 7 }}>
          নিবন্ধন যা যাচাই করবে
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          {steps.map((step) => (
            <li key={step.bn} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-bn)", fontSize: "0.8125rem" }}>
              <span
                aria-hidden="true"
                style={{
                  width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: step.ok ? "#dff3ea" : "#fef2f2",
                  color: step.ok ? "#047857" : "#b91c1c",
                  fontSize: "0.6875rem", fontWeight: 700,
                }}
              >
                {step.ok ? "✓" : "✕"}
              </span>
              <span style={{ fontWeight: 600, color: "var(--portal-text, #0f172a)" }}>{step.bn}</span>
              <span style={{ color: "var(--portal-text-secondary, #64748b)" }}>— {step.detail}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* the booking itself */}
      <div
        style={{
          border: "1.5px solid var(--portal-accent, #15803d)",
          borderRadius: 12,
          background: "var(--portal-accent-subtle, #f0fdf4)",
          padding: "12px 14px",
        }}
      >
        <div style={{ fontFamily: "var(--font-bn)", fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--portal-accent-text, #15803d)", marginBottom: 5 }}>
          নির্ধারিত তারিখ
        </div>
        <div style={{ fontFamily: "var(--font-bn)", fontSize: "1.0625rem", fontWeight: 700, color: "var(--portal-text, #0f172a)" }}>
          {label && `${label}, `}
          {formatBn(chosen)}
        </div>
        <div style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text-secondary, #475569)", marginTop: 4 }}>
          {toBanglaTime(time)} · {config.venue} · {config.mediatorName} · {config.docketId}
        </div>
        <button
          type="button"
          onClick={() => onBook(date, time)}
          disabled={busy}
          style={{
            marginTop: 12,
            background: "var(--portal-accent, #15803d)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "0 20px",
            minHeight: "var(--touch-min, 2.75rem)",
            fontFamily: "var(--font-bn)",
            fontWeight: 700,
            fontSize: "0.9375rem",
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "নিবন্ধন হচ্ছে…" : "এই তারিখে নিবন্ধন করুন"}
        </button>
      </div>
    </div>
  );
}

function toBanglaTime(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  const bangla = (n: string) => n.replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);
  const hour = Number(h);
  const suffix = hour >= 12 ? "পূর্বাহ্ণে" : "বিকালে";
  const twelve = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${bangla(String(twelve))}টা ${bangla(m)} মিনিট`;
}

export default MediationBookingPanel;
