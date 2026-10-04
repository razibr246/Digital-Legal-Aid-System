"use client";

/**
 * The Chief DLAO console.
 *
 * Supervisory and approval-only, per the guide: the Chief certifies settlements, approves
 * payments, maintains the panel list and supervises the office, while day-to-day case work
 * sits with the Legal Aid Officer. So there is no case-editing control on this screen at
 * all — the officer supervision table is a read-only summary, and it says so.
 *
 * One component serves both role variants. The Chief *proposes* panel changes and the
 * Chairman *approves* them; misconduct is the committee's, so the Chief cannot action it.
 * Those differences come from `screen-guard`, not from a check written here.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ChiefRole = "chief" | "chairman";

type Certification = {
  caseId: string;
  ref: string;
  summary: string | null;
  district: string | null;
  mediationDate: string | null;
  signedA: boolean;
  signedB: boolean;
  signedC: boolean;
  canCertify: boolean;
  blockedReason: string | null;
  blockedNote: string | null;
};

type Payment = {
  id: string;
  caseId: string;
  ref: string;
  type: string;
  amount: number | null;
  note: string | null;
  requesterRole: string | null;
  requestedAt: string;
  ageDays: number;
  district: string | null;
};

type Officer = {
  id: string;
  name: string;
  role: string | null;
  handled: number;
  openCases: number;
};

type PanelLawyer = {
  id: string;
  userId: string | null;
  barId: string | null;
  name: string | null;
  phone: string | null;
  specialization: string | null;
  district: string | null;
  status: string | null;
  approvedAt: string | null;
};

type Case = {
  id: string;
  ref: string | null;
  status: string | null;
  stage: string | null;
  problem: string | null;
  district: string | null;
  applicantName: string | null;
  phone: string | null;
  priority: string | null;
  severity: string | null;
  category: string | null;
  createdAt: string | null;
  assignedLawyerId: string | null;
  assignedLawyerName: string | null;
};

type LawyerComplaint = {
  id: string;
  caseId: string | null;
  lawyerId: string | null;
  citizenId: string | null;
  reasonCode: string;
  details: string | null;
  status: string;
  createdAt: string;
  caseRef: string | null;
  caseDistrict: string | null;
  lawyerName: string | null;
  lawyerPhone: string | null;
  citizenName: string | null;
  citizenPhone: string | null;
};

type AuditEntry = {
  id: string;
  kind: string;
  refId: string | null;
  actorId: string | null;
  actorRole: string | null;
  detail: string | null;
  reason: string | null;
  at: string;
  actorName: string | null;
  refLabel: string | null;
};

type ChiefData = {
  role: ChiefRole;
  permissions: {
    proposePanelChanges: boolean;
    approvePanelChanges: boolean;
    actionMisconduct: boolean;
  };
  kpis: {
    pendingCertifications: number;
    certificationsBlocked: number;
    panelLawyers: number;
    openMisconduct: number;
    pendingPayments: number;
    casesHandled: number;
  };
  slaWarning: number;
  slaBreaches: number;
  certifications: Certification[];
  payments: Payment[];
  officers: Officer[];
  panelLawyers: PanelLawyer[];
  cases: Case[];
  districts: string[];
  emergencyByDay: { day: string; count: number }[];
  lawyerComplaints: LawyerComplaint[];
  audit: {
    entries: AuditEntry[];
    counts: Record<string, number>;
    totalLast7Days: number;
  };
};

const TABS = [
  { id: "overview", label: "সারসংক্ষেপ" },
  { id: "complaints", label: "অভিযোগ" },
  { id: "cases", label: "সব মামলা" },
  { id: "certify", label: "প্রত্যায়ন" },
  { id: "payments", label: "পেমেন্ট অনুমোদন" },
  { id: "panel", label: "প্যানেল তালিকা" },
  { id: "officers", label: "অফিসার" },
  { id: "misconduct", label: "অসদাচরণ" },
  { id: "audit", label: "অডিট ট্রেইল" },
] as const;

/** Bangla labels for complaint reason codes */
const COMPLAINT_REASON_LABELS: Record<string, string> = {
  not_contacted: "আইনজীবী যোগাযোগ করেননি",
  too_slow: "অনেক দেরিতে কাজ হচ্ছে",
  not_listening: "আমার কথা ভালোভাবে শোনেন না",
  unprofessional: "আচরণ পেশাদার নয়",
  demanded_money: "অর্থ চেয়েছেন",
  refused_after_assignment: "নিয়োগের পর কাজ করতে অস্বীকার করেছেন",
  other: "অন্য কোনো কারণ",
};

type TabId = (typeof TABS)[number]["id"];

/** Bangla labels for audit event kinds */
const AUDIT_KIND_LABELS: Record<string, string> = {
  "auth.login": "লগইন",
  "auth.login_failed": "লগইন ব্যর্থ",
  "auth.logout": "লগআউট",
  "auth.session_denied": "অ্যাক্সেস প্রত্যাখ্যান",
  "user.create": "ব্যবহারকারী তৈরি",
  "user.role_changed": "ভূমিকা পরিবর্তন",
  "user.status_changed": "স্ট্যাটাস পরিবর্তন",
  "user.pin_reset": "পিন রিসেট",
  "case.create": "কেস তৈরি",
  "case.stage_changed": "কেস স্তর পরিবর্তন",
  "case.viewed_sensitive": "সংবেদনশীল তথ্য দেখা",
  "case.note_added": "নোট যোগ",
  "application.filed": "আবেদন দাখিল",
  "consultation.started": "পরামর্শ শুরু",
  "consultation.viewed": "পরামর্শ দেখা",
  "eligibility.decided": "যোগ্যতা সিদ্ধান্ত",
  "lawyer.assign": "আইনজীবী নিয়োগ",
  "lawyer.reassign": "আইনজীবী পুনঃনিয়োগ",
  "complaint.filed": "অভিযোগ দাখিল",
  "complaint.resolved": "অভিযোগ নিষ্পত্তি",
  "payment.approved": "পেমেন্ট অনুমোদন",
  "mediation.scheduled": "মধ্যস্থতা নির্ধারিত",
  "settlement.certified": "নিষ্পত্তি প্রত্যায়িত",
  "settlement.signed": "নিষ্পত্তিতে স্বাক্ষর",
  "settlement.drafted": "নিষ্পত্তির প্রস্তাবি",
  "message.queued": "বার্তা সারিবদ্ধ",
  "message.blocked": "বার্তা ব্লক",
  "admin.audit_viewed": "অডিট দেখা",
  "admin.roster_seeded": "রোস্টার সিড",
  "admin.config_changed": "কনফিগ পরিবর্তন",
};

export default function ChiefConsole() {
  const router = useRouter();
  const [data, setData] = useState<ChiefData | null>(null);
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [selectedAudit, setSelectedAudit] = useState<AuditEntry | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [caseFilters, setCaseFilters] = useState({
    district: "",
    stage: "",
    severity: "",
    search: "",
  });
  const [lawyerSearch, setLawyerSearch] = useState("");
  const [officerSearch, setOfficerSearch] = useState("");
  const [complaintModal, setComplaintModal] = useState<{
    open: boolean;
    complaint: LawyerComplaint | null;
    action: "resolve" | "reject" | "escalate" | null;
  }>({ open: false, complaint: null, action: null });
  const [complaintNote, setComplaintNote] = useState("");
  const [assignModal, setAssignModal] = useState<{
    open: boolean;
    type: "lawyer" | "officer" | null;
    caseId?: string;
    lawyerId?: string;
    officerId?: string;
  }>({ open: false, type: null });

  const load = useCallback(async () => {
    const res = await fetch("/api/chief", { cache: "no-store" });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) return;
    setData((await res.json()) as ChiefData);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (action: string, id: string, reason?: string) => {
      setBusy(id);
      setToast(null);
      const res = await fetch("/api/chief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id, reason }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, string>;
      setBusy(null);

      if (res.ok) {
        setToast({ tone: "ok", text: "সিদ্ধান্ত নথিভুক্ত হয়েছে।" });
        setReasons((prev) => ({ ...prev, [id]: "" }));
        await load();
        return;
      }
      // The server re-checks the rule, so a 409 here is the gate speaking, not a bug.
      // Showing its note is the whole point — it names the party that is outstanding.
      setToast({
        tone: "warn",
        text:
          body.note ||
          (body.error === "reason_required"
            ? "খালিস্তা বা প্রত্যাখ্যাত হলে কারণ লিখতে হবে।"
            : body.error === "already_decided"
              ? "এই আবেদনটি ইতিমধ্যে সিদ্ধান্ত হয়েছে।"
              : "কাজটি সম্পন্ন হয়নি।"),
      });
    },
    [load],
  );

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch {
      setLoggingOut(false);
    }
  }, [router]);

  const handleAssign = useCallback(async () => {
    if (!assignModal.type || !assignModal.caseId) return;
    setBusy("assign");
    setToast(null);

    const body: Record<string, string> = { caseId: assignModal.caseId };
    if (assignModal.type === "lawyer" && assignModal.lawyerId) {
      body.action = "assign_lawyer";
      body.lawyerId = assignModal.lawyerId;
    } else if (assignModal.type === "officer" && assignModal.officerId) {
      body.action = "assign_officer";
      body.officerId = assignModal.officerId;
    } else {
      setBusy(null);
      setToast({ tone: "warn", text: "দয়া করে একটি নির্বাচন করুন।" });
      return;
    }

    const res = await fetch("/api/chief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);

    if (res.ok) {
      setToast({ tone: "ok", text: assignModal.type === "lawyer" ? "আইনজীবী নিয়োগ সম্পন্ন!" : "অফিসার দায়িত্ব দেওয়া হয়েছে!" });
      setAssignModal({ open: false, type: null });
      await load();
    } else {
      setToast({ tone: "warn", text: "কাজটি সম্পন্ন হয়নি।" });
    }
  }, [assignModal, load]);

  const handleComplaintAction = useCallback(async () => {
    if (!complaintModal.complaint || !complaintModal.action) return;

    if (complaintModal.action !== "escalate" && !complaintNote.trim()) {
      setToast({ tone: "warn", text: "অনুগ্রহ করে নোট লিখুন।" });
      return;
    }

    setBusy("complaint");
    setToast(null);

    const actionMap = {
      resolve: "complaint_resolve",
      reject: "complaint_reject",
      escalate: "complaint_escalate",
    };

    const res = await fetch("/api/chief", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: actionMap[complaintModal.action],
        id: complaintModal.complaint.id,
        resolutionNote: complaintNote || "কমিটিতে প্রেরণ",
      }),
    });
    setBusy(null);

    if (res.ok) {
      const messages = {
        resolve: "অভিযোগ সমাধান করা হয়েছে!",
        reject: "অভিযোগ প্রত্যাখ্যান করা হয়েছে!",
        escalate: "অভিযোগ কমিটিতে প্রেরণ করা হয়েছে!",
      };
      setToast({ tone: "ok", text: messages[complaintModal.action] });
      setComplaintModal({ open: false, complaint: null, action: null });
      setComplaintNote("");
      await load();
    } else {
      setToast({ tone: "warn", text: "কাজটি সম্পন্ন হয়নি।" });
    }
  }, [complaintModal, complaintNote, load]);

  if (denied) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-red-700">অনুমতি নেই</h1>
        <p className="mt-2 text-slate-600">
          এই কনসোল শুধুমাত্র চীফ লিগ্যাল এইড অফিসার বা জেলা কমিটির চেয়ারম্যানের জন্য।
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-6 rounded-lg border border-slate-300 px-4 py-2 text-sm"
        >
          ফিরে যান
        </button>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-sm text-slate-500">লোড হচ্ছে…</p>
      </main>
    );
  }

  const isChairman = data.role === "chairman";

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="border-b border-slate-200 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">চীফ লিগ্যাল এইড অফিসার কনসোল</h1>
            <p className="mt-1 text-sm text-slate-600">
              আপনি সালিশকরণ প্রত্যায়ন করেন, প্যানেল আইনজীবী তালিকা রক্ষণাবেক্ষণ করেন এবং অফিস পরিদর্শন করেন।
              দৈনন্দিন মামলার কাজ লিগ্যাল এইড অফিসারের।
            </p>
            <p className="mt-1 text-xs text-slate-500">
              ভূমিকা: {isChairman ? "জেলা কমিটির চেয়ারম্যান" : "চীফ লিগ্যাল এইড অফিসার"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/chief/lawyer-rating-monitor"
              className="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              আইনজীবী মনিটর
            </a>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loggingOut ? "..." : "লগ আউট"}
            </button>
          </div>
        </div>
      </header>

      {(data.slaWarning > 0 || data.slaBreaches > 0) && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {data.slaBreaches > 0
            ? `⚠ ${data.slaBreaches} টি পেমেন্ট অনুমোদন SLA উত্তীর্ণ করেছে।`
            : `⚠ ${data.slaWarning} টি পেমেন্ট অনুমোদন SLA-র কাছাকাছি (২ দিন বাকি)।`}
        </p>
      )}

      {/* Red danger banner for lawyer complaints */}
      {data.lawyerComplaints.length > 0 && (
        <div className="mt-4 rounded-xl border-2 border-red-400 bg-gradient-to-r from-red-50 to-red-100 p-4 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-2xl text-white shadow-md">
              🚨
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-red-800">
                  আইনজীবী সংক্রান্ত অভিযোগ
                </h2>
                <span className="rounded-full bg-red-500 px-3 py-1 text-sm font-bold text-white">
                  {data.lawyerComplaints.length} টি খোলা
                </span>
              </div>
              <p className="mt-1 text-sm text-red-700">
                নাগরিকদের কাছ থেকে প্যানেল আইনজীবীদের বিরুদ্ধে অভিযোগ এসেছে। অনুগ্রহ করে পর্যালোচনা করুন।
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {data.lawyerComplaints.slice(0, 3).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setComplaintModal({ open: true, complaint: c, action: null })}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
                  >
                    <span className="font-semibold">{c.lawyerName || "আইনজীবী"}</span>
                    <span className="text-red-400">•</span>
                    <span>{COMPLAINT_REASON_LABELS[c.reasonCode] || c.reasonCode}</span>
                  </button>
                ))}
                {data.lawyerComplaints.length > 3 && (
                  <button
                    onClick={() => setTab("complaints")}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                  >
                    সব দেখুন ({data.lawyerComplaints.length})
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <p
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            toast.tone === "ok"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          {toast.text}
        </p>
      )}

      <nav className="mt-5 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-3 py-2 text-sm ${
              tab === t.id
                ? "border border-b-0 border-slate-300 bg-white font-medium"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <section className="mt-6">
          {/* Modern KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon="📋"
              label="অপেক্ষমাণ প্রত্যায়ন"
              value={data.kpis.pendingCertifications}
              sub={`${data.kpis.certificationsBlocked} টি অসম্পূর্ণ স্বাক্ষর`}
              color="blue"
            />
            <Kpi
              icon="⚖️"
              label="প্যানেল আইনজীবী"
              value={data.kpis.panelLawyers}
              sub="মাস্টার তালিকা"
              color="emerald"
            />
            <Kpi
              icon="✅"
              label="এই মাসে নিষ্পত্তি"
              value={data.kpis.casesHandled}
              sub="সব অফিসার মিলিয়ে"
              color="violet"
            />
            <Kpi
              icon="⚠️"
              label="অসদাচরণ তদন্ত"
              value={data.kpis.openMisconduct}
              sub={data.permissions.actionMisconduct ? "কমিটি আধিপত্যায়ী" : "শুধু কমিটি"}
              color="amber"
            />
          </div>

          {/* Quick Stats Row */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-xl">
                💰
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{data.kpis.pendingPayments}</p>
                <p className="text-xs text-slate-500">পেমেন্ট অপেক্ষমাণ</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl">
                📊
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{data.audit.totalLast7Days}</p>
                <p className="text-xs text-slate-500">৭ দিনে কার্যক্রম</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-xl">
                👥
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{data.officers.length}</p>
                <p className="text-xs text-slate-500">সক্রিয় অফিসার</p>
              </div>
            </div>
          </div>

          {/* Officer Activity Section */}
          <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-800">অফিসার কার্যক্রম</h2>
                  <p className="text-xs text-slate-500">
                    রিয়েল-টাইম পারফরম্যান্স ওভারভিউ
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  শুধুমাত্র পরিদর্শন
                </span>
              </div>
            </div>

            {data.officers.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">
                  👤
                </div>
                <p className="text-sm text-slate-500">কোনো সক্রিয় অফিসার নেই</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.officers.map((o, idx) => (
                  <div key={o.id} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-sm font-bold text-white">
                      {o.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-slate-800">{o.name}</p>
                      <p className="text-xs text-slate-500">{o.role || "লিগ্যাল এইড অফিসার"}</p>
                    </div>
                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <p className="text-lg font-semibold text-emerald-600">{o.handled}</p>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">নিষ্পত্তি</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-blue-600">{o.openCases}</p>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">চলমান</p>
                      </div>
                      {idx === 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          শীর্ষ
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity Preview */}
          {data.audit.entries.length > 0 && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-800">সাম্প্রতিক কার্যক্রম</h2>
                  <button
                    onClick={() => setTab("audit")}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    সব দেখুন →
                  </button>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {data.audit.entries.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm">
                      {entry.kind.includes("login") ? "🔐" :
                       entry.kind.includes("case") ? "📁" :
                       entry.kind.includes("payment") ? "💳" :
                       entry.kind.includes("lawyer") ? "⚖️" : "📝"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm text-slate-700">
                        {AUDIT_KIND_LABELS[entry.kind] ?? entry.kind}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {entry.actorName || entry.actorRole || "সিস্টেম"}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(entry.at).toLocaleTimeString("bn-BD", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Emergency Cases Analytics - 28 Days */}
          <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-800">জরুরি মামলার প্রবণতা</h2>
                  <p className="text-xs text-slate-500">গত ২৮ দিন</p>
                </div>
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                  {data.emergencyByDay.reduce((sum, d) => sum + d.count, 0)} টি জরুরি
                </span>
              </div>
            </div>
            <div className="p-5">
              {(() => {
                const maxCount = Math.max(1, ...data.emergencyByDay.map((d) => d.count));
                return (
                  <div className="flex items-end justify-between gap-1" style={{ height: 120 }}>
                    {data.emergencyByDay.map((d, idx) => {
                      const height = (d.count / maxCount) * 100;
                      const isToday = idx === data.emergencyByDay.length - 1;
                      return (
                        <div
                          key={d.day}
                          className="group relative flex-1"
                          style={{ height: "100%" }}
                        >
                          <div
                            className={`absolute bottom-0 w-full rounded-t transition-all ${
                              d.count === 0
                                ? "bg-slate-100"
                                : isToday
                                  ? "bg-gradient-to-t from-red-500 to-red-400"
                                  : "bg-gradient-to-t from-red-300 to-red-200 group-hover:from-red-400 group-hover:to-red-300"
                            }`}
                            style={{ height: `${Math.max(4, height)}%` }}
                          />
                          {/* Tooltip */}
                          <div className="pointer-events-none absolute -top-10 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white group-hover:block">
                            {new Date(d.day).toLocaleDateString("bn-BD", { day: "numeric", month: "short" })}: {d.count}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {/* X-axis labels */}
              <div className="mt-2 flex justify-between text-[10px] text-slate-400">
                <span>{new Date(data.emergencyByDay[0]?.day).toLocaleDateString("bn-BD", { day: "numeric", month: "short" })}</span>
                <span>আজ</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === "complaints" && (
        <section className="mt-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-red-800">আইনজীবী সংক্রান্ত অভিযোগ</h2>
            <p className="text-xs text-slate-500">
              নাগরিকদের কাছ থেকে প্যানেল আইনজীবীদের বিরুদ্ধে অভিযোগ
            </p>
          </div>

          {data.lawyerComplaints.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl">
                ✓
              </div>
              <p className="text-sm text-slate-500">কোনো খোলা অভিযোগ নেই</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.lawyerComplaints.map((complaint) => (
                <div
                  key={complaint.id}
                  className="rounded-xl border-2 border-red-200 bg-white p-4 transition-all hover:border-red-300 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-lg">
                          ⚠️
                        </div>
                        <div>
                          <p className="font-semibold text-red-800">
                            {complaint.lawyerName || "আইনজীবী"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {complaint.lawyerPhone || "ফোন নেই"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-lg bg-red-50 p-3">
                        <p className="text-sm font-medium text-red-700">
                          {COMPLAINT_REASON_LABELS[complaint.reasonCode] || complaint.reasonCode}
                        </p>
                        {complaint.details && (
                          <p className="mt-1 text-sm text-slate-600">{complaint.details}</p>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                        <span>📋 মামলা: {complaint.caseRef || complaint.caseId?.slice(0, 8) || "—"}</span>
                        <span>📍 জেলা: {complaint.caseDistrict || "—"}</span>
                        <span>👤 অভিযোগকারী: {complaint.citizenName || "—"}</span>
                        <span>📞 {complaint.citizenPhone || "—"}</span>
                        <span>🕐 {new Date(complaint.createdAt).toLocaleDateString("bn-BD")}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => setComplaintModal({ open: true, complaint, action: "resolve" })}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        ✓ সমাধান
                      </button>
                      <button
                        onClick={() => setComplaintModal({ open: true, complaint, action: "reject" })}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        ✗ প্রত্যাখ্যান
                      </button>
                      <button
                        onClick={() => setComplaintModal({ open: true, complaint, action: "escalate" })}
                        className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700"
                      >
                        ⚡ কমিটিতে প্রেরণ
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "certify" && (
        <section className="mt-5 space-y-3">
          <p className="text-sm text-slate-600">
            তিন পক্ষ — আবেদনকারী, বিপরীত পক্ষ ও মধ্যস্থতাকারী — সবাই স্বাক্ষর করলেই কেবল প্রত্যায়ন করা যাবে।
          </p>
          {data.certifications.length === 0 && (
            <p className="text-sm text-slate-500">অপেক্ষমাণ সালিশ নেই।</p>
          )}
          {data.certifications.map((c) => (
            <article key={c.caseId} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {c.ref}
                    {c.district ? ` · ${c.district}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{c.summary}</p>
                </div>
                <button
                  disabled={!c.canCertify || busy === c.caseId}
                  onClick={() => void act("certify", c.caseId)}
                  title={c.blockedNote ?? undefined}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {busy === c.caseId ? "…" : "প্রত্যায়ন"}
                </button>
              </div>
              <ul className="mt-3 flex flex-wrap gap-3 text-xs">
                <Sign ok={c.signedA} label="আবেদনকারী" />
                <Sign ok={c.signedB} label="বিপরীত পক্ষ" />
                <Sign ok={c.signedC} label="মধ্যস্থতাকারী" />
              </ul>
              {!c.canCertify && c.blockedNote && (
                <p className="mt-2 text-xs text-amber-800">{c.blockedNote}</p>
              )}
            </article>
          ))}
        </section>
      )}

      {tab === "payments" && (
        <section className="mt-5 space-y-3">
          {data.payments.length === 0 && (
            <p className="text-sm text-slate-500">অপেক্ষমাণ পেমেন্ট অনুরোধ নেই।</p>
          )}
          {data.payments.map((p) => (
            <article key={p.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {p.ref} · {p.type} · ৳{p.amount ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    অনুরোধকারী {p.requesterRole ?? "—"} · {p.ageDays} দিন আগে
                  </p>
                  {p.note && <p className="mt-1 text-sm text-slate-600">{p.note}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busy === p.id}
                    onClick={() => void act("payment_approve", p.id)}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white disabled:bg-slate-300"
                  >
                    অনুমোদন
                  </button>
                  <button
                    disabled={busy === p.id || !reasons[p.id]?.trim()}
                    onClick={() => void act("payment_reject", p.id, reasons[p.id])}
                    className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 disabled:text-slate-400"
                  >
                    প্রত্যাখ্যান
                  </button>
                </div>
              </div>
              {/* A rejection must carry a reason, so the button stays dead until there is
                  one. The server enforces the same rule. */}
              <input
                value={reasons[p.id] ?? ""}
                onChange={(e) => setReasons((prev) => ({ ...prev, [p.id]: e.target.value }))}
                placeholder="প্রত্যাখ্যাত হলে কারণ লিখুন"
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </article>
          ))}
        </section>
      )}

      {tab === "panel" && (
        <section className="mt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">প্যানেল আইনজীবী</h2>
              <p className="text-xs text-slate-500">
                মাস্টার তালিকায় {data.kpis.panelLawyers} জন আইনজীবী আছেন
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
              {isChairman ? "অনুমোদনকারী" : "প্রস্তাবকারী"}
            </span>
          </div>

          {/* Search bar */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="নাম, বার আইডি বা জেলা খুঁজুন..."
              value={lawyerSearch}
              onChange={(e) => setLawyerSearch(e.target.value)}
              className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400"
            />
          </div>

          {(() => {
            const filteredLawyers = data.panelLawyers.filter((l) => {
              if (!lawyerSearch) return true;
              const search = lawyerSearch.toLowerCase();
              return (
                l.name?.toLowerCase().includes(search) ||
                l.barId?.toLowerCase().includes(search) ||
                l.district?.toLowerCase().includes(search) ||
                l.specialization?.toLowerCase().includes(search)
              );
            });

            if (filteredLawyers.length === 0) {
              return (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">
                    ⚖️
                  </div>
                  <p className="text-sm text-slate-500">
                    {lawyerSearch ? "কোনো আইনজীবী পাওয়া যায়নি" : "প্যানেলে কোনো আইনজীবী নেই"}
                  </p>
                </div>
              );
            }

            return (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-600">
                      <th className="px-4 py-3">আইনজীবী</th>
                      <th className="px-4 py-3">বার আইডি</th>
                      <th className="px-4 py-3">বিশেষত্ব</th>
                      <th className="px-4 py-3">জেলা</th>
                      <th className="px-4 py-3">স্ট্যাটাস</th>
                      <th className="px-4 py-3">নিয়োগ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLawyers.map((lawyer) => (
                      <tr key={lawyer.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-sm font-bold text-white">
                              {(lawyer.name || "?").charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-slate-800">{lawyer.name || "—"}</p>
                              <p className="text-xs text-slate-400">{lawyer.phone || ""}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {lawyer.barId || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {lawyer.specialization || "সাধারণ"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {lawyer.district || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            lawyer.status === "on_panel" || lawyer.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : lawyer.status === "pending" || lawyer.status === "proposed"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                          }`}>
                            {lawyer.status === "on_panel" || lawyer.status === "active" ? "সক্রিয়" : lawyer.status === "pending" || lawyer.status === "proposed" ? "অপেক্ষমাণ" : lawyer.status || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {(lawyer.status === "on_panel" || lawyer.status === "active") && (
                            <button
                              onClick={() =>
                                setAssignModal({ open: true, type: "lawyer", lawyerId: lawyer.id })
                              }
                              className="rounded bg-blue-100 px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-200"
                              title="মামলায় নিয়োগ করুন"
                            >
                              📋 মামলায় নিয়োগ
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </section>
      )}

      {tab === "officers" && (
        <section className="mt-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">অফিসার তালিকা</h2>
            <p className="text-xs text-slate-500">
              সক্রিয় লিগ্যাল এইড অফিসার এবং তাদের কার্যক্রম
            </p>
          </div>

          {/* Search bar */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="নাম বা ভূমিকা খুঁজুন..."
              value={officerSearch}
              onChange={(e) => setOfficerSearch(e.target.value)}
              className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400"
            />
          </div>

          {(() => {
            const filteredOfficers = data.officers.filter((o) => {
              if (!officerSearch) return true;
              const search = officerSearch.toLowerCase();
              return (
                o.name?.toLowerCase().includes(search) ||
                o.role?.toLowerCase().includes(search)
              );
            });

            if (filteredOfficers.length === 0) {
              return (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">
                    👤
                  </div>
                  <p className="text-sm text-slate-500">
                    {officerSearch ? "কোনো অফিসার পাওয়া যায়নি" : "কোনো সক্রিয় অফিসার নেই"}
                  </p>
                </div>
              );
            }

            return (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-600">
                      <th className="px-4 py-3">অফিসার</th>
                      <th className="px-4 py-3">ভূমিকা</th>
                      <th className="px-4 py-3 text-center">নিষ্পত্তি</th>
                      <th className="px-4 py-3 text-center">চলমান</th>
                      <th className="px-4 py-3">পারফরম্যান্স</th>
                      <th className="px-4 py-3">নিয়োগ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOfficers.map((officer, idx) => (
                      <tr key={officer.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-sm font-bold text-white">
                              {officer.name.charAt(0)}
                            </div>
                            <p className="font-medium text-slate-800">{officer.name}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {officer.role || "লিগ্যাল এইড অফিসার"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-lg font-semibold text-emerald-600">{officer.handled}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-lg font-semibold text-blue-600">{officer.openCases}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                                style={{ width: `${Math.min(100, (officer.handled / Math.max(1, filteredOfficers[0]?.handled || 1)) * 100)}%` }}
                              />
                            </div>
                            {idx === 0 && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                শীর্ষ
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() =>
                              setAssignModal({ open: true, type: "officer", officerId: officer.id })
                            }
                            className="rounded bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-200"
                            title="মামলা দায়িত্ব দিন"
                          >
                            📋 মামলা দায়িত্ব
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </section>
      )}

      {tab === "cases" && (
        <section className="mt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">সব মামলা</h2>
              <p className="text-xs text-slate-500">
                {data.cases.length} টি মামলা পাওয়া গেছে
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="নাম বা রেফারেন্স খুঁজুন..."
              value={caseFilters.search}
              onChange={(e) => setCaseFilters((f) => ({ ...f, search: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400"
            />
            <select
              value={caseFilters.district}
              onChange={(e) => setCaseFilters((f) => ({ ...f, district: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">সব জেলা</option>
              {data.districts.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select
              value={caseFilters.stage}
              onChange={(e) => setCaseFilters((f) => ({ ...f, stage: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">সব স্তর</option>
              <option value="intake">গ্রহণ</option>
              <option value="screening">স্ক্রিনিং</option>
              <option value="mediation">মধ্যস্থতা</option>
              <option value="advocacy">আইনি সহায়তা</option>
              <option value="settled">নিষ্পত্তি</option>
              <option value="closed">বন্ধ</option>
            </select>
            <select
              value={caseFilters.severity}
              onChange={(e) => setCaseFilters((f) => ({ ...f, severity: e.target.value }))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">সব জরুরিতা</option>
              <option value="emergency">জরুরি</option>
              <option value="high">উচ্চ</option>
              <option value="medium">মধ্যম</option>
              <option value="low">নিম্ন</option>
            </select>
            {(caseFilters.search || caseFilters.district || caseFilters.stage || caseFilters.severity) && (
              <button
                onClick={() => setCaseFilters({ district: "", stage: "", severity: "", search: "" })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                ফিল্টার মুছুন
              </button>
            )}
          </div>

          {(() => {
            const filtered = data.cases.filter((c) => {
              if (caseFilters.district && c.district !== caseFilters.district) return false;
              if (caseFilters.stage && c.stage !== caseFilters.stage) return false;
              if (caseFilters.severity && c.severity !== caseFilters.severity) return false;
              if (caseFilters.search) {
                const search = caseFilters.search.toLowerCase();
                const match =
                  (c.ref?.toLowerCase().includes(search)) ||
                  (c.applicantName?.toLowerCase().includes(search)) ||
                  (c.problem?.toLowerCase().includes(search));
                if (!match) return false;
              }
              return true;
            });

            if (filtered.length === 0) {
              return (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">
                    📁
                  </div>
                  <p className="text-sm text-slate-500">কোনো মামলা পাওয়া যায়নি</p>
                </div>
              );
            }

            return (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-600">
                      <th className="px-4 py-3">রেফারেন্স</th>
                      <th className="px-4 py-3">আবেদনকারী</th>
                      <th className="px-4 py-3">জেলা</th>
                      <th className="px-4 py-3">স্তর</th>
                      <th className="px-4 py-3">জরুরিতা</th>
                      <th className="px-4 py-3">ক্যাটাগরি</th>
                      <th className="px-4 py-3">তারিখ</th>
                      <th className="px-4 py-3">নিয়োগ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((c) => (
                      <tr key={c.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-medium text-blue-600">
                            {c.ref || c.id.slice(0, 8)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-slate-800">{c.applicantName || "—"}</p>
                            <p className="truncate text-xs text-slate-400" style={{ maxWidth: 200 }}>
                              {c.problem || ""}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{c.district || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            c.stage === "settled" ? "bg-emerald-100 text-emerald-700" :
                            c.stage === "closed" ? "bg-slate-100 text-slate-600" :
                            c.stage === "mediation" ? "bg-blue-100 text-blue-700" :
                            c.stage === "advocacy" ? "bg-violet-100 text-violet-700" :
                            "bg-amber-100 text-amber-700"
                          }`}>
                            {c.stage === "intake" ? "গ্রহণ" :
                             c.stage === "screening" ? "স্ক্রিনিং" :
                             c.stage === "mediation" ? "মধ্যস্থতা" :
                             c.stage === "advocacy" ? "আইনি সহায়তা" :
                             c.stage === "settled" ? "নিষ্পত্তি" :
                             c.stage === "closed" ? "বন্ধ" : c.stage || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            c.severity === "emergency" ? "bg-red-100 text-red-700" :
                            c.severity === "high" ? "bg-orange-100 text-orange-700" :
                            c.severity === "medium" ? "bg-yellow-100 text-yellow-700" :
                            "bg-slate-100 text-slate-600"
                          }`}>
                            {c.severity === "emergency" ? "জরুরি" :
                             c.severity === "high" ? "উচ্চ" :
                             c.severity === "medium" ? "মধ্যম" :
                             c.severity === "low" ? "নিম্ন" : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {c.category || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {c.createdAt ? new Date(c.createdAt).toLocaleDateString("bn-BD") : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {c.assignedLawyerId ? (
                              <span
                                className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-700"
                                title={c.assignedLawyerName || "নিয়োগকৃত"}
                              >
                                ✓ আইনজীবী নিয়োগকৃত
                              </span>
                            ) : (
                              <button
                                onClick={() =>
                                  setAssignModal({ open: true, type: "lawyer", caseId: c.id })
                                }
                                className="rounded bg-amber-100 px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-200"
                                title="আইনজীবী নিয়োগ করুন"
                              >
                                ⚖️ আইনজীবী
                              </button>
                            )}
                            <button
                              onClick={() =>
                                setAssignModal({ open: true, type: "officer", caseId: c.id })
                              }
                              className="rounded bg-blue-100 px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-200"
                              title="অফিসার দায়িত্ব দিন"
                            >
                              👤 অফিসার
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </section>
      )}

      {tab === "misconduct" && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold">অসদাচরণ</h2>
          <p className="mt-1 text-sm text-slate-600">
            {data.kpis.openMisconduct} টি তদন্ত চলছে।
          </p>
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {data.permissions.actionMisconduct
              ? "অসদাচরণের সিদ্ধান্ত জেলা কমিটির।"
              : "অসদাচরণের সিদ্ধান্ত কমিটির আধিপত্য — চীফ এককভাবে ব্যবস্থা নিতে পারেন না।"}
          </p>
        </section>
      )}

      {tab === "audit" && (
        <section className="mt-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">অডিট ট্রেইল</h2>
              <p className="text-xs text-slate-500">
                গত ৭ দিনে {data.audit.totalLast7Days} টি কার্যক্রম রেকর্ড হয়েছে
              </p>
            </div>
          </div>

          {data.audit.entries.length === 0 ? (
            <p className="text-sm text-slate-500">কোনো অডিট রেকর্ড নেই।</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-600">
                    <th className="px-3 py-2">সময়</th>
                    <th className="px-3 py-2">কার্যক্রম</th>
                    <th className="px-3 py-2">ব্যবহারকারী</th>
                    <th className="px-3 py-2">বিবরণ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.audit.entries.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() => setSelectedAudit(entry)}
                      className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50"
                    >
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {new Date(entry.at).toLocaleString("bn-BD", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {AUDIT_KIND_LABELS[entry.kind] ?? entry.kind}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {entry.actorName || entry.actorRole || "সিস্টেম"}
                      </td>
                      <td className="max-w-xs truncate px-3 py-2 text-slate-600">
                        {entry.detail || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Audit Detail Popup */}
      {selectedAudit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedAudit(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-semibold">অডিট বিস্তারিত</h3>
              <button
                onClick={() => setSelectedAudit(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">কার্যক্রম</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {AUDIT_KIND_LABELS[selectedAudit.kind] ?? selectedAudit.kind}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">সময়</p>
                  <p className="mt-1 text-sm text-slate-800">
                    {new Date(selectedAudit.at).toLocaleString("bn-BD", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">ব্যবহারকারী</p>
                  <p className="mt-1 text-sm text-slate-800">
                    {selectedAudit.actorName || selectedAudit.actorRole || "সিস্টেম"}
                  </p>
                </div>
              </div>

              {selectedAudit.actorRole && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">ভূমিকা</p>
                  <p className="mt-1 text-sm text-slate-800">{selectedAudit.actorRole}</p>
                </div>
              )}

              {selectedAudit.detail && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">বিবরণ</p>
                  <p className="mt-1 text-sm text-slate-800">{selectedAudit.detail}</p>
                </div>
              )}

              {selectedAudit.reason && (
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-700">কারণ</p>
                  <p className="mt-1 text-sm text-amber-900">{selectedAudit.reason}</p>
                </div>
              )}

              {selectedAudit.refId && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">রেফারেন্স ID</p>
                  <p className="mt-1 font-mono text-xs text-slate-600">
                    {selectedAudit.refLabel || selectedAudit.refId}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedAudit(null)}
              className="mt-5 w-full rounded-lg bg-slate-800 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {assignModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setAssignModal({ open: false, type: null })}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-semibold">
                {assignModal.type === "lawyer" ? "আইনজীবী নিয়োগ" : "অফিসার দায়িত্ব"}
              </h3>
              <button
                onClick={() => setAssignModal({ open: false, type: null })}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Case Selection - only if not pre-selected */}
              {!assignModal.caseId && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">মামলা নির্বাচন করুন</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={assignModal.caseId || ""}
                    onChange={(e) => setAssignModal((m) => ({ ...m, caseId: e.target.value }))}
                  >
                    <option value="">-- মামলা বাছুন --</option>
                    {data.cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.ref || c.id.slice(0, 8)} - {c.applicantName || c.district || "—"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Selected Case Display */}
              {assignModal.caseId && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">নির্বাচিত মামলা</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {data.cases.find((c) => c.id === assignModal.caseId)?.ref ||
                      assignModal.caseId.slice(0, 8)}
                  </p>
                </div>
              )}

              {/* Lawyer Selection */}
              {assignModal.type === "lawyer" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">আইনজীবী নির্বাচন করুন</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={assignModal.lawyerId || ""}
                    onChange={(e) => setAssignModal((m) => ({ ...m, lawyerId: e.target.value }))}
                  >
                    <option value="">-- আইনজীবী বাছুন --</option>
                    {data.panelLawyers
                      .filter((l) => l.status === "on_panel" || l.status === "active")
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name || "—"} ({l.district || "—"})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Officer Selection */}
              {assignModal.type === "officer" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">অফিসার নির্বাচন করুন</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={assignModal.officerId || ""}
                    onChange={(e) => setAssignModal((m) => ({ ...m, officerId: e.target.value }))}
                  >
                    <option value="">-- অফিসার বাছুন --</option>
                    {data.officers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} (নিষ্পত্তি: {o.handled}, চলমান: {o.openCases})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setAssignModal({ open: false, type: null })}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                বাতিল
              </button>
              <button
                onClick={handleAssign}
                disabled={
                  busy === "assign" ||
                  !assignModal.caseId ||
                  (assignModal.type === "lawyer" && !assignModal.lawyerId) ||
                  (assignModal.type === "officer" && !assignModal.officerId)
                }
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                {busy === "assign" ? "..." : "নিয়োগ করুন"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complaint Action Modal */}
      {complaintModal.open && complaintModal.complaint && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            setComplaintModal({ open: false, complaint: null, action: null });
            setComplaintNote("");
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-semibold text-red-800">
                {complaintModal.action === "resolve" ? "অভিযোগ সমাধান" :
                 complaintModal.action === "reject" ? "অভিযোগ প্রত্যাখ্যান" :
                 complaintModal.action === "escalate" ? "কমিটিতে প্রেরণ" : "অভিযোগ বিস্তারিত"}
              </h3>
              <button
                onClick={() => {
                  setComplaintModal({ open: false, complaint: null, action: null });
                  setComplaintNote("");
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {/* Complaint Details */}
            <div className="mb-4 rounded-lg border-2 border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-200 text-lg">
                  ⚠️
                </div>
                <div>
                  <p className="font-semibold text-red-800">
                    {complaintModal.complaint.lawyerName || "আইনজীবী"}
                  </p>
                  <p className="text-sm text-red-700">
                    {COMPLAINT_REASON_LABELS[complaintModal.complaint.reasonCode] || complaintModal.complaint.reasonCode}
                  </p>
                </div>
              </div>
              {complaintModal.complaint.details && (
                <p className="mt-3 text-sm text-slate-700">{complaintModal.complaint.details}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
                <span>👤 {complaintModal.complaint.citizenName || "অভিযোগকারী"}</span>
                <span>📋 {complaintModal.complaint.caseRef || "—"}</span>
                <span>🕐 {new Date(complaintModal.complaint.createdAt).toLocaleDateString("bn-BD")}</span>
              </div>
            </div>

            {/* Action Selection (if not pre-selected) */}
            {!complaintModal.action && (
              <div className="mb-4 flex gap-2">
                <button
                  onClick={() => setComplaintModal((m) => ({ ...m, action: "resolve" }))}
                  className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  ✓ সমাধান
                </button>
                <button
                  onClick={() => setComplaintModal((m) => ({ ...m, action: "reject" }))}
                  className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  ✗ প্রত্যাখ্যান
                </button>
                <button
                  onClick={() => setComplaintModal((m) => ({ ...m, action: "escalate" }))}
                  className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  ⚡ কমিটিতে
                </button>
              </div>
            )}

            {/* Resolution Note */}
            {complaintModal.action && complaintModal.action !== "escalate" && (
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  {complaintModal.action === "resolve" ? "সমাধানের বিবরণ" : "প্রত্যাখ্যানের কারণ"}
                </label>
                <textarea
                  value={complaintNote}
                  onChange={(e) => setComplaintNote(e.target.value)}
                  placeholder="বিস্তারিত লিখুন..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            )}

            {complaintModal.action === "escalate" && (
              <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-semibold">⚠️ সতর্কতা</p>
                <p className="mt-1">এই অভিযোগ জেলা কমিটিতে অসদাচরণ মামলা হিসেবে প্রেরণ করা হবে। এটি একটি গুরুতর পদক্ষেপ।</p>
              </div>
            )}

            {/* Action Buttons */}
            {complaintModal.action && (
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setComplaintModal({ open: false, complaint: null, action: null });
                    setComplaintNote("");
                  }}
                  className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  বাতিল
                </button>
                <button
                  onClick={handleComplaintAction}
                  disabled={busy === "complaint" || (complaintModal.action !== "escalate" && !complaintNote.trim())}
                  className={`flex-1 rounded-lg py-2.5 text-sm font-medium text-white disabled:bg-slate-300 ${
                    complaintModal.action === "resolve" ? "bg-emerald-600 hover:bg-emerald-700" :
                    complaintModal.action === "escalate" ? "bg-red-600 hover:bg-red-700" :
                    "bg-slate-600 hover:bg-slate-700"
                  }`}
                >
                  {busy === "complaint" ? "..." :
                   complaintModal.action === "resolve" ? "সমাধান করুন" :
                   complaintModal.action === "reject" ? "প্রত্যাখ্যান করুন" :
                   "কমিটিতে প্রেরণ করুন"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

const KPI_COLORS = {
  blue: {
    bg: "bg-gradient-to-br from-blue-500 to-blue-600",
    light: "bg-blue-50",
    text: "text-blue-600",
    border: "border-blue-100",
  },
  emerald: {
    bg: "bg-gradient-to-br from-emerald-500 to-emerald-600",
    light: "bg-emerald-50",
    text: "text-emerald-600",
    border: "border-emerald-100",
  },
  violet: {
    bg: "bg-gradient-to-br from-violet-500 to-violet-600",
    light: "bg-violet-50",
    text: "text-violet-600",
    border: "border-violet-100",
  },
  amber: {
    bg: "bg-gradient-to-br from-amber-500 to-amber-600",
    light: "bg-amber-50",
    text: "text-amber-600",
    border: "border-amber-100",
  },
};

function Kpi({
  icon,
  label,
  value,
  sub,
  color = "blue",
}: {
  icon: string;
  label: string;
  value: number;
  sub: string;
  color?: keyof typeof KPI_COLORS;
}) {
  const colors = KPI_COLORS[color];
  return (
    <div className={`relative overflow-hidden rounded-xl border ${colors.border} ${colors.light} p-5 transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={`mt-2 text-3xl font-bold ${colors.text}`}>{value}</p>
          <p className="mt-1 text-xs text-slate-400">{sub}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${colors.bg} text-xl text-white shadow-lg`}>
          {icon}
        </div>
      </div>
      <div className={`absolute -bottom-4 -right-4 h-24 w-24 rounded-full ${colors.bg} opacity-10`} />
    </div>
  );
}

function Sign({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={ok ? "text-emerald-700" : "text-amber-700"}>
      {ok ? "✓" : "○"} {label}
    </li>
  );
}
