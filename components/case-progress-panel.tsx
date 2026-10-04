"use client";

/**
 * A short summary of the applicant's cases on the dashboard.
 *
 * Deliberately a summary, not a second copy of the case page. This panel used to carry
 * the stepper, the lawyer's details, the full timeline and the complaint form, which
 * turned a phone dashboard into a long scroll past three verification steps to reach
 * the one thing that mattered. All of that now lives at /citizen/case/[id], and this
 * shows only what is needed to decide whether to open it: which case, what stage, and
 * whether the lawyer is behind.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CitizenCaseView } from "@/lib/data/citizen-case-view";

export default function CaseProgressPanel({ refreshToken = 0 }: { refreshToken?: number }) {
  const [cases, setCases] = useState<CitizenCaseView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/my-case", { cache: "no-store" });
      const body = await res.json();
      if (body?.ok) setCases(body.cases ?? []);
    } catch {
      /* the section simply does not render */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(false);
    void load();
  }, [load, refreshToken]);

  if (loading || cases.length === 0) return null;

  return (
    <section aria-label="আমার মামলাসমূহ" style={{ marginBottom: "var(--space-xl)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-bn)",
            fontSize: "1.05rem",
            fontWeight: 800,
            color: "var(--portal-text)",
            margin: 0,
          }}
        >
          আমার মামলা
        </h2>
        {cases.length > 1 ? (
          <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.78rem", color: "var(--portal-text-secondary)" }}>
            {cases.length}টি
          </span>
        ) : null}
      </div>

      {cases.map((c) => {
        const overdue = c.tracker?.summary.overdue ?? 0;
        return (
          <Link
            key={c.caseId}
            href={`/citizen/case/${encodeURIComponent(c.caseId)}`}
            style={{
              display: "block",
              textDecoration: "none",
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: "14px 15px",
              marginBottom: 10,
              minHeight: 44,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-bn)", fontSize: "0.72rem", fontWeight: 800, color: "#0f766e" }}>
                  {c.docketId}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-bn)",
                    fontSize: "0.9rem",
                    fontWeight: 700,
                    color: "var(--portal-text)",
                    marginTop: 4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {c.problem}
                </div>
              </div>
              <span
                style={{
                  flex: "0 0 auto",
                  fontFamily: "var(--font-bn)",
                  fontSize: "0.7rem",
                  fontWeight: 800,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "#ecfdf5",
                  color: "#047857",
                  whiteSpace: "nowrap",
                }}
              >
                {c.stageLabelBn}
              </span>
            </div>

            {c.lawyer ? (
              <div
                style={{
                  marginTop: 11,
                  paddingTop: 11,
                  borderTop: "1px solid #f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-bn)", fontSize: "0.8rem", fontWeight: 700, color: "#1e293b" }}>
                    {c.lawyer.name}
                  </div>
                  <div style={{ fontFamily: "var(--font-bn)", fontSize: "0.72rem", color: "#64748b", marginTop: 2 }}>
                    {overdue > 0
                      ? `${overdue}টি ধাপের সময় পেরিয়েছে`
                      : c.tracker
                        ? `${c.tracker.summary.done}/${c.tracker.summary.total} ধাপ সম্পন্ন`
                        : "প্যানেল আইনজীবী"}
                  </div>
                </div>
                <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", fontWeight: 800, color: "#0f766e", whiteSpace: "nowrap" }}>
                  বিস্তারিত ›
                </span>
              </div>
            ) : (
              <div
                style={{
                  marginTop: 11,
                  paddingTop: 11,
                  borderTop: "1px solid #f1f5f9",
                  fontFamily: "var(--font-bn)",
                  fontSize: "0.75rem",
                  color: "#92400e",
                }}
              >
                আইনজীবী নিয়োগের অপেক্ষায়
              </div>
            )}
          </Link>
        );
      })}
    </section>
  );
}
