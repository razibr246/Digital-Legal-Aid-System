"use client";

/**
 * The panel-lawyer control on a case, as it was actually used.
 *
 * This replaces a plain <select> that was hardcoded to a single mock lawyer, so the
 * case page offered exactly one fake option and nothing behind the "-- নির্বাচন করুন --"
 * placeholder. The roster and the recommendation already existed, on a separate tab;
 * nobody looks for a control by finding the tab it was duplicated onto, so the
 * duplicate is the one that matters and it now uses the real thing.
 *
 * Collapsed, it is one line showing who is on the case. Expanded, it runs the same
 * recommendation engine as the Suggestion Center, with the same "looking for a
 * suitable lawyer for this case, by problem type" loader, so the two paths cannot
 * disagree about who should take the case.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, ChevronDown, Loader2, RefreshCw, Search, UserCheck, X } from "lucide-react";
import { filterLawyers, type LawyerSummary } from "@/lib/case/lawyer-assignment";
import type { LawyerRecommendation } from "@/lib/case/lawyer-recommendation";
import { AiSparkleBadge, SkeletonRow, SuggestionLoader } from "@/components/ai-assist";

export default function AiLawyerPicker({
  caseId,
  caseLabel,
  problemType,
  current,
  onAssigned,
}: {
  caseId: string;
  caseLabel: string;
  problemType: string | null;
  /** Currently appointed lawyer, if any. */
  current: { id: string; name: string } | null;
  onAssigned?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lawyers, setLawyers] = useState<LawyerSummary[]>([]);
  const [rec, setRec] = useState<{ headlineBn: string; items: LawyerRecommendation[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/lawyers?caseId=${encodeURIComponent(caseId)}`, {
        cache: "no-store",
      });
      const body = await res.json();
      if (!body?.ok) {
        setError(body?.error ?? "আইনজীবীর তালিকা নেওয়া যায়নি।");
        return;
      }
      setLawyers(body.lawyers ?? []);
      setRec(body.recommendation ?? null);
    } catch {
      setError("আইনজীবীর তালিকা নেওয়া যায়নি।");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    if (open && lawyers.length === 0) void load();
  }, [open, lawyers.length, load]);

  const assign = useCallback(
    async (lawyer: LawyerSummary) => {
      setBusy(lawyer.id);
      setError(null);
      try {
        const res = await fetch("/api/portal/lawyer-assign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ caseId, panelLawyerId: lawyer.id }),
        });
        const body = await res.json();
        if (body?.ok) {
          onAssigned?.(body.lawyerName);
          setOpen(false);
          void load();
        } else {
          setError(body?.error ?? "নিয়োগ দেওয়া যায়নি।");
        }
      } catch {
        setError("নিয়োগ দেওয়া যায়নি।");
      } finally {
        setBusy(null);
      }
    },
    [caseId, onAssigned, load],
  );

  const filtered = useMemo(() => filterLawyers(lawyers, query), [lawyers, query]);
  const recIds = useMemo(() => new Set((rec?.items ?? []).map((r) => r.lawyer.id)), [rec]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
      <label
        style={{
          fontFamily: "var(--font-bn)",
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "var(--portal-text)",
        }}
      >
        প্যানেল আইনজীবী নিয়োগ
      </label>

      {/* collapsed: who is on the case, and a way in */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          minHeight: 52,
          padding: "11px 13px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--portal-border)",
          background: current ? "#f0fdfa" : "#fff",
          cursor: "pointer",
          fontFamily: "var(--font-bn)",
          textAlign: "left",
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            flex: "0 0 28px",
            display: "grid",
            placeItems: "center",
            background: current ? "#0f766e" : "#ede9fe",
            color: current ? "#fff" : "#6d28d9",
            fontWeight: 800,
            fontSize: 11,
          }}
        >
          {current ? <Check size={15} strokeWidth={2.6} aria-hidden /> : "আই"}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: "0.95rem",
              fontWeight: current ? 700 : 500,
              color: current ? "#0f172a" : "#94a3b8",
            }}
          >
            {current ? current.name : "-- নির্বাচন করুন --"}
          </span>
          {current ? (
            <span style={{ display: "block", fontSize: "0.72rem", color: "#047857" }}>
              নিয়োগিত · নতুন করে বদলাতে চাপ দিন
            </span>
          ) : (
            <span style={{ display: "block", fontSize: "0.72rem", color: "#94a3b8" }}>
              এইচ উপযুক্ত আইনজীবী সুপারিশ করবে
            </span>
          )}
        </span>
        <ChevronDown
          size={17}
          strokeWidth={2.3}
          aria-hidden
          style={{
            color: "#64748b",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform .2s",
            flex: "0 0 17px",
          }}
        />
      </button>

      {open ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          style={{
            overflow: "hidden",
            border: "1px solid #e2e8f0",
            borderRadius: "var(--radius-md)",
            background: "#fff",
            marginTop: 4,
          }}
        >
          {loading ? (
            <div style={{ padding: 12 }}>
              <SuggestionLoader caseLabel={caseLabel} problemType={problemType} />
              <div style={{ marginTop: 8 }}>
                <SkeletonRow />
                <SkeletonRow />
              </div>
            </div>
          ) : error && lawyers.length === 0 ? (
            <div style={{ padding: 14 }}>
              <p style={{ margin: "0 0 10px", font: "600 13px/1.6 var(--font-bn)", color: "#991b1b" }}>{error}</p>
              <button type="button" onClick={() => void load()} className="alp-btn ghost">
                <RefreshCw size={13} strokeWidth={2.4} aria-hidden /> আবার চেষ্টা করুন
              </button>
            </div>
          ) : (
            <>
              {rec ? (
                <div
                  style={{
                    padding: 13,
                    background: "linear-gradient(135deg,#eef2ff,#faf5ff)",
                    borderBottom: "1px solid #e0e7ff",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                    <AiSparkleBadge size={22} />
                    <span style={{ font: "800 11px/1 var(--font-bn)", letterSpacing: ".4px", color: "#4338ca" }}>
                      এইচ সুপারিশ
                    </span>
                  </div>
                  <p style={{ margin: 0, font: "600 12.5px/1.6 var(--font-bn)", color: "#3730a3" }}>
                    {rec.headlineBn}
                  </p>
                </div>
              ) : null}

              {rec && rec.items.length > 0 ? (
                <>
                  <div style={{ padding: "9px 13px 3px", font: "800 10.5px/1 var(--font-bn)", letterSpacing: ".4px", color: "#94a3b8" }}>
                    সুপারিশকৃত
                  </div>
                  {rec.items.map((r) => (
                    <LawyerRow key={r.lawyer.id} rec={r} busy={busy === r.lawyer.id} onAssign={() => void assign(r.lawyer)} />
                  ))}
                </>
              ) : null}

              <div style={{ padding: 10, borderTop: "1px solid #f1f5f9" }}>
                <div style={{ position: "relative" }}>
                  <Search size={15} strokeWidth={2.3} aria-hidden style={{ position: "absolute", left: 11, top: 14, color: "#94a3b8" }} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`সব ${lawyers.length} জন আইনজীবীর মধ্যে খুঁজুন…`}
                    aria-label="আইনজীবী খুঁজুন"
                    style={{
                      width: "100%",
                      minHeight: 44,
                      padding: "10px 12px 10px 33px",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      font: "500 13.5px/1.4 var(--font-bn)",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {filtered.length === 0 ? (
                  <p style={{ padding: "14px 13px", margin: 0, font: "500 12.5px/1.6 var(--font-bn)", color: "#64748b" }}>
                    &quot;{query}&quot; খুঁজে কোনো আইনজীবী পাওয়া যায়নি।
                  </p>
                ) : (
                  filtered
                    .filter((l) => !recIds.has(l.id))
                    .map((l) => (
                      <LawyerRow
                        key={l.id}
                        lawyer={l}
                        busy={busy === l.id}
                        disabled={!l.assignable}
                        onAssign={() => void assign(l)}
                      />
                    ))
                )}
              </div>
            </>
          )}
        </motion.div>
      ) : null}

      <style>{`
        .alp-btn { font:inherit; font:700 12.5px/1 var(--font-bn); min-height:44px; padding:10px 13px;
          border-radius:10px; border:1px solid #0f766e; background:#0f766e; color:#fff; cursor:pointer;
          display:inline-flex; align-items:center; gap:6px; }
        .alp-btn.ghost { background:#fff; color:#0f766e; }
        .alp-row { display:flex; gap:10px; align-items:center; padding:10px 13px; border-top:1px solid #f8fafc;
          flex-wrap:wrap; }
        .alp-av { width:34px; height:34px; border-radius:9px; flex:0 0 34px; display:grid; place-items:center;
          background:#0f766e; color:#fff; font:800 11px/1 var(--font-bn); }
        .alp-av.off { background:#cbd5e1; color:#64748b; }
        .alp-n { margin:0; font:800 13px/1.35 var(--font-bn); color:#0f172a; display:flex; gap:6px;
          align-items:center; flex-wrap:wrap; }
        .alp-m { margin:2px 0 0; font:500 11px/1.45 var(--font-bn); color:#64748b; }
        .alp-tag { font:800 9.5px/1 var(--font-bn); padding:3px 6px; border-radius:999px;
          background:#ede9fe; color:#5b21b6; }
        .alp-score { font:800 10.5px/1 var(--font-bn); padding:3px 6px; border-radius:6px;
          background:#f0fdfa; color:#0f766e; }
        .alp-why { margin:5px 0 0; padding:0; list-style:none; display:grid; gap:2px; }
        .alp-why li { font:500 10.5px/1.45 var(--font-bn); color:#475569; }
      `}</style>
    </div>
  );
}

function LawyerRow({
  rec,
  lawyer,
  busy,
  disabled,
  onAssign,
}: {
  rec?: LawyerRecommendation;
  lawyer?: LawyerSummary;
  busy: boolean;
  disabled?: boolean;
  onAssign: () => void;
}) {
  const l = rec?.lawyer ?? lawyer!;
  const off = disabled ?? !l.assignable;
  return (
    <div className="alp-row" style={rec ? { background: "linear-gradient(90deg,#f0fdfa,transparent)" } : undefined}>
      <span className={`alp-av${off ? " off" : ""}`}>
        {l.name.replace(/^অ্যাডভোকেট\s*/, "").slice(0, 2)}
      </span>
      <div style={{ flex: 1, minWidth: 140 }}>
        <p className="alp-n">
          {l.name}
          {rec?.score !== undefined ? <span className="alp-score">{rec.score} নম্বর</span> : null}
          {rec?.specialist ? <span className="alp-tag">বিশেষায়ন</span> : null}
        </p>
        <p className="alp-m">
          {l.barRegistration ?? "—"}
          {l.jurisdiction ? ` · ${l.jurisdiction}` : ""}
          {l.activeAssignments > 0 ? ` · ${l.activeAssignments}টি কেস` : " · খালি"}
        </p>
        {rec && rec.reasons.length > 0 ? (
          <ul className="alp-why">
            {rec.reasons.slice(0, 2).map((r, i) => (
              <li key={i}>
                {r.weight >= 0 ? "✓ " : "⚠ "}
                {r.bn}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button
        type="button"
        className="alp-btn"
        style={rec ? undefined : { background: "#fff", color: "#0f766e" }}
        disabled={off || busy}
        onClick={onAssign}
      >
        {busy ? <Loader2 size={13} className="alp-spin" aria-hidden /> : <UserCheck size={13} strokeWidth={2.4} aria-hidden />}
        {busy ? "…" : "নিয়োগ"}
      </button>
    </div>
  );
}
