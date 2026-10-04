"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DlaoShell, type DlaoTab } from "@/lib/ui/shell/DlaoShell";
import DlaoAssignmentWorkbench from "@/components/dlao-assignment-workbench";
import AdviceRegister from "@/components/advice-register";
import MediationCalendar, { type CalendarMediation } from "@/components/mediation/mediation-calendar";
import MediationBookingPanel from "@/components/mediation/mediation-booking-panel";
import { useVoiceSession } from "@/hooks/use-voice-session";
import AiAssistCallout from "@/components/ai-assist-callout";
import type { PortalCase } from "@/lib/data/case-projection";
import { assessSla, daysInStageTone, type SlaLevel } from "@/lib/case/domain";
import { toDateKey, workdaysOfWeek, addDays, fromDateKey } from "@/lib/case/mediation";

/**
 * DLAO dashboard.
 *
 * The SLA question is answered by `assessSla` and `daysInStageTone` in
 * `lib/case/domain.ts`, not by a number typed into this file. There used to be a local
 * `SLA_DAYS = 65` here, which agreed with nothing: the real clocks are 15 days for
 * review, 60 for mediation and 10 for payment approval. A badge that disagrees with the
 * rule it claims to enforce is worse than no badge, so the local copy is gone.
 *
 * `hearing` and `online` have no data behind them — there is no hearing-date column
 * anywhere in the schema — so instead of rendering an empty queue under a confident
 * heading they say so. `reports` is wired to the audit trail, which is real.
 */

const REVIEW_SLA_LIMIT_DAYS = 15;

function getAgeInDays(applicationTime: string): number {
  const timestamp = new Date(applicationTime).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

/** Review is the stage a fresh application sits in, so that is the clock that applies. */
function getSlaState(applicationTime: string): SlaLevel {
  return assessSla("review", getAgeInDays(applicationTime)).level;
}

function getSlaLabel(state: SlaLevel): string {
  if (state === "breach") return "সীমা পার";
  if (state === "near") return "সীমার কাছাকাছি";
  return "সীমার মধ্যে";
}

/** The queue class and the badge both branch on 'overdue' | 'near' | 'normal'. */
function toRowState(level: SlaLevel): "overdue" | "near" | "normal" {
  if (level === "breach") return "overdue";
  if (level === "near") return "near";
  return "normal";
}

function getUrgencyLabel(urgency: string): string {
  if (urgency === "emergency_danger") return "জরুরি";
  if (urgency === "urgent") return "অগ্রাধিকার";
  return "স্বাভাবিক";
}

function getPriorityLabel(priority: string): string {
  if (priority === "urgent") return "অতি জরুরি";
  if (priority === "high") return "উচ্চ অগ্রাধিকার";
  return "স্বাভাবিক";
}

function getVisibleCases(cases: PortalCase[], tab: DlaoTab): PortalCase[] {
  if (tab === "new") return cases.filter((item) => item.status === "pending_review");
  if (tab === "cases") return cases.filter((item) => item.status !== "pending_review");
  if (tab === "panel") return cases.filter((item) => item.status === "assigned");
  if (tab === "applications") return cases;
  return [];
}

/** Tabs that have no data source at all, so they must not pretend otherwise. */
const NOT_BUILT: Partial<Record<DlaoTab, string>> = {
  hearing: "কোর্টের শুনানির তারিখ এখনো সিস্টেমে নেই। ক্যালেন্ডার ট্যাবে মধ্যস্থতার তারিখ দেখা যাচ্ছে।",
  online: "অনলাইন পরামর্শ এখনো চালু নয়।",
};

interface MediatorOption {
  id: string;
  name: string;
  district: string | null;
  specialisations: string | null;
}

export default function DlaoDashboard() {
  const { currentUser } = useVoiceSession();
  const [cases, setCases] = useState<PortalCase[]>([]);
  const [activeTab, setActiveTab] = useState<DlaoTab>("applications");
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  // ADR state
  const [mediations, setMediations] = useState<CalendarMediation[]>([]);
  const [mediators, setMediators] = useState<MediatorOption[]>([]);
  const [adrLoading, setAdrLoading] = useState(true);
  const [adrError, setAdrError] = useState("");
  const [bookingCaseId, setBookingCaseId] = useState<string | null>(null);

  // ONE fetch. There were two identical ones — one on mount and one on reloadToken —
  // so every mount raced itself and the second response could overwrite the first.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/portal/cases", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => { if (!cancelled && data?.ok) setCases(data.cases ?? []); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadToken]);

  useEffect(() => {
    let cancelled = false;
    setAdrLoading(true);
    setAdrError("");
    const week = workdaysOfWeek(new Date());
    const from = toDateKey(week[0]);
    const to = toDateKey(addDays(week[4], 2));
    fetch(`/api/portal/mediations?from=${from}&to=${to}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data?.ok) { setAdrError(data?.error || "মধ্যস্থতার তথ্য লোড করা যায়নি।"); return; }
        setMediations(data.mediations ?? []);
        setMediators(data.mediators ?? []);
      })
      .catch(() => { if (!cancelled) setAdrError("সংযোগ বিচ্ছিন্ন।"); })
      .finally(() => { if (!cancelled) setAdrLoading(false); });
    return () => { cancelled = true; };
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  const visibleCases = useMemo(() => getVisibleCases(cases, activeTab), [cases, activeTab]);
  const waitingForLawyer = cases.filter(
    (item) =>
      !item.assignedLawyerId &&
      item.status !== "closed" &&
      item.status !== "resolved" &&
      item.status !== "settled" &&
      item.status !== "unresolved",
  ).length;
  const overdueCount = cases.filter((item) => getSlaState(item.applicationTime) === "breach").length;
  const nearCount = cases.filter((item) => getSlaState(item.applicationTime) === "near").length;

  /** Open cases that could plausibly go to mediation — the booking picker's list. */
  const mediableCases = useMemo(
    () =>
      cases.filter(
        (item) =>
          !["closed", "resolved", "settled", "unresolved"].includes(item.status) &&
          !mediations.some((m) => m.case_id === item.id && m.outcome === "scheduled"),
      ),
    [cases, mediations],
  );

  const mediationOpenCount = useMemo(
    () => mediations.filter((m) => m.outcome === "scheduled").length,
    [mediations],
  );

  const heading =
    activeTab === "lawyers" ? "এইচ পরামর্শ কেন্দ্র"
    : activeTab === "mediation" ? "মধ্যস্থতা (ADR)"
    : activeTab === "calendar" ? "কার্যতালিকা ক্যালেন্ডার"
    : activeTab === "reports" ? "প্রতিবেদন"
    : activeTab === "advice" ? "পরামর্শ রেকর্ড"
    : "আবেদন";

  const notBuiltNote = NOT_BUILT[activeTab];

  return (
    <DlaoShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabCounts={{ new: cases.filter((i) => i.status === "pending_review").length, cases: cases.filter((i) => i.status !== "pending_review").length, panel: cases.filter((i) => i.status === "assigned").length, mediation: mediationOpenCount }}
      role={currentUser?.role ?? null}
    >
      <h1 className="dlao-page-heading">{heading}</h1>

      {/* ---- advice register: general inquiries taken on 16699 ---- */}
      {activeTab === "advice" ? <AdviceRegister /> : null}

      {/* ---- panel lawyers ---- */}
      {activeTab === "lawyers" ? <DlaoAssignmentWorkbench cases={cases} onAssigned={reload} /> : null}

      {/* ---- ADR ---- */}
      {activeTab === "mediation" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl, 24px)" }}>
          {adrError ? (
            <p style={{ fontFamily: "var(--font-bn)", color: "#dc2626", margin: 0 }}>{adrError}</p>
          ) : null}

          <div>
            <h2 style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 700, margin: "0 0 4px" }}>
              কোন কেসে মধ্যস্থতা নির্ধারণ করবেন?
            </h2>
            <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text-secondary, #64748b)", margin: "0 0 12px" }}>
              বাধ্যতামূলক মধ্যস্থতার জেলায় আইনজীবী নিয়োগের আগে মধ্যস্থতা করতে হয়। সিস্টেম সেই নিয়মটিই প্রয়োগ করে।
            </p>
            {mediableCases.length === 0 ? (
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text-secondary, #64748b)", margin: 0 }}>
                এখনো মধ্যস্থতার জন্য উপযুক্ত কোনো চলমান কেস নেই।
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                {mediableCases.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setBookingCaseId(item.id)}
                    style={{
                      textAlign: "left",
                      border: `1.5px solid ${bookingCaseId === item.id ? "var(--portal-accent, #15803d)" : "var(--portal-border, #e2e8f0)"}`,
                      background: bookingCaseId === item.id ? "var(--portal-accent-subtle, #f0fdf4)" : "#fff",
                      borderRadius: 10,
                      padding: "12px 14px",
                      minHeight: "var(--touch-min, 2.75rem)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", fontWeight: 700, color: "var(--portal-accent-text, #15803d)" }}>
                      {item.docketId}
                    </div>
                    <div style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", fontWeight: 600, color: "var(--portal-text, #0f172a)", marginTop: 2 }}>
                      {item.applicantName}
                    </div>
                    <div style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-secondary, #64748b)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.district || "—"} · {daysInStageTone(getAgeInDays(item.applicationTime)) === "breach" ? "সীমা পার" : "চলমান"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {bookingCaseId
            ? (() => {
                const target = cases.find((c) => c.id === bookingCaseId);
                if (!target) return null;
                return (
                  <section style={{ border: "1px solid var(--portal-border, #e2e8f0)", borderRadius: 12, padding: "var(--space-lg, 16px)" }}>
                    <MediationBookingPanel
                      caseId={target.id}
                      docketId={target.docketId}
                      applicantName={target.applicantName}
                      mediators={mediators}
                      onBooked={reload}
                    />
                  </section>
                );
              })()
            : null}
        </div>
      ) : null}

      {/* ---- calendar ---- */}
      {activeTab === "calendar" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg, 20px)" }}>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary, #64748b)", margin: 0 }}>
            কার্যদিবস রবি থেকে বৃহস্পতি। কোনো কার্যক্রমে ক্লিক করলে সেই কেসের ফাইল খুলবে।
          </p>
          {adrLoading ? (
            <p style={{ fontFamily: "var(--font-bn)", color: "var(--portal-text-secondary, #64748b)" }}>ক্যালেন্ডার লোড হচ্ছে…</p>
          ) : (
            <MediationCalendar
              mediations={mediations}
              onSelect={(item) => {
                setBookingCaseId(item.case_id);
                setActiveTab("mediation");
              }}
            />
          )}
        </div>
      ) : null}

      {/* ---- the queue ---- */}
      {activeTab === "lawyers" || activeTab === "mediation" || activeTab === "calendar" ? null : notBuiltNote ? (
        <div style={{ border: "1px dashed var(--portal-border-strong, #94a3b8)", borderRadius: 12, padding: "var(--space-xl, 24px)", textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", color: "var(--portal-text, #0f172a)", margin: 0 }}>{notBuiltNote}</p>
        </div>
      ) : activeTab === "reports" ? (
        <section aria-label="প্রতিবেদন">
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: "var(--space-lg, 20px)" }}>
            {[
              { label: "মোট আবেদন", value: cases.length },
              { label: "অপেক্ষমাণ", value: cases.filter((c) => c.status === "pending_review").length },
              { label: "SLA পার", value: overdueCount },
              { label: "আইনজীবীর অপেক্ষায়", value: waitingForLawyer },
              { label: "চলমান মধ্যস্থতা", value: mediationOpenCount },
            ].map((card) => (
              <div key={card.label} style={{ border: "1px solid var(--portal-border, #e2e8f0)", borderRadius: 10, padding: "14px 16px", background: "#fff" }}>
                <div style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-secondary, #64748b)" }}>{card.label}</div>
                <div style={{ fontFamily: "var(--font-bn)", fontSize: "1.5rem", fontWeight: 700, color: "var(--portal-text, #0f172a)", marginTop: 4 }}>{card.value}</div>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text-secondary, #64748b)", margin: 0 }}>
            প্রধান কর্মকর্তার প্রতিবেদন ও অডিট ট্রেইলের জন্য <Link href="/chief" style={{ color: "var(--portal-accent-text, #15803d)", fontWeight: 600 }}>প্রধান কর্মকর্তা কনসোল</Link> দেখুন।
          </p>
        </section>
      ) : (
        <>
          <AiAssistCallout waitingCount={waitingForLawyer} onOpen={() => setActiveTab("lawyers")} />
          <section className="dlao-sla-alert" aria-label="SLA summary">
            <div className="dlao-sla-alert-header">
              <span className="dlao-sla-alert-icon" aria-hidden="true">!</span>
              <h2>{overdueCount}টি কেস SLA সীমা পার করেছে, {nearCount}টি সীমার কাছাকাছি</h2>
            </div>
            <p className="dlao-sla-alert-copy">
              পর্যালোচনার সময়সীমা {REVIEW_SLA_LIMIT_DAYS} দিন — এটি lib/case/domain.ts-এর নিয়ম, স্ক্রিনে লেখা নয়।
            </p>
            <div className="dlao-queue">
              {loading ? (
                <div className="dlao-queue-loading">আবেদনের তালিকা লোড হচ্ছে...</div>
              ) : visibleCases.length === 0 ? (
                <div className="dlao-queue-empty">এই অংশে কোনো আবেদন পাওয়া যায়নি।</div>
              ) : (
                visibleCases.map((item) => {
                  const slaState = toRowState(getSlaState(item.applicationTime));
                  const age = getAgeInDays(item.applicationTime);
                  return (
                    <Link key={item.id} href={`/dlao/cases/${item.id}`} className={`dlao-queue-row ${slaState}`}>
                      <div className="dlao-queue-content">
                        <div className="dlao-queue-reference">{item.applicationId} · {item.docketId}</div>
                        <h2 className="dlao-queue-name">{item.applicantName}</h2>
                        {item.sourceLanguage !== "bn" && <p className="dlao-queue-meta">ভাষা: {item.sourceLanguage === "marma" ? "মারমা" : "চাকমা"} · অর্থ নিশ্চিত করা হয়েছে</p>}
                        <p className="dlao-queue-meta">আবেদন পরিচালনা একেন্দ্রে জমা হয়েছে — {age} দিন (সীমা {REVIEW_SLA_LIMIT_DAYS} দিন)</p>
                        <p className="dlao-queue-meta">জরুরি: {getUrgencyLabel(item.urgency)} · অগ্রাধিকার: {getPriorityLabel(item.priority)} · রেকর্ডিং: {item.recording ? "সংরক্ষিত" : "প্রক্রিয়াধীন"}</p>
                      </div>
                      <div className="dlao-queue-actions">
                        <span className={`dlao-sla-label ${slaState}`}>{getSlaLabel(getSlaState(item.applicationTime))}</span>
                        <span className="dlao-case-link">কেস দেখুন</span>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}
    </DlaoShell>
  );
}
