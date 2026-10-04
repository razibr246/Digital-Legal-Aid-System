"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MEDIATION_WEEKDAYS,
  addDays,
  formatBn,
  isWorkday,
  sameDay,
  toDateKey,
  weekStart,
} from "@/lib/case/mediation";
import { toBanglaDigits } from "@/lib/case/consultation-script";

/**
 * A date field for the working week.
 *
 * Built by hand rather than pulled from a library: this project ships no date library,
 * and the one thing a native `<input type="date">` cannot do is refuse Friday and
 * Saturday. That refusal is the whole reason this component exists — an officer who can
 * pick Saturday will pick Saturday.
 *
 * Keyboard support is not optional here either. A date picker reachable only by mouse
 * is unusable by the blind applicant in scenario A2, and this portal is built for them.
 */

const WEEK_MS = 6 * 86_400_000;

export function WorkingDayPicker({
  value,
  onChange,
  minDate,
  id = "mediation-date",
}: {
  value: string;
  onChange: (dateKey: string) => void;
  minDate?: Date;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => {
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    return Number.isNaN(base.getTime()) ? new Date() : base;
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => new Date(), []);
  const floor = useMemo(() => {
    const d = minDate ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, [minDate]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Move focus into the grid so arrow keys and Escape work without a mouse.
  useEffect(() => {
    if (open) gridRef.current?.focus();
  }, [open]);

  const selected = value ? new Date(`${value}T00:00:00`) : null;

  // Sunday-first month grid, padded so each row starts on a Sunday.
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = weekStart(first);
    const out: Array<{ date: Date; inMonth: boolean }> = [];
    for (let i = 0; i < 35; i += 1) {
      const date = addDays(start, i);
      out.push({ date, inMonth: date.getMonth() === month.getMonth() });
      if (i >= 27 && date.getMonth() !== month.getMonth() && date > first) break;
    }
    return out;
  }, [month]);

  function moveFocus(delta: number) {
    const active = document.activeElement as HTMLElement | null;
    const index = active?.dataset?.cellIndex ? Number(active.dataset.cellIndex) : null;
    if (index === null) return;
    const next = cells[Math.min(cells.length - 1, Math.max(0, index + delta))];
    if (!next) return;
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-cell-index="${cells.indexOf(next)}"]`);
    el?.focus();
  }

  function pick(date: Date) {
    if (!isWorkday(date)) return;
    if (date.getTime() < floor.getTime()) return;
    onChange(toDateKey(date));
    setOpen(false);
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <label htmlFor={id} style={{ display: "block", fontFamily: "var(--font-bn)", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 6, color: "var(--portal-text, #0f172a)" }}>
        মধ্যস্থতার তারিখ <span aria-hidden="true" style={{ color: "#dc2626" }}>*</span>
      </label>
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          width: "100%",
          minHeight: "var(--touch-min, 2.75rem)",
          padding: "0 12px",
          textAlign: "left",
          border: `1.5px solid ${open ? "var(--portal-accent, #15803d)" : "var(--portal-border-strong, #94a3b8)"}`,
          borderRadius: 8,
          background: "#fff",
          fontFamily: "var(--font-bn)",
          fontSize: "0.9375rem",
          color: "var(--portal-text, #0f172a)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>{selected && !Number.isNaN(selected.getTime()) ? formatBn(selected) : "তারিখ বেছে নিন"}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="তারিখ বেছে নিন"
          style={{
            position: "absolute",
            zIndex: 60,
            top: "calc(100% + 6px)",
            left: 0,
            width: "min(320px, 90vw)",
            background: "#fff",
            border: "1px solid var(--portal-border, #e2e8f0)",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(15,23,42,0.18)",
            padding: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="আগের মাস" style={{ minWidth: 36, minHeight: 36, border: "1.5px solid #cbd5e1", background: "#fff", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>‹</button>
            <strong style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem" }}>
              {month.toLocaleDateString("bn-BD", { month: "long", year: "numeric" })}
            </strong>
            <button type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="পরের মাস" style={{ minWidth: 36, minHeight: 36, border: "1.5px solid #cbd5e1", background: "#fff", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>›</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {MEDIATION_WEEKDAYS.map((d) => (
              <div key={d.code} style={{ textAlign: "center", fontFamily: "var(--font-bn)", fontSize: "0.6875rem", fontWeight: 700, color: "#64748b", padding: 4 }} title={d.bn}>
                {d.short.slice(0, 1)}
              </div>
            ))}
            <div style={{ textAlign: "center", fontSize: "0.6875rem", color: "#cbd5e1", padding: 4 }}>শ</div>
          </div>

          <div
            ref={gridRef}
            tabIndex={0}
            role="grid"
            aria-label="ক্যালেন্ডার"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") { e.preventDefault(); moveFocus(1); }
              else if (e.key === "ArrowLeft") { e.preventDefault(); moveFocus(-1); }
              else if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(7); }
              else if (e.key === "ArrowUp") { e.preventDefault(); moveFocus(-7); }
            }}
            style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, outline: "none" }}
          >
            {cells.map((cell, index) => {
              const working = isWorkday(cell.date);
              const past = cell.date.getTime() < floor.getTime();
              const disabled = !working || past;
              const isSelected = selected ? sameDay(cell.date, selected) : false;
              const isToday = sameDay(cell.date, today);
              return (
                <button
                  key={toDateKey(cell.date)}
                  type="button"
                  data-cell-index={index}
                  disabled={disabled}
                  aria-label={formatBn(cell.date)}
                  aria-selected={isSelected}
                  onClick={() => pick(cell.date)}
                  style={{
                    aspectRatio: "1 / 1",
                    minHeight: 34,
                    border: isSelected ? "2px solid var(--portal-accent, #15803d)" : isToday ? "1.5px solid #93c5fd" : "1px solid transparent",
                    borderRadius: 8,
                    background: isSelected ? "#dcfce7" : disabled ? "transparent" : cell.inMonth ? "#f8fafc" : "transparent",
                    color: disabled ? "#cbd5e1" : "#0f172a",
                    fontFamily: "var(--font-bn)",
                    fontSize: "0.75rem",
                    fontWeight: isSelected || isToday ? 700 : 500,
                    cursor: disabled ? "not-allowed" : "pointer",
                    textDecoration: !working && cell.inMonth ? "line-through" : "none",
                  }}
                >
                  {toBanglaDigits(String(cell.date.getDate()))}
                </button>
              );
            })}
          </div>

          <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.6875rem", color: "#64748b", margin: "8px 0 0" }}>
            শুধু রবি থেকে বৃহস্পতি — শুক্র ও শনি বাদ।
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default WorkingDayPicker;
