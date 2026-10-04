"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MEDIATION_WEEKDAYS,
  addDays,
  bdDayOfMonth,
  bdMonthOfYear,
  bdTimeBn,
  formatBn,
  isWorkday,
  sameDay,
  toDateKey,
  workdaysOfWeek,
  type MediationOutcome,
} from "@/lib/case/mediation";

/**
 * Cause-list calendar — the prototype's `calendar` route.
 *
 * A weekly Sun–Thu grid, because that is the working week: Friday and Saturday are the
 * weekend, and a booking form that happily offered a Saturday date would send an
 * applicant across the district for a hearing that cannot happen.
 *
 * No date library. There is no `date-fns`/`dayjs` in this project and adding one for
 * five columns of arithmetic would be a poor trade, so the week maths lives in
 * `lib/case/mediation.ts` where it can be unit-tested instead.
 */

export interface CalendarMediation {
  id: string;
  case_id: string;
  scheduled_at: string | null;
  venue: string | null;
  outcome: string | null;
  mediator_name: string | null;
  docket_id: string;
  problem: string;
  district: string | null;
  stage: string | null;
  applicant_name: string | null;
}

const OUTCOME_STYLE: Record<MediationOutcome | "unknown", { label: string; bg: string; border: string }> = {
  scheduled: { label: "নির্ধারিত", bg: "#e0edff", border: "#1d4ed8" },
  settled: { label: "সালিশ", bg: "#dff3ea", border: "#047857" },
  failed: { label: "ব্যর্থ", bg: "#fde8ec", border: "#9f1239" },
  unknown: { label: "ফলাফল নথিভুক্ত হয়নি", bg: "#f1f5f9", border: "#64748b" },
};

function localDate(value: string | null): Date | null {
  if (!value) return null;
  // A stored instant is UTC; the grid is a local wall clock, so read the local parts.
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function timeLabel(value: string | null): string {
  const date = localDate(value);
  // Bangladesh wall clock. A 10:00 BDT booking is 04:00 UTC, so rendering the stored
  // instant in the browser's zone would show the wrong hour to whoever is reading it.
  return date ? bdTimeBn(date) : "";
}

export default function MediationCalendar({
  mediations,
  onSelect,
}: {
  mediations: CalendarMediation[];
  onSelect?: (mediation: CalendarMediation) => void;
}) {
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const week = useMemo(() => workdaysOfWeek(anchor), [anchor]);
  const weekLabel = useMemo(() => {
    const first = week[0];
    const last = week[week.length - 1];
    return `${formatBn(first, false)} — ${formatBn(last, false)}`;
  }, [week]);

  /** Index by `YYYY-MM-DD` so a booking lands in exactly one cell. */
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarMediation[]>();
    for (const item of mediations) {
      const date = localDate(item.scheduled_at);
      if (!date) continue;
      const key = toDateKey(date);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    // Soonest first inside a day: the officer works the morning before the afternoon.
    for (const list of map.values()) {
      list.sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
    }
    return map;
  }, [mediations]);

  const today = useMemo(() => new Date(), []);
  const weekCount = useMemo(
    () => week.reduce((sum, day) => sum + (byDay.get(toDateKey(day))?.length ?? 0), 0),
    [week, byDay],
  );

  const shift = useCallback((days: number) => setAnchor((current) => addDays(current, days)), []);

  return (
    <section aria-label="মধ্যস্থতা ক্যালেন্ডার" className="med-cal">
      <style>{`
        .med-cal { background:#fff; border:1px solid var(--portal-border, #e2e8f0); border-radius:14px; overflow:hidden; }
        .med-cal-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; border-bottom:1px solid var(--portal-border, #e2e8f0); background:#f8fafc; flex-wrap:wrap; }
        .med-cal-nav { display:flex; align-items:center; gap:6px; }
        .med-cal-nav button { min-width:var(--touch-min,2.75rem); min-height:var(--touch-min,2.75rem); border:1.5px solid var(--portal-border, #cbd5e1); background:#fff; border-radius:8px; font-weight:700; cursor:pointer; color:var(--portal-text, #0f172a); }
        .med-cal-nav button:hover { background:#f1f5f9; }
        .med-cal-label { font-family:var(--font-bn); font-weight:700; font-size:0.9375rem; color:var(--portal-text, #0f172a); }
        .med-cal-grid { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); }
        .med-cal-day { border-right:1px solid var(--portal-border, #e2e8f0); min-height:180px; display:flex; flex-direction:column; }
        .med-cal-day:last-child { border-right:none; }
        .med-cal-dayhead { padding:10px 12px; border-bottom:1px solid var(--portal-border, #e2e8f0); background:#fbfdff; }
        .med-cal-dayname { font-family:var(--font-bn); font-size:0.8125rem; font-weight:700; color:var(--portal-text, #0f172a); }
        .med-cal-date { font-size:0.75rem; color:var(--portal-text-secondary, #64748b); margin-top:2px; }
        .med-cal-today { background:#eff6ff; }
        .med-cal-items { padding:8px; display:flex; flex-direction:column; gap:6px; flex:1; }
        .med-cal-empty { padding:14px 12px; font-family:var(--font-bn); font-size:0.75rem; color:var(--portal-text-muted, #94a3b8); }
        .med-cal-item { display:block; width:100%; text-align:left; border:1.5px solid; border-left-width:4px; border-radius:8px; padding:7px 9px; cursor:pointer; background:#fff; text-decoration:none; }
        .med-cal-item:hover { filter:brightness(0.97); }
        .med-cal-time { font-size:0.6875rem; font-weight:700; }
        .med-cal-ref { font-size:0.75rem; font-weight:700; font-family:var(--font-bn); color:var(--portal-text, #0f172a); margin-top:2px; }
        .med-cal-meta { font-size:0.6875rem; font-family:var(--font-bn); color:var(--portal-text-secondary, #64748b); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .med-cal-summary { display:flex; gap:14px; flex-wrap:wrap; padding:10px 16px; border-top:1px solid var(--portal-border, #e2e8f0); background:#f8fafc; font-family:var(--font-bn); font-size:0.75rem; color:var(--portal-text-secondary, #475569); }
        @media (max-width: 860px) {
          .med-cal-grid { grid-template-columns:1fr; }
          .med-cal-day { border-right:none; border-bottom:1px solid var(--portal-border, #e2e8f0); min-height:0; }
        }
      `}</style>

      <div className="med-cal-bar">
        <div className="med-cal-nav">
          <button type="button" onClick={() => shift(-7)} aria-label="আগের সপ্তাহ">‹</button>
          <button type="button" onClick={() => setAnchor(new Date())}>আজ</button>
          <button type="button" onClick={() => shift(7)} aria-label="পরের সপ্তাহ">›</button>
        </div>
        <span className="med-cal-label">{weekLabel}</span>
        <span className="med-cal-label" style={{ fontWeight: 500, color: "var(--portal-text-secondary, #64748b)" }}>
          এই সপ্তাহে {weekCount}টি মধ্যস্থতা
        </span>
      </div>

      <div className="med-cal-grid">
        {week.map((day, index) => {
          const key = toDateKey(day);
          const items = byDay.get(key) ?? [];
          const isToday = sameDay(day, today);
          const working = isWorkday(day);
          return (
            <div key={key} className={`med-cal-day${isToday ? " med-cal-today" : ""}`}>
              <div className="med-cal-dayhead">
                <div className="med-cal-dayname">{MEDIATION_WEEKDAYS[index]?.bn}</div>
                <div className="med-cal-date">
                  {/* Bangladesh day/month, not the runtime's. Reading these with the
                      local accessors made the server render one day and the browser
                      another, which is a hydration mismatch AND a real bug: a judge
                      looking at a date the server disagrees with cannot trust the grid. */}
                  {bdDayOfMonth(day)}/{bdMonthOfYear(day)}
                  {isToday ? " · আজ" : ""}
                </div>
              </div>
              {items.length === 0 ? (
                <div className="med-cal-empty">
                  {working ? "নির্ধারিত মধ্যস্থতা নেই" : "সম্পূর্ণ"}
                </div>
              ) : (
                <div className="med-cal-items">
                  {items.map((item) => {
                    const outcome = (item.outcome ?? "unknown") as MediationOutcome | "unknown";
                    const style = OUTCOME_STYLE[outcome];
                    const body = (
                      <>
                        <div className="med-cal-time" style={{ color: style.border }}>
                          {timeLabel(item.scheduled_at)} · {style.label}
                        </div>
                        <div className="med-cal-ref">{item.docket_id}</div>
                        <div className="med-cal-meta">{item.applicant_name || "আবেদনকারী"}</div>
                        {item.mediator_name ? <div className="med-cal-meta">মধ্যস্থতা: {item.mediator_name}</div> : null}
                      </>
                    );
                    const common = {
                      className: "med-cal-item",
                      style: { borderColor: style.border, background: style.bg },
                    };
                    return onSelect ? (
                      <button key={item.id} type="button" {...common} onClick={() => onSelect(item)}>
                        {body}
                      </button>
                    ) : (
                      <Link key={item.id} href={`/dlao/cases/${item.case_id}`} {...common}>
                        {body}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="med-cal-summary">
        <span>
          <strong style={{ color: "#1d4ed8" }}>নীল</strong> নির্ধারিত
        </span>
        <span>
          <strong style={{ color: "#047857" }}>সবুজ</strong> সালিশ হয়েছে
        </span>
        <span>
          <strong style={{ color: "#9f1239" }}>লাল</strong> ব্যর্থ
        </span>
        <span>শুক্র ও শনি বাদ: সপ্তাহে পাঁচ কার্যদিবস।</span>
      </div>
    </section>
  );
}
