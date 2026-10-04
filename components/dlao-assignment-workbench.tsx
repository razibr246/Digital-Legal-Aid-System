"use client";

/**
 * The DLAO's AI Suggestion Center: case triage and lawyer selection in one place.
 *
 * These used to be two disconnected things — a plain-text summary card on the case
 * page, and a bare roster with a search box. A DLAO reading "Immediate Crisis &
 * Safety" had no way to act on it in the same breath, and the roster gave no reason
 * to prefer one lawyer over another. Now the case is triaged, a lawyer is recommended
 * with its reasons, and the full roster stays one click away.
 *
 * The recommendation is deterministic and rule-based (see
 * `lib/case/lawyer-recommendation.ts`). It is called AI at the desk because that is
 * what the officer is doing — applying a model of the case to a roster — but every
 * suggestion shows the weights that produced it, because an appointment that affects
 * someone's liberty has to be explainable.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  Brain,
  CheckCircle2,
  ChevronDown,
  Gavel,
  Loader2,
  MapPin,
  Scale,
  Search,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { filterLawyers, type LawyerSummary } from "@/lib/case/lawyer-assignment";
import type { LawyerRecommendation } from "@/lib/case/lawyer-recommendation";
import { RiskBadgeRow } from "@/components/risk-badges";
import { AiSparkleBadge, SuggestionLoader, SkeletonRow } from "@/components/ai-assist";
import type { PortalCase } from "@/lib/data/case-projection";

interface Recommendation {
  caseId: string;
  categoryId: string | null;
  categoryBn: string | null;
  headlineBn: string;
  items: LawyerRecommendation[];
}

export default function DlaoAssignmentWorkbench({
  cases,
  onAssigned,
}: {
  cases: PortalCase[];
  onAssigned?: () => void;
}) {
  const [lawyers, setLawyers] = useState<LawyerSummary[]>([]);
  const [selectedCase, setSelectedCase] = useState<string>("");
  const [query, setQuery] = useState("");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [loadingRec, setLoadingRec] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  // A brief "matching" beat while a search term is applied, so filtering a large
  // roster does not read as the list being stuck.
  const [searching, setSearching] = useState(false);

  const openCases = useMemo(
    () => cases.filter((c) => c.status !== "closed" && c.status !== "resolved"),
    [cases],
  );
  const activeCase = useMemo(
    () => openCases.find((c) => c.id === selectedCase) ?? null,
    [openCases, selectedCase],
  );

  const loadRoster = useCallback(async () => {
    setLoadingRoster(true);
    try {
      const res = await fetch("/api/portal/lawyers", { cache: "no-store" });
      const body = await res.json();
      if (body?.ok) setLawyers(body.lawyers ?? []);
    } catch {
      setNotice({ tone: "err", text: "আইনজীবীর তালিকা নেওয়া যায়নি।" });
    } finally {
      setLoadingRoster(false);
    }
  }, []);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  // The recommendation is fetched per case, and deliberately shows a "looking"
  // state: a DLAO picking a case expects the system to be thinking about it, and an
  // instant silent list does not read as a considered judgement.
  useEffect(() => {
    if (!selectedCase) {
      setRecommendation(null);
      return;
    }
    let cancelled = false;
    setLoadingRec(true);
    setRecommendation(null);
    (async () => {
      try {
        const res = await fetch(`/api/portal/lawyers?caseId=${encodeURIComponent(selectedCase)}`, {
          cache: "no-store",
        });
        const body = await res.json();
        if (!cancelled && body?.ok) setRecommendation(body.recommendation ?? null);
      } catch {
        if (!cancelled) setRecommendation(null);
      } finally {
        if (!cancelled) setLoadingRec(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCase]);

  // Clear the "matching" beat shortly after typing stops.
  useEffect(() => {
    if (!searching) return;
    const t = setTimeout(() => setSearching(false), 500);
    return () => clearTimeout(t);
  }, [query, searching]);

  const visibleLawyers = useMemo(() => filterLawyers(lawyers, query), [lawyers, query]);
  const recommendedIds = useMemo(
    () => new Set((recommendation?.items ?? []).map((r) => r.lawyer.id)),
    [recommendation],
  );

  const assign = useCallback(
    async (lawyer: LawyerSummary) => {
      if (!selectedCase) return;
      setBusy(lawyer.id);
      setNotice(null);
      try {
        const res = await fetch("/api/portal/lawyer-assign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ caseId: selectedCase, panelLawyerId: lawyer.id }),
        });
        const body = await res.json();
        if (body?.ok) {
          setNotice({
            tone: "ok",
            text: body.replaced
              ? `${body.previousLawyerName} এর বদলে ${body.lawyerName} নিয়োগ দেওয়া হয়েছে।`
              : `${body.lawyerName} কে নিয়োগ দেওয়া হয়েছে। আইনজীবীর কাজের সময়সীমা আজ থেকে শুরু।`,
          });
          onAssigned?.();
        } else {
          setNotice({ tone: "err", text: body?.error ?? "নিয়োগ দেওয়া যায়নি।" });
        }
      } catch {
        setNotice({ tone: "err", text: "নিয়োগ দেওয়া যায়নি।" });
      } finally {
        setBusy(null);
      }
    },
    [selectedCase, onAssigned],
  );

  return (
    <section aria-label="এইচ ও আইনজীবী পরামর্শ কেন্দ্র" className="sac">
      <style>{`
        .sac { display:grid; gap:16px; }
        @media (min-width:1000px) { .sac { grid-template-columns:340px 1fr; align-items:start; } }
        .sac-card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden;
          box-shadow:0 1px 2px rgba(15,23,42,.04); }
        .sac-hd { display:flex; align-items:center; gap:10px; padding:13px 15px; border-bottom:1px solid #f1f5f9;
          background:linear-gradient(135deg,#f8fafc,#f1f5f9); }
        .sac-ic { width:32px; height:32px; border-radius:9px; display:grid; place-items:center; flex:0 0 32px; }
        .sac-ht { font:800 13.5px/1.3 var(--font-bn); color:#0f172a; margin:0; }
        .sac-hs { margin:2px 0 0; font:500 11px/1.4 var(--font-bn); color:#64748b; }
        .sac-bd { padding:14px 15px; }
        .sac-lbl { font:800 10.5px/1 var(--font-bn); letter-spacing:.4px; text-transform:uppercase; color:#94a3b8; margin:0 0 8px; }
        .sac-in,.sac-sel { width:100%; min-height:46px; padding:11px 12px; border:1px solid #cbd5e1; border-radius:11px;
          font:500 14px/1.4 var(--font-bn); box-sizing:border-box; background:#fff; }
        .sac-sel { appearance:none; background-image:none; }
        .sac-skel { height:9px; border-radius:999px; margin-top:7px;
          background:linear-gradient(90deg,#eef2f7 25%,#e2e8f0 37%,#eef2f7 63%);
          background-size:400% 100%; animation:sac-shimmer 1.3s ease-in-out infinite; }
        @keyframes sac-shimmer { 0%{background-position:100% 0} 100%{background-position:0 0} }
        .sac-look { display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius:12px;
          background:linear-gradient(135deg,#eef2ff,#f5f3ff); border:1px solid #ddd6fe; color:#4338ca;
          font:700 13px/1.5 var(--font-bn); }
        .sac-spin { animation:sac-rot 1s linear infinite; }
        @keyframes sac-rot { to { transform:rotate(360deg) } }
        .sac-row { display:flex; gap:12px; align-items:center; padding:13px 15px; border-bottom:1px solid #f1f5f9; flex-wrap:wrap; }
        .sac-row:last-child { border-bottom:0; }
        .sac-row.rec { background:linear-gradient(90deg,#f0fdfa,rgba(240,253,250,0)); }
        .sac-av { width:42px; height:42px; border-radius:12px; flex:0 0 42px; display:grid; place-items:center;
          background:#0f766e; color:#fff; }
        .sac-av.off { background:#cbd5e1; color:#64748b; }
        .sac-av.med { background:#7c3aed; }
        .sac-n { margin:0; font:800 14.5px/1.35 var(--font-bn); color:#0f172a; display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
        .sac-m { margin:3px 0 0; font:500 11.5px/1.5 var(--font-bn); color:#64748b; }
        .sac-tag { font:800 10px/1 var(--font-bn); padding:4px 7px; border-radius:999px; }
        .sac-tag.best { background:#d1fae5; color:#065f46; }
        .sac-tag.spec { background:#ede9fe; color:#5b21b6; }
        .sac-tag.load { background:#f1f5f9; color:#475569; }
        .sac-tag.late { background:#fee2e2; color:#991b1b; }
        .sac-score { font:800 12px/1 var(--font-bn); color:#0f766e; padding:5px 8px; border-radius:8px; background:#f0fdfa; }
        .sac-why { margin:7px 0 0; padding:0; list-style:none; display:grid; gap:4px; }
        .sac-why li { font:500 11.5px/1.5 var(--font-bn); color:#475569; display:flex; gap:6px; align-items:flex-start; }
        .sac-btn { font:inherit; font:700 13px/1 var(--font-bn); min-height:46px; padding:12px 16px; border-radius:11px;
          border:1px solid #0f766e; background:#0f766e; color:#fff; cursor:pointer; white-space:nowrap; }
        .sac-btn.ghost { background:#fff; color:#0f766e; }
        .sac-btn:disabled { opacity:.5; cursor:not-allowed; }
        .sac-note { padding:12px 13px; border-radius:11px; font:600 13px/1.6 var(--font-bn); }
        .sac-note.ok { background:#ecfdf5; color:#065f46; }
        .sac-note.err { background:#fef2f2; color:#991b1b; }
        .sac-head { padding:13px 15px; border-radius:12px; background:linear-gradient(135deg,#eef2ff,#faf5ff);
          border:1px solid #e0e7ff; }
        .sac-head p { margin:6px 0 0; font:600 13px/1.65 var(--font-bn); color:#3730a3; }
        .sac-fact { display:flex; gap:8px; align-items:flex-start; padding:8px 0; border-bottom:1px solid #f8fafc; }
        .sac-fact:last-child { border-bottom:0; }
        .sac-fk { font:700 11.5px/1.5 var(--font-bn); color:#94a3b8; flex:0 0 104px; }
        .sac-fv { font:600 12.5px/1.5 var(--font-bn); color:#1e293b; word-break:break-word; }
        .sac-more { width:100%; min-height:44px; border:0; background:transparent; cursor:pointer;
          font:700 12.5px/1 var(--font-bn); color:#0f766e; display:flex; align-items:center; justify-content:center; gap:6px; }
        .sac-empty { padding:22px 15px; text-align:center; font:500 13px/1.6 var(--font-bn); color:#64748b; }
      `}</style>

      {/* ---------- left: pick the case, read the triage ---------- */}
      <div style={{ display: "grid", gap: 16 }}>
        <div className="sac-card">
          <div className="sac-hd">
            <span className="sac-ic" style={{ background: "#dbeafe", color: "#1d4ed8" }}>
              <Gavel size={17} strokeWidth={2.3} aria-hidden />
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 className="sac-ht">কোন কেস দেখবেন</h2>
              <p className="sac-hs">বেছে নিলে পরামর্শ নিজে থেকে হবে</p>
            </div>
          </div>
          <div className="sac-bd">
            <p className="sac-lbl">খোলা কেস</p>
            <select
              className="sac-sel"
              value={selectedCase}
              onChange={(e) => {
                setSelectedCase(e.target.value);
                setNotice(null);
                setShowAll(false);
              }}
            >
              <option value="">— কেস নির্বাচন করুন —</option>
              {openCases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.docketId} · {c.applicantName}
                </option>
              ))}
            </select>
            <p className="sac-m" style={{ marginTop: 9 }}>
              {openCases.length}টি খোলা কেস। কোনো কেসে ইতিমধ্যে আইনজীবী থাকলে নতুন নিয়োগ দিলে পূর্ববর্তীটি বন্ধ হবে।
            </p>
          </div>
        </div>

        <div className="sac-card">
          <div className="sac-hd">
            <AiSparkleBadge size={32} />
            <div style={{ minWidth: 0 }}>
              <h2 className="sac-ht">এইচ সহায়তা</h2>
              <p className="sac-hs">মামলার বিশ্লেষণ, তীব্রতা ও অগ্রাধিকার</p>
            </div>
          </div>
          <div className="sac-bd">
            {!activeCase ? (
              <p className="sac-m">উপরের তালিকা থেকে একটি কেস বেছে নিলে এখানে তার সাধারণীকরণ দেখা যাবে।</p>
            ) : (
              <>
                <RiskBadgeRow
                  urgency={activeCase.urgency}
                  priority={activeCase.priority}
                  severity={activeCase.severityLevel}
                />
                <div style={{ marginTop: 13 }}>
                  <div className="sac-fact">
                    <span className="sac-fk">আবেদনের সারসংক্ষেপ</span>
                    <span className="sac-fv">{activeCase.intakeSummary || activeCase.problemStatement}</span>
                  </div>
                  <div className="sac-fact">
                    <span className="sac-fk">স্ক্রিনিং বিভাগ</span>
                    <span className="sac-fv">{activeCase.severityCategory || "—"}</span>
                  </div>
                  <div className="sac-fact">
                    <span className="sac-fk">ঝুঁকির কারণ</span>
                    <span className="sac-fv">
                      {Array.isArray(activeCase.severityFactors) && activeCase.severityFactors.length
                        ? activeCase.severityFactors.join(", ")
                        : "—"}
                    </span>
                  </div>
                  <div className="sac-fact">
                    <span className="sac-fk">আবেদনকারী</span>
                    <span className="sac-fv">
                      {activeCase.applicantName} · {activeCase.primaryContactNumber || "ফোন নেই"}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ---------- right: recommendation + roster ---------- */}
      <div style={{ display: "grid", gap: 16 }}>
        <div className="sac-card">
          <div className="sac-hd">
            <AiSparkleBadge size={32} />
            <div style={{ minWidth: 0 }}>
              <h2 className="sac-ht">এইচ পরামর্শ — উপযুক্ত আইনজীবী</h2>
              <p className="sac-hs">বিশেষায়ন, জেলা ও ভার — এই তিনটির ভিত্তিতে</p>
            </div>
          </div>

          {!selectedCase ? (
            <div className="sac-empty">একটি কেস বেছে নিলে সুপারিশ দেখা যাবে।</div>
          ) : loadingRec ? (
            <div className="sac-bd">
              <SuggestionLoader
                caseLabel={activeCase ? `${activeCase.docketId} · ${activeCase.applicantName}` : null}
                problemType={
                  recommendation?.categoryBn ??
                  (activeCase ? (activeCase.problemStatement?.split(":")[1]?.trim() ?? activeCase.problemStatement) : null)
                }
              />
              <div style={{ marginTop: 12 }}>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            </div>
          ) : !recommendation || recommendation.items.length === 0 ? (
            <div className="sac-empty">এই মামলার জন্য নিয়োগযোগ্য কোনো আইনজীবী পাওয়া যায়নি।</div>
          ) : (
            <>
              <div className="sac-bd" style={{ paddingBottom: 0 }}>
                <div className="sac-head">
                  <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#4338ca" }}>
                    <Scale size={15} strokeWidth={2.4} aria-hidden />
                    <span style={{ font: "800 11.5px/1 var(--font-bn)", letterSpacing: ".3px" }}>
                      {recommendation.categoryBn ?? "সাধারণ বিবিধ অভিযোগ"}
                    </span>
                  </div>
                  <p>{recommendation.headlineBn}</p>
                </div>
              </div>
              {recommendation.items.map((rec) => (
                <RecommendationRow
                  key={rec.lawyer.id}
                  rec={rec}
                  busy={busy === rec.lawyer.id}
                  disabled={!selectedCase}
                  onAssign={() => void assign(rec.lawyer)}
                />
              ))}
            </>
          )}
        </div>

        <div className="sac-card">
          <div className="sac-hd">
            <span className="sac-ic" style={{ background: "#e0f2fe", color: "#0369a1" }}>
              <Users size={17} strokeWidth={2.3} aria-hidden />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 className="sac-ht">সম্পূর্ণ প্যানেল তালিকা</h2>
              <p className="sac-hs">নাম, বার নিবন্ধন, বিশেষায়ন বা জেলা</p>
            </div>
          </div>
          <div className="sac-bd" style={{ paddingBottom: 10 }}>
            <div style={{ position: "relative" }}>
              <Search
                size={16}
                strokeWidth={2.3}
                aria-hidden
                style={{ position: "absolute", left: 12, top: 15, color: "#94a3b8" }}
              />
              <input
                className="sac-in"
                style={{ paddingLeft: 36 }}
                placeholder="আইনজীবী খুঁজুন…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearching(true);
                }}
                onBlur={() => setSearching(false)}
                aria-label="আইনজীবী খুঁজুন"
              />
            </div>
          </div>

          {loadingRoster || searching ? (
            <>
              {searching ? (
                <div style={{ padding: "11px 15px 0" }}>
                  <div className="sac-look" role="status" aria-live="polite" style={{ padding: "9px 11px" }}>
                    <Loader2 size={15} className="sac-spin" strokeWidth={2.4} aria-hidden />
                    <span style={{ fontSize: 12.5 }}>
                      {activeCase
                        ? `${activeCase.docketId}-এর জন্য সম্পূর্ণ তালিকা থেকে মিলিয়ে দেখা হচ্ছে…`
                        : "তালিকা থেকে মিলিয়ে দেখা হচ্ছে…"}
                    </span>
                  </div>
                </div>
              ) : null}
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : visibleLawyers.length === 0 ? (
            <div className="sac-empty">"{query}" খুঁজে কোনো আইনজীবী পাওয়া যায়নি।</div>
          ) : (
            (showAll ? visibleLawyers : visibleLawyers.filter((l) => recommendedIds.has(l.id) || l.assignable).slice(0, 3)).map((l) => (
              <RosterRow
                key={l.id}
                lawyer={l}
                recommended={recommendedIds.has(l.id)}
                busy={busy === l.id}
                disabled={!selectedCase || !l.assignable}
                onAssign={() => void assign(l)}
              />
            ))
          )}

          {visibleLawyers.length > 3 ? (
            <button type="button" className="sac-more" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "সংক্ষেপে দেখান" : `সব ${visibleLawyers.length} জন দেখান`}
              <ChevronDown
                size={15}
                strokeWidth={2.4}
                aria-hidden
                style={{ transform: showAll ? "rotate(180deg)" : "none", transition: "transform .2s" }}
              />
            </button>
          ) : null}

          {notice ? (
            <div className="sac-bd" style={{ paddingTop: 0 }}>
              <div className={`sac-note ${notice.tone}`} role="status">
                {notice.tone === "ok" ? <CheckCircle2 size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} aria-hidden /> : null}
                {notice.text}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function RecommendationRow({
  rec,
  busy,
  disabled,
  onAssign,
}: {
  rec: LawyerRecommendation;
  busy: boolean;
  disabled: boolean;
  onAssign: () => void;
}) {
  return (
    <motion.div
      className="sac-row rec"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <div className={`sac-av${rec.lawyer.kind === "mediator" ? " med" : ""}`}>
        {rec.lawyer.name.replace(/^অ্যাডভোকেট\s*/, "").slice(0, 2)}
      </div>
      <div style={{ flex: 1, minWidth: 180 }}>
        <p className="sac-n">
          {rec.lawyer.name}
          <span className="sac-score">{rec.score} নম্বর</span>
          {rec.specialist ? <span className="sac-tag spec">বিশেষায়ন মিলেছে</span> : null}
        </p>
        <p className="sac-m">
          {rec.lawyer.barRegistration ?? "বার নিবন্ধন নেই"}
          {rec.lawyer.jurisdiction ? (
            <>
              {" · "}
              <MapPin size={11} style={{ verticalAlign: "-1px" }} aria-hidden /> {rec.lawyer.jurisdiction}
            </>
          ) : null}
        </p>
        <ul className="sac-why">
          {rec.reasons.map((r, i) => (
            <li key={i}>
              {r.weight >= 0 ? (
                <BadgeCheck size={12} strokeWidth={2.4} style={{ color: "#059669", marginTop: 3, flex: "0 0 12px" }} aria-hidden />
              ) : (
                <AlertMinus size={12} strokeWidth={2.4} style={{ color: "#dc2626", marginTop: 3, flex: "0 0 12px" }} aria-hidden />
              )}
              <span>{r.bn}</span>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" className="sac-btn" disabled={disabled || busy} onClick={onAssign}>
        {busy ? "নিয়োগ হচ্ছে…" : "নিয়োগ দিন"}
      </button>
    </motion.div>
  );
}

function RosterRow({
  lawyer,
  recommended,
  busy,
  disabled,
  onAssign,
}: {
  lawyer: LawyerSummary;
  recommended: boolean;
  busy: boolean;
  disabled: boolean;
  onAssign: () => void;
}) {
  return (
    <div className="sac-row">
      <div className={`sac-av${lawyer.assignable ? "" : " off"}${lawyer.kind === "mediator" ? " med" : ""}`}>
        {lawyer.name.replace(/^অ্যাডভোকেট\s*/, "").slice(0, 2)}
      </div>
      <div style={{ flex: 1, minWidth: 170 }}>
        <p className="sac-n">
          {lawyer.name}
          {recommended ? <span className="sac-tag best">পরামর্শকৃত</span> : null}
          <span className="sac-tag load">{lawyer.activeAssignments}টি কেস</span>
          {lawyer.overdueActions > 0 ? (
            <span className="sac-tag late">{lawyer.overdueActions} দেরি</span>
          ) : null}
          {!lawyer.assignable ? <span className="sac-tag load">তালিকায় নেই</span> : null}
        </p>
        {lawyer.specialisations ? <p className="sac-m">{lawyer.specialisations}</p> : null}
      </div>
      <button
        type="button"
        className={`sac-btn${recommended ? "" : " ghost"}`}
        disabled={disabled || busy}
        onClick={onAssign}
        title={lawyer.assignable ? undefined : "প্যানেল তালিকায় নেই"}
      >
        {busy ? <Loader2 size={15} className="sac-spin" aria-hidden /> : <UserCheck size={15} style={{ verticalAlign: "-2px", marginRight: 5 }} aria-hidden />}
        নিয়োগ দিন
      </button>
    </div>
  );
}

function AlertMinus({ size, strokeWidth, style, ...rest }: { size?: number; strokeWidth?: number; style?: React.CSSProperties } & Record<string, unknown>) {
  return (
    <svg width={size ?? 12} height={size ?? 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth ?? 2} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden {...rest}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
    </svg>
  );
}
