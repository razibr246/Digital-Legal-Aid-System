"use client";

/**
 * Lawyer Accountability Monitoring Console
 *
 * Tracks panel lawyer SLA compliance, issues show-cause notices, manages payment
 * freezes, and handles lawyer performance flags. Implements the Legal Aid Rules
 * requirement that panel lawyers submit hearing updates after every court date.
 *
 * Key features:
 * - Red Flag Alert when lawyer misses 2 consecutive deadlines
 * - 48-hour show-cause notice window
 * - Automatic payment freeze on non-response
 * - Case reassignment with Wakalatnama cancellation
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type LawyerMetrics = {
  id: string;
  name: string;
  barId: string;
  phone: string | null;
  district: string | null;
  specialization: string | null;
  status: string;
  casesAssigned: number;
  casesCompleted: number;
  casesReassigned: number;
  activeComplaints: number;
  totalComplaints: number;
  overdueActions: number;
  dueSoonActions: number;
  completedActions: number;
  totalActions: number;
  progressPercent: number;
  violationCount: number;
  lastViolationAt: string | null;
  paymentFrozen: boolean;
  redFlagCount: number;
  warningCount: number;
  hasActiveShowCause: boolean;
  showCauseDeadline: string | null;
  performanceScore: number | null;
};

type ShowCauseNotice = {
  id: string;
  lawyerId: string;
  caseId: string | null;
  reasonCode: string;
  reasonDetail: string | null;
  issuedAt: string;
  deadlineAt: string;
  status: string;
  response: string | null;
  respondedAt: string | null;
  lawyerName: string | null;
  caseRef: string | null;
};

type Violation = {
  id: string;
  lawyerId: string;
  caseId: string | null;
  actionCode: string;
  deadlineAt: string;
  missedAt: string;
  consecutiveCount: number;
  status: string;
  lawyerName: string | null;
  caseRef: string | null;
};

type PaymentFreeze = {
  id: string;
  lawyerId: string;
  reason: string;
  frozenAt: string;
  status: string;
  lawyerName: string | null;
};

type Flag = {
  id: string;
  lawyerId: string;
  flagType: string;
  reasonCode: string;
  reasonDetail: string | null;
  issuedAt: string;
  expiresAt: string | null;
  lawyerName: string | null;
};

type MonitorData = {
  kpis: {
    totalLawyers: number;
    lawyersWithOverdue: number;
    lawyersWithComplaints: number;
    paymentsFrozen: number;
    pendingShowCause: number;
    activeRedFlags: number;
    activeWarnings: number;
    totalViolations: number;
  };
  lawyers: LawyerMetrics[];
  showCauseNotices: ShowCauseNotice[];
  recentViolations: Violation[];
  paymentFreezes: PaymentFreeze[];
  activeFlags: Flag[];
};

const TABS = [
  { id: "overview", label: "সারসংক্ষেপ" },
  { id: "lawyers", label: "আইনজীবী তালিকা" },
  { id: "show-cause", label: "কারণ দর্শাও" },
  { id: "violations", label: "SLA লঙ্ঘন" },
  { id: "freezes", label: "পেমেন্ট স্থগিত" },
  { id: "flags", label: "ফ্ল্যাগ/সতর্কতা" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const SHOW_CAUSE_REASONS: Record<string, string> = {
  missed_deadline: "সময়সীমা অতিক্রম",
  no_court_update: "আদালত আপডেট নেই",
  no_contact: "যোগাযোগ নেই",
  citizen_complaint: "নাগরিক অভিযোগ",
  multiple_violations: "একাধিক লঙ্ঘন",
  other: "অন্যান্য",
};

const RESOLUTION_LABELS: Record<string, string> = {
  warning: "সতর্কতা",
  cleared: "ক্লিয়ার",
  payment_freeze: "পেমেন্ট স্থগিত",
  reassign: "পুনঃনিয়োগ",
  misconduct: "অসদাচরণ কমিটি",
};

const FLAG_TYPE_LABELS: Record<string, string> = {
  red_flag: "রেড ফ্ল্যাগ",
  warning: "সতর্কতা",
  watch: "পর্যবেক্ষণ",
  commendation: "প্রশংসা",
};

export default function LawyerMonitorConsole() {
  const router = useRouter();
  const [data, setData] = useState<MonitorData | null>(null);
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  // Modal states
  const [showCauseModal, setShowCauseModal] = useState<{
    open: boolean;
    lawyerId: string;
    lawyerName: string;
  } | null>(null);
  const [showCauseForm, setShowCauseForm] = useState({ reasonCode: "missed_deadline", reasonDetail: "" });

  const [resolveModal, setResolveModal] = useState<{
    open: boolean;
    showCauseId: string;
    lawyerName: string;
  } | null>(null);
  const [resolveForm, setResolveForm] = useState({ resolution: "warning", resolutionNote: "" });

  const [freezeModal, setFreezeModal] = useState<{
    open: boolean;
    lawyerId: string;
    lawyerName: string;
    action: "freeze" | "lift";
  } | null>(null);
  const [freezeReason, setFreezeReason] = useState("");

  const [flagModal, setFlagModal] = useState<{
    open: boolean;
    lawyerId: string;
    lawyerName: string;
  } | null>(null);
  const [flagForm, setFlagForm] = useState({ flagType: "warning", reasonDetail: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/chief/lawyer-monitor", { cache: "no-store" });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) return;
    setData((await res.json()) as MonitorData);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch {
      setLoggingOut(false);
    }
  }, [router]);

  // Issue show-cause notice
  const issueShowCause = useCallback(async () => {
    if (!showCauseModal) return;
    setBusy("show-cause");
    setToast(null);

    const res = await fetch("/api/chief/lawyer-monitor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "issue_show_cause",
        lawyerId: showCauseModal.lawyerId,
        reasonCode: showCauseForm.reasonCode,
        reasonDetail: showCauseForm.reasonDetail,
      }),
    });

    setBusy(null);
    if (res.ok) {
      setToast({ tone: "ok", text: "কারণ দর্শাও নোটিশ জারি করা হয়েছে।" });
      setShowCauseModal(null);
      setShowCauseForm({ reasonCode: "missed_deadline", reasonDetail: "" });
      await load();
    } else {
      setToast({ tone: "warn", text: "নোটিশ জারি করা যায়নি।" });
    }
  }, [showCauseModal, showCauseForm, load]);

  // Resolve show-cause
  const resolveShowCause = useCallback(async () => {
    if (!resolveModal) return;
    setBusy("resolve");
    setToast(null);

    const res = await fetch("/api/chief/lawyer-monitor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "resolve_show_cause",
        showCauseId: resolveModal.showCauseId,
        resolution: resolveForm.resolution,
        resolutionNote: resolveForm.resolutionNote,
      }),
    });

    setBusy(null);
    if (res.ok) {
      setToast({ tone: "ok", text: "নোটিশ নিষ্পত্তি করা হয়েছে।" });
      setResolveModal(null);
      setResolveForm({ resolution: "warning", resolutionNote: "" });
      await load();
    } else {
      setToast({ tone: "warn", text: "নিষ্পত্তি করা যায়নি।" });
    }
  }, [resolveModal, resolveForm, load]);

  // Freeze/lift payment
  const handleFreeze = useCallback(async () => {
    if (!freezeModal) return;
    setBusy("freeze");
    setToast(null);

    const action = freezeModal.action === "freeze" ? "freeze_payment" : "lift_freeze";
    const res = await fetch("/api/chief/lawyer-monitor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        lawyerId: freezeModal.lawyerId,
        reasonDetail: freezeReason,
        resolutionNote: freezeReason,
      }),
    });

    setBusy(null);
    if (res.ok) {
      setToast({
        tone: "ok",
        text: freezeModal.action === "freeze" ? "পেমেন্ট স্থগিত করা হয়েছে।" : "পেমেন্ট স্থগিত প্রত্যাহার করা হয়েছে।",
      });
      setFreezeModal(null);
      setFreezeReason("");
      await load();
    } else {
      setToast({ tone: "warn", text: "কাজটি সম্পন্ন হয়নি।" });
    }
  }, [freezeModal, freezeReason, load]);

  // Add flag
  const addFlag = useCallback(async () => {
    if (!flagModal) return;
    setBusy("flag");
    setToast(null);

    const res = await fetch("/api/chief/lawyer-monitor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "add_flag",
        lawyerId: flagModal.lawyerId,
        reasonCode: flagForm.flagType,
        reasonDetail: flagForm.reasonDetail,
      }),
    });

    setBusy(null);
    if (res.ok) {
      setToast({ tone: "ok", text: "ফ্ল্যাগ যোগ করা হয়েছে।" });
      setFlagModal(null);
      setFlagForm({ flagType: "warning", reasonDetail: "" });
      await load();
    } else {
      setToast({ tone: "warn", text: "ফ্ল্যাগ যোগ করা যায়নি।" });
    }
  }, [flagModal, flagForm, load]);

  // Clear flag
  const clearFlag = useCallback(
    async (flagId: string) => {
      setBusy(flagId);
      setToast(null);

      const res = await fetch("/api/chief/lawyer-monitor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "clear_flag",
          flagId,
          resolutionNote: "ফ্ল্যাগ প্রত্যাহার",
        }),
      });

      setBusy(null);
      if (res.ok) {
        setToast({ tone: "ok", text: "ফ্ল্যাগ প্রত্যাহার করা হয়েছে।" });
        await load();
      } else {
        setToast({ tone: "warn", text: "প্রত্যাহার করা যায়নি।" });
      }
    },
    [load],
  );

  if (denied) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-lg text-destructive font-semibold mb-4">আপনি এই পৃষ্ঠায় প্রবেশের অনুমতিপ্রাপ্ত নন।</p>
          <Link href="/" className="text-primary underline">
            হোমে ফিরুন
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">লোড হচ্ছে...</div>
      </div>
    );
  }

  const filteredLawyers = data.lawyers.filter(
    (l) =>
      !search ||
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.barId.toLowerCase().includes(search.toLowerCase()) ||
      l.district?.toLowerCase().includes(search.toLowerCase()),
  );

  // Sort lawyers by issues (overdue first, then complaints, then frozen)
  const sortedLawyers = [...filteredLawyers].sort((a, b) => {
    // Red flags first
    if (a.redFlagCount !== b.redFlagCount) return b.redFlagCount - a.redFlagCount;
    // Then overdue
    if (a.overdueActions !== b.overdueActions) return b.overdueActions - a.overdueActions;
    // Then complaints
    if (a.activeComplaints !== b.activeComplaints) return b.activeComplaints - a.activeComplaints;
    // Then frozen
    if (a.paymentFrozen !== b.paymentFrozen) return a.paymentFrozen ? -1 : 1;
    return 0;
  });

  return (
    <div className="min-h-screen bg-background" data-portal="dlao">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/chief" className="text-sm opacity-80 hover:opacity-100">
              &larr; চীফ কনসোল
            </Link>
            <div className="w-px h-6 bg-primary-foreground/30" />
            <h1 className="text-lg font-bold">আইনজীবী জবাবদিহিতা মনিটর</h1>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-sm px-3 py-1.5 rounded bg-primary-foreground/20 hover:bg-primary-foreground/30"
          >
            {loggingOut ? "..." : "লগআউট"}
          </button>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded shadow-lg ${
            toast.tone === "ok" ? "bg-green-600 text-white" : "bg-amber-500 text-black"
          }`}
        >
          {toast.text}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Alert Banner for Critical Issues */}
        {(data.kpis.activeRedFlags > 0 || data.kpis.pendingShowCause > 0 || data.kpis.lawyersWithOverdue > 0) && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
            <h2 className="text-red-800 font-bold text-lg mb-2">জরুরি মনোযোগ প্রয়োজন</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              {data.kpis.activeRedFlags > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-red-800">
                    <strong>{data.kpis.activeRedFlags}</strong> রেড ফ্ল্যাগ সক্রিয়
                  </span>
                </div>
              )}
              {data.kpis.pendingShowCause > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-amber-800">
                    <strong>{data.kpis.pendingShowCause}</strong> কারণ দর্শাও মুলতুবি
                  </span>
                </div>
              )}
              {data.kpis.lawyersWithOverdue > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-orange-500" />
                  <span className="text-orange-800">
                    <strong>{data.kpis.lawyersWithOverdue}</strong> আইনজীবীর সময়সীমা অতিক্রম
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border p-4">
            <div className="text-2xl font-bold text-primary">{data.kpis.totalLawyers}</div>
            <div className="text-sm text-muted-foreground">প্যানেল আইনজীবী</div>
          </div>
          <div className="bg-card rounded-xl border p-4">
            <div className="text-2xl font-bold text-orange-600">{data.kpis.lawyersWithOverdue}</div>
            <div className="text-sm text-muted-foreground">সময়সীমা অতিক্রম</div>
          </div>
          <div className="bg-card rounded-xl border p-4">
            <div className="text-2xl font-bold text-amber-600">{data.kpis.lawyersWithComplaints}</div>
            <div className="text-sm text-muted-foreground">অভিযোগ আছে</div>
          </div>
          <div className="bg-card rounded-xl border p-4">
            <div className="text-2xl font-bold text-red-600">{data.kpis.paymentsFrozen}</div>
            <div className="text-sm text-muted-foreground">পেমেন্ট স্থগিত</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 border-b">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {t.label}
              {t.id === "show-cause" && data.kpis.pendingShowCause > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-500 text-white rounded-full">
                  {data.kpis.pendingShowCause}
                </span>
              )}
              {t.id === "flags" && data.kpis.activeRedFlags > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                  {data.kpis.activeRedFlags}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === "overview" && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">সারসংক্ষেপ</h2>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-card rounded-xl border p-4">
                <div className="text-lg font-bold text-red-600">{data.kpis.activeRedFlags}</div>
                <div className="text-xs text-muted-foreground">সক্রিয় রেড ফ্ল্যাগ</div>
              </div>
              <div className="bg-card rounded-xl border p-4">
                <div className="text-lg font-bold text-amber-600">{data.kpis.activeWarnings}</div>
                <div className="text-xs text-muted-foreground">সক্রিয় সতর্কতা</div>
              </div>
              <div className="bg-card rounded-xl border p-4">
                <div className="text-lg font-bold text-orange-600">{data.kpis.totalViolations}</div>
                <div className="text-xs text-muted-foreground">SLA লঙ্ঘন</div>
              </div>
              <div className="bg-card rounded-xl border p-4">
                <div className="text-lg font-bold text-blue-600">{data.kpis.pendingShowCause}</div>
                <div className="text-xs text-muted-foreground">মুলতুবি নোটিশ</div>
              </div>
            </div>

            {/* Top Problematic Lawyers */}
            <div className="bg-card rounded-xl border p-4">
              <h3 className="font-bold mb-3">সমস্যাযুক্ত আইনজীবী (শীর্ষ ৫)</h3>
              {sortedLawyers.slice(0, 5).filter((l) => l.overdueActions > 0 || l.activeComplaints > 0 || l.redFlagCount > 0).length === 0 ? (
                <p className="text-muted-foreground text-sm">কোনো সমস্যাযুক্ত আইনজীবী নেই।</p>
              ) : (
                <div className="space-y-2">
                  {sortedLawyers
                    .slice(0, 5)
                    .filter((l) => l.overdueActions > 0 || l.activeComplaints > 0 || l.redFlagCount > 0)
                    .map((l) => (
                      <div key={l.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <div className="font-medium">{l.name}</div>
                          <div className="text-xs text-muted-foreground">{l.barId} | {l.district}</div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {l.redFlagCount > 0 && (
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded">
                              {l.redFlagCount} রেড ফ্ল্যাগ
                            </span>
                          )}
                          {l.overdueActions > 0 && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded">
                              {l.overdueActions} অতিক্রম
                            </span>
                          )}
                          {l.activeComplaints > 0 && (
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded">
                              {l.activeComplaints} অভিযোগ
                            </span>
                          )}
                          {l.paymentFrozen && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">স্থগিত</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "lawyers" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">আইনজীবী তালিকা</h2>
              <input
                type="text"
                placeholder="নাম, বার আইডি, জেলা..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm w-64"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3">আইনজীবী</th>
                    <th className="text-center p-3">মামলা</th>
                    <th className="text-center p-3">অগ্রগতি</th>
                    <th className="text-center p-3">SLA</th>
                    <th className="text-center p-3">অভিযোগ</th>
                    <th className="text-center p-3">স্ট্যাটাস</th>
                    <th className="text-center p-3">পদক্ষেপ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedLawyers.map((l) => (
                    <tr key={l.id} className={l.paymentFrozen ? "bg-red-50" : l.redFlagCount > 0 ? "bg-amber-50" : ""}>
                      <td className="p-3">
                        <div className="font-medium">{l.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.barId} | {l.district || "—"}
                        </div>
                        {l.hasActiveShowCause && (
                          <div className="text-xs text-amber-600 mt-1">
                            নোটিশ মুলতুবি: {l.showCauseDeadline ? new Date(l.showCauseDeadline).toLocaleDateString("bn-BD") : "—"}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div>{l.casesAssigned}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.casesCompleted} সম্পন্ন
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${l.progressPercent}%` }}
                            />
                          </div>
                          <span className="text-xs">{l.progressPercent}%</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {l.completedActions}/{l.totalActions} ধাপ
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {l.overdueActions > 0 ? (
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                            {l.overdueActions} অতিক্রম
                          </span>
                        ) : l.dueSoonActions > 0 ? (
                          <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">
                            {l.dueSoonActions} শীঘ্রই
                          </span>
                        ) : (
                          <span className="text-green-600 text-xs">ঠিক আছে</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {l.activeComplaints > 0 ? (
                          <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">
                            {l.activeComplaints} সক্রিয়
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex flex-wrap justify-center gap-1">
                          {l.redFlagCount > 0 && (
                            <span className="px-1.5 py-0.5 bg-red-500 text-white rounded text-xs">
                              RF×{l.redFlagCount}
                            </span>
                          )}
                          {l.warningCount > 0 && (
                            <span className="px-1.5 py-0.5 bg-amber-500 text-white rounded text-xs">
                              W×{l.warningCount}
                            </span>
                          )}
                          {l.paymentFrozen && (
                            <span className="px-1.5 py-0.5 bg-blue-500 text-white rounded text-xs">
                              স্থগিত
                            </span>
                          )}
                          {!l.redFlagCount && !l.warningCount && !l.paymentFrozen && (
                            <span className="text-green-600 text-xs">স্বাভাবিক</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex justify-center gap-1">
                          <button
                            onClick={() => setShowCauseModal({ open: true, lawyerId: l.id, lawyerName: l.name })}
                            disabled={l.hasActiveShowCause}
                            className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            নোটিশ
                          </button>
                          <button
                            onClick={() =>
                              setFreezeModal({
                                open: true,
                                lawyerId: l.id,
                                lawyerName: l.name,
                                action: l.paymentFrozen ? "lift" : "freeze",
                              })
                            }
                            className={`px-2 py-1 text-xs rounded ${
                              l.paymentFrozen
                                ? "bg-green-100 text-green-700 hover:bg-green-200"
                                : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                            }`}
                          >
                            {l.paymentFrozen ? "প্রত্যাহার" : "স্থগিত"}
                          </button>
                          <button
                            onClick={() => setFlagModal({ open: true, lawyerId: l.id, lawyerName: l.name })}
                            className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                          >
                            ফ্ল্যাগ
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "show-cause" && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">কারণ দর্শাও নোটিশ</h2>

            {data.showCauseNotices.length === 0 ? (
              <p className="text-muted-foreground">কোনো মুলতুবি নোটিশ নেই।</p>
            ) : (
              <div className="space-y-3">
                {data.showCauseNotices.map((sc) => {
                  const deadline = new Date(sc.deadlineAt);
                  const isExpired = deadline < new Date();
                  return (
                    <div
                      key={sc.id}
                      className={`p-4 rounded-xl border ${
                        isExpired && sc.status === "pending"
                          ? "bg-red-50 border-red-300"
                          : sc.status === "responded"
                            ? "bg-green-50 border-green-300"
                            : "bg-amber-50 border-amber-300"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold">{sc.lawyerName || sc.lawyerId}</div>
                          <div className="text-sm text-muted-foreground">
                            কারণ: {SHOW_CAUSE_REASONS[sc.reasonCode] || sc.reasonCode}
                          </div>
                          {sc.reasonDetail && (
                            <div className="text-sm mt-1">{sc.reasonDetail}</div>
                          )}
                          {sc.caseRef && (
                            <div className="text-xs text-muted-foreground mt-1">মামলা: {sc.caseRef}</div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-medium ${isExpired ? "text-red-600" : "text-amber-600"}`}>
                            সময়সীমা: {deadline.toLocaleDateString("bn-BD")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            জারি: {new Date(sc.issuedAt).toLocaleDateString("bn-BD")}
                          </div>
                          {sc.status === "responded" && (
                            <div className="text-xs text-green-600 mt-1">জবাব দিয়েছেন</div>
                          )}
                        </div>
                      </div>

                      {sc.response && (
                        <div className="mt-3 p-3 bg-white rounded border">
                          <div className="text-xs font-medium text-muted-foreground mb-1">জবাব:</div>
                          <div className="text-sm">{sc.response}</div>
                        </div>
                      )}

                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() =>
                            setResolveModal({ open: true, showCauseId: sc.id, lawyerName: sc.lawyerName || "" })
                          }
                          className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
                        >
                          নিষ্পত্তি করুন
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "violations" && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">SLA লঙ্ঘন</h2>

            {data.recentViolations.length === 0 ? (
              <p className="text-muted-foreground">কোনো সাম্প্রতিক লঙ্ঘন নেই।</p>
            ) : (
              <div className="space-y-2">
                {data.recentViolations.map((v) => (
                  <div key={v.id} className="p-4 bg-card rounded-xl border">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{v.lawyerName || v.lawyerId}</div>
                        <div className="text-sm text-muted-foreground">
                          ধাপ: {v.actionCode} | মামলা: {v.caseRef || "—"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-red-600">
                          সময়সীমা ছিল: {new Date(v.deadlineAt).toLocaleDateString("bn-BD")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          মিস: {new Date(v.missedAt).toLocaleDateString("bn-BD")}
                        </div>
                        {v.consecutiveCount > 1 && (
                          <div className="text-xs text-red-600 mt-1">
                            পরপর {v.consecutiveCount} বার
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "freezes" && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">পেমেন্ট স্থগিত</h2>

            {data.paymentFreezes.length === 0 ? (
              <p className="text-muted-foreground">কোনো স্থগিত পেমেন্ট নেই।</p>
            ) : (
              <div className="space-y-2">
                {data.paymentFreezes.map((f) => (
                  <div key={f.id} className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{f.lawyerName || f.lawyerId}</div>
                        <div className="text-sm text-muted-foreground">{f.reason}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-blue-600">
                          স্থগিত: {new Date(f.frozenAt).toLocaleDateString("bn-BD")}
                        </div>
                        <button
                          onClick={() =>
                            setFreezeModal({
                              open: true,
                              lawyerId: f.lawyerId,
                              lawyerName: f.lawyerName || "",
                              action: "lift",
                            })
                          }
                          className="mt-2 px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                        >
                          প্রত্যাহার করুন
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "flags" && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">ফ্ল্যাগ ও সতর্কতা</h2>

            {data.activeFlags.length === 0 ? (
              <p className="text-muted-foreground">কোনো সক্রিয় ফ্ল্যাগ নেই।</p>
            ) : (
              <div className="space-y-2">
                {data.activeFlags.map((f) => (
                  <div
                    key={f.id}
                    className={`p-4 rounded-xl border ${
                      f.flagType === "red_flag"
                        ? "bg-red-50 border-red-300"
                        : f.flagType === "warning"
                          ? "bg-amber-50 border-amber-300"
                          : "bg-gray-50 border-gray-300"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 text-xs rounded ${
                              f.flagType === "red_flag"
                                ? "bg-red-500 text-white"
                                : f.flagType === "warning"
                                  ? "bg-amber-500 text-white"
                                  : "bg-gray-500 text-white"
                            }`}
                          >
                            {FLAG_TYPE_LABELS[f.flagType] || f.flagType}
                          </span>
                          <span className="font-medium">{f.lawyerName || f.lawyerId}</span>
                        </div>
                        {f.reasonDetail && <div className="text-sm mt-1">{f.reasonDetail}</div>}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">
                          জারি: {new Date(f.issuedAt).toLocaleDateString("bn-BD")}
                        </div>
                        {f.expiresAt && (
                          <div className="text-xs text-muted-foreground">
                            মেয়াদ: {new Date(f.expiresAt).toLocaleDateString("bn-BD")}
                          </div>
                        )}
                        <button
                          onClick={() => clearFlag(f.id)}
                          disabled={busy === f.id}
                          className="mt-2 px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                        >
                          {busy === f.id ? "..." : "প্রত্যাহার"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Show-Cause Modal */}
      {showCauseModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">কারণ দর্শাও নোটিশ জারি</h3>
            <p className="text-sm text-muted-foreground mb-4">
              আইনজীবী: <strong>{showCauseModal.lawyerName}</strong>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">কারণ</label>
                <select
                  value={showCauseForm.reasonCode}
                  onChange={(e) => setShowCauseForm({ ...showCauseForm, reasonCode: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {Object.entries(SHOW_CAUSE_REASONS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">বিস্তারিত</label>
                <textarea
                  value={showCauseForm.reasonDetail}
                  onChange={(e) => setShowCauseForm({ ...showCauseForm, reasonDetail: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="বিস্তারিত লিখুন..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowCauseModal(null)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-muted"
              >
                বাতিল
              </button>
              <button
                onClick={issueShowCause}
                disabled={busy === "show-cause"}
                className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                {busy === "show-cause" ? "..." : "নোটিশ জারি করুন"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Show-Cause Modal */}
      {resolveModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">নোটিশ নিষ্পত্তি</h3>
            <p className="text-sm text-muted-foreground mb-4">
              আইনজীবী: <strong>{resolveModal.lawyerName}</strong>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">সিদ্ধান্ত</label>
                <select
                  value={resolveForm.resolution}
                  onChange={(e) => setResolveForm({ ...resolveForm, resolution: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {Object.entries(RESOLUTION_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">নোট</label>
                <textarea
                  value={resolveForm.resolutionNote}
                  onChange={(e) => setResolveForm({ ...resolveForm, resolutionNote: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="সিদ্ধান্তের কারণ লিখুন..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setResolveModal(null)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-muted"
              >
                বাতিল
              </button>
              <button
                onClick={resolveShowCause}
                disabled={busy === "resolve"}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {busy === "resolve" ? "..." : "নিষ্পত্তি করুন"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Freeze/Lift Modal */}
      {freezeModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">
              {freezeModal.action === "freeze" ? "পেমেন্ট স্থগিত করুন" : "পেমেন্ট স্থগিত প্রত্যাহার করুন"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              আইনজীবী: <strong>{freezeModal.lawyerName}</strong>
            </p>

            <div>
              <label className="block text-sm font-medium mb-1">কারণ</label>
              <textarea
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder={freezeModal.action === "freeze" ? "স্থগিতের কারণ..." : "প্রত্যাহারের কারণ..."}
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setFreezeModal(null)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-muted"
              >
                বাতিল
              </button>
              <button
                onClick={handleFreeze}
                disabled={busy === "freeze" || !freezeReason.trim()}
                className={`px-4 py-2 text-sm rounded-lg disabled:opacity-50 ${
                  freezeModal.action === "freeze"
                    ? "bg-blue-500 text-white hover:bg-blue-600"
                    : "bg-green-500 text-white hover:bg-green-600"
                }`}
              >
                {busy === "freeze" ? "..." : freezeModal.action === "freeze" ? "স্থগিত করুন" : "প্রত্যাহার করুন"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Flag Modal */}
      {flagModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">ফ্ল্যাগ যোগ করুন</h3>
            <p className="text-sm text-muted-foreground mb-4">
              আইনজীবী: <strong>{flagModal.lawyerName}</strong>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">ধরন</label>
                <select
                  value={flagForm.flagType}
                  onChange={(e) => setFlagForm({ ...flagForm, flagType: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="warning">সতর্কতা</option>
                  <option value="red_flag">রেড ফ্ল্যাগ</option>
                  <option value="watch">পর্যবেক্ষণ</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">কারণ</label>
                <textarea
                  value={flagForm.reasonDetail}
                  onChange={(e) => setFlagForm({ ...flagForm, reasonDetail: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="ফ্ল্যাগের কারণ লিখুন..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setFlagModal(null)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-muted"
              >
                বাতিল
              </button>
              <button
                onClick={addFlag}
                disabled={busy === "flag" || !flagForm.reasonDetail.trim()}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {busy === "flag" ? "..." : "ফ্ল্যাগ যোগ করুন"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
