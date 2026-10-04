"use client";

/**
 * The DLAO's advice register: every general inquiry taken on the 16699 line.
 *
 * A caller who wanted information and nothing else leaves no case, no file and no login.
 * Before this existed that call simply disappeared, so the officer could not answer "what
 * did we tell this person, and how long did it take?" — and a legal-aid hotline that
 * cannot account for its own advice is not auditable.
 *
 * The transcript is the record. It is stored as the real question/answer pairs rather than
 * a summary, because the citizen may be told what they were advised and a summary is not
 * evidence of that.
 *
 * Dates render through the Bangladesh helpers, never `toLocale*`. The Worker is UTC and
 * the officer's browser is UTC+6, so a locale-formatted call time is an hour out in the
 * browser and reads as a hydration mismatch on every load.
 */

import { useCallback, useEffect, useState } from "react";
import { bdDayOfMonth, bdMonthOfYear, bdTimeBn, formatBn } from "@/lib/case/mediation";

type Turn = { role: string; content: string };

type AdviceRecord = {
  id: string;
  ref: string | null;
  caller_phone: string | null;
  phone_is_simulated: number;
  phoneIsSimulated?: boolean;
  language: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  turn_count: number;
  transcript: Turn[];
  advice: string | null;
  topics: string | null;
  category: string;
  escalated: number;
  status: "new" | "reviewed" | "closed";
  dlao_notes: string | null;
};

type Payload = {
  records: AdviceRecord[];
  counts: Record<string, number>;
  summary: { total: number; totalSeconds: number; avgSeconds: number };
};

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The call time and day, in Bangladesh.
 *
 * These delegate to the shared helpers rather than adding six hours by hand. The helpers
 * shift to Bangladesh internally, so a manual +6 on top of them would read 18:00 for a
 * noon call -- and the Worker renders in UTC while the officer's browser is UTC+6, which
 * is exactly the disagreement `formatBn` exists to prevent. `bdTimeBn` also gives Bangla
 * digits, so the register matches the rest of the dashboard.
 */
function callTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : bdTimeBn(d);
}

function callDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${bdDayOfMonth(d)}/${bdMonthOfYear(d)}`;
}

const STATUS_LABEL: Record<string, string> = {
  new: "নতুন",
  reviewed: "দেখা হয়েছে",
  closed: "বন্ধ",
};

export default function AdviceRegister() {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<"" | "new" | "reviewed" | "closed">("");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/advice${filter ? `?status=${filter}` : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError("পরামর্শ রেকর্ড পড়া যায়নি।");
        return;
      }
      setData((await res.json()) as Payload);
      setError(null);
    } catch {
      setError("পরামর্শ রেকর্ড পড়া যায়নি।");
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <p className="py-6 text-sm text-red-700">{error}</p>;
  }
  if (!data) {
    return <p className="py-6 text-sm text-slate-500">লোড হচ্ছে…</p>;
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="মোট পরামর্শ" value={String(data.summary.total)} />
        <Stat label="সর্বমোট সময়" value={mmss(data.summary.totalSeconds)} />
        <Stat label="গড় সময়" value={mmss(data.summary.avgSeconds)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["", "new", "reviewed", "closed"] as const).map((s) => (
          <button
            key={s || "all"}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === s
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-slate-300 text-slate-700"
            }`}
          >
            {s ? STATUS_LABEL[s] : "সব"}
            {s && data.counts[s] ? ` (${data.counts[s]})` : ""}
          </button>
        ))}
      </div>

      {data.records.length === 0 ? (
        <p className="py-6 text-sm text-slate-500">
          এখনো কোনো পরামর্শ রেকর্ড নেই। ১৬৬৯৯ নম্বরে সাধারণ তথ্যের জন্য কেউ কল করলে এখানে জমা হবে।
        </p>
      ) : (
        <ul className="space-y-2">
          {data.records.map((r) => {
            const expanded = open === r.id;
            return (
              <li key={r.id} className="rounded-lg border border-slate-200">
                <button
                  onClick={() => setOpen(expanded ? null : r.id)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left"
                >
                  <span className="font-mono text-xs text-slate-500">{r.ref}</span>
                  <span className="text-sm">
                    {callDay(r.started_at)} · {callTime(r.started_at)}
                  </span>
                  <span className="font-mono text-sm">
                    {r.caller_phone ?? "—"}
                    {r.phoneIsSimulated ? (
                      <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                        সিমুলেটেড
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-slate-500">
                    {mmss(r.duration_seconds ?? 0)} · {r.turn_count} টি প্রশ্ন
                  </span>
                  {r.escalated ? (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                      জরুরি
                    </span>
                  ) : null}
                  <span
                    className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${
                      r.status === "new"
                        ? "bg-amber-100 text-amber-900"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                </button>

                {expanded && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    {r.advice && (
                      <p className="mb-3 rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                        <span className="font-medium">পরামর্শ: </span>
                        {r.advice}
                      </p>
                    )}
                    {r.transcript.length === 0 ? (
                      <p className="text-sm text-slate-500">কথোপকথন সংরক্ষিত হয়নি।</p>
                    ) : (
                      <ol className="space-y-1.5">
                        {r.transcript.map((t, i) => (
                          <li key={i} className="text-sm">
                            <span className="text-xs text-slate-400">
                              {t.role === "user" ? "ফোনকারী" : "অফিসার"}:{" "}
                            </span>
                            <span
                              className={
                                t.role === "user" ? "text-slate-700" : "text-slate-900"
                              }
                            >
                              {t.content}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                    <p className="mt-3 text-[11px] text-slate-400">
                      {formatBn(new Date(r.started_at))} · ভাষা {r.language ?? "bn"}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
