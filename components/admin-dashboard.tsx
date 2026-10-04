"use client";

/**
 * System administration for the Chief DLAO.
 *
 * Split from the route: `app/admin/page.tsx` gates on the server, so this is only ever
 * rendered for the administrator. The API refuses anyone else independently, because a
 * client-side guard on an admin screen is decoration.
 *
 * The audit trail is read-only by design — nothing here can write to it, because a log
 * its own reader can edit is not a log.
 *
 * The build panel is the answer to a problem that cost real time: a stale deploy is now
 * *shown* rather than argued about. The server reports the build it is, the client
 * reports the build it loaded, and a mismatch renders as a warning.
 */

/**
 * System administration for the Chief DLAO.
 *
 * Three panes: the audit trail, the people, and the health of the deployment. The
 * audit trail is read-only by design — this screen cannot write to it, because a log
 * its own reader can edit is not a log.
 *
 * The build panel is the answer to a problem that cost real time: a stale deploy is
 * now *shown* rather than argued about. The server reports the build it is, the client
 * reports the build it loaded, and a mismatch is rendered as a warning. Nobody has to
 * clear a cache or take anybody's word for it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Ban,
  CheckCircle2,
  CircleSlash,
  Fingerprint,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { BUILD_SHA, BUILD_AT } from "@/lib/build-info";
import type { AuditRow } from "@/lib/audit/log";
import { ROLE_DEFINITIONS } from "@/lib/auth/roles";

interface Overview {
  build: { sha: string; at: string };
  system: Record<string, number>;
  byRole: { role: string; count: number; titleBn: string }[];
  registrySize: number;
}

interface AdminUser {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  status: string;
  isMock: boolean;
  ownCases: number;
  activeAssignments: number;
  titleBn: string;
}

const KIND_BN: Record<string, string> = {
  "auth.login": "লগইন",
  "auth.login_failed": "ব্যর্থ লগইন",
  "auth.logout": "লগআউট",
  "auth.session_denied": "প্রবেশ অনুমোদিত নয়",
  "user.create": "ব্যবহারকারী তৈরি",
  "user.role_changed": "রোল পরিবর্তন",
  "user.status_changed": "অবস্থা পরিবর্তন",
  "user.pin_reset": "পিন রিসেট",
  "case.create": "কেস তৈরি",
  "case.stage_changed": "ধাপ পরিবর্তন",
  "case.viewed_sensitive": "সংবেদনশীল কেস দেখা",
  "case.note_added": "মন্তব্য যোগ",
  "application.filed": "আবেদন দাখিল",
  "consultation.started": "সংলাপ শুরু",
  "consultation.viewed": "সংলাপ দেখা",
  "eligibility.decided": "যোগ্যতা সিদ্ধান্ত",
  "lawyer.assign": "আইনজীবী নিয়োগ",
  "lawyer.reassign": "আইনজীবী পরিবর্তন",
  "complaint.filed": "অভিযোগ",
  "complaint.resolved": "অভিযোগ নিষ্পত্তি",
  "payment.approved": "পরিশোধ অনুমোদন",
  "mediation.scheduled": "মধ্যস্থতা নির্ধারণ",
  "settlement.certified": "সালিশ সনদ",
  "settlement.signed": "সালিশে স্বাক্ষর",
  "settlement.drafted": "সালিশ সনদ প্রস্তুত",
  "message.queued": "বার্তা পাঠানো হয়েছে",
  "message.blocked": "বার্তা আটকে দেওয়া হয়েছে",
  "admin.audit_viewed": "অডিট দেখা হয়েছে",
  "admin.roster_seeded": "তালিকা তৈরি",
  "admin.config_changed": "সেবা কনফিগারেশন",
};

const ADVERSE = new Set([
  "auth.login_failed",
  "auth.session_denied",
  "complaint.filed",
  "user.status_changed",
  "message.blocked",
]);

function when(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return "এইমাত্র";
  if (mins < 60) return `${mins} মিনিট আগে`;
  if (mins < 1440) return `${Math.round(mins / 60)} ঘণ্টা আগে`;
  return `${Math.round(mins / 1440)} দিন আগে`;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<"audit" | "people" | "health">("health");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [entries, setEntries] = useState<AuditRow[]>([]);
  const [kinds, setKinds] = useState<string[]>([]);
  const [actors, setActors] = useState<{ id: string; name: string; role: string | null }[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [assignable, setAssignable] = useState<{ key: string; titleBn: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [days, setDays] = useState("7");
  const [clientSha, setClientSha] = useState<string>(BUILD_SHA);

  const loadOverview = useCallback(async () => {
    const r = await fetch("/api/admin/overview", { cache: "no-store" });
    const body = await r.json();
    if (body?.ok) setOverview(body);
  }, []);

  const loadAudit = useCallback(async () => {
    const qs = new URLSearchParams({ days, limit: "200" });
    if (kind) qs.set("kind", kind);
    if (query) qs.set("q", query);
    const r = await fetch(`/api/admin/audit?${qs}`, { cache: "no-store" });
    const body = await r.json();
    if (body?.ok) {
      setEntries(body.entries ?? []);
      setKinds(body.kinds ?? []);
      setActors(body.actors ?? []);
    }
  }, [days, kind, query]);

  const loadUsers = useCallback(async () => {
    const r = await fetch("/api/admin/users", { cache: "no-store" });
    const body = await r.json();
    if (body?.ok) {
      setUsers(body.users ?? []);
      setAssignable(body.assignableRoles ?? []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([loadOverview(), loadAudit(), loadUsers()]);
      setLoading(false);
    })();
  }, [loadOverview, loadAudit, loadUsers]);

  const act = useCallback(
    async (userId: string, payload: Record<string, unknown>, label: string) => {
      setBusy(userId);
      setNotice(null);
      try {
        const r = await fetch("/api/admin/users", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId, ...payload }),
        });
        const body = await r.json();
        if (body?.ok) {
          setNotice({ tone: "ok", text: label });
          await Promise.all([loadUsers(), loadAudit()]);
        } else {
          setNotice({ tone: "err", text: body?.error ?? "পরিবর্তন করা যায়নি" });
        }
      } catch {
        setNotice({ tone: "err", text: "পরিবর্তন করা যায়নি" });
      } finally {
        setBusy(null);
      }
    },
    [loadUsers, loadAudit],
  );

  const mismatch = overview && overview.build.sha !== clientSha;
  const adverseCount = useMemo(() => entries.filter((e) => ADVERSE.has(e.kind)).length, [entries]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", fontFamily: "var(--font-bn)" }}>
        <Loader2 size={22} className="ad-spin" style={{ display: "inline-block", verticalAlign: "-4px", marginRight: 8 }} aria-hidden />
        লোড হচ্ছে…
      </div>
    );
  }

  return (
    <div className="ad">
      <style>{`
        .ad { font-family:var(--font-bn); color:#0f172a; }
        .ad-spin { animation:ad-rot 1s linear infinite; }
        @keyframes ad-rot { to { transform:rotate(360deg) } }
        .ad-hd { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:18px 20px;
          background:linear-gradient(120deg,#0f172a,#134e4a); color:#fff; border-radius:16px 16px 0 0; }
        .ad-hd h1 { margin:0; font-size:20px; font-weight:800; }
        .ad-hd p { margin:4px 0 0; font-size:12.5px; opacity:.85; }
        .ad-tabs { display:flex; gap:6px; padding:12px 16px; background:#fff; border-bottom:1px solid #e2e8f0; flex-wrap:wrap; }
        .ad-tab { font:700 13px/1 var(--font-bn); min-height:42px; padding:10px 14px; border-radius:10px;
          border:1px solid #e2e8f0; background:#fff; color:#475569; cursor:pointer; display:inline-flex; gap:7px; align-items:center; }
        .ad-tab.on { background:#0f766e; border-color:#0f766e; color:#fff; }
        .ad-body { padding:16px; background:#f8fafc; }
        .ad-card { background:#fff; border:1px solid #e2e8f0; border-radius:14px; margin-bottom:14px; overflow:hidden; }
        .ad-card-h { display:flex; align-items:center; gap:9px; padding:12px 14px; border-bottom:1px solid #f1f5f9;
          background:linear-gradient(135deg,#f8fafc,#f1f5f9); }
        .ad-card-h h2 { margin:0; font-size:14px; font-weight:800; }
        .ad-card-h p { margin:2px 0 0; font-size:11px; color:#64748b; }
        .ad-tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(122px,1fr)); gap:10px; padding:14px; }
        .ad-tile { padding:12px; border-radius:11px; background:#f8fafc; border:1px solid #e2e8f0; }
        .ad-tile b { display:block; font-size:20px; font-weight:800; line-height:1.1; }
        .ad-tile span { display:block; margin-top:3px; font-size:11px; color:#64748b; }
        .ad-tile.warn b { color:#b45309; } .ad-tile.bad b { color:#b91c1c; } .ad-tile.good b { color:#047857; }
        .ad-in { width:100%; min-height:44px; padding:10px 12px; border:1px solid #cbd5e1; border-radius:10px;
          font:500 13.5px/1.4 var(--font-bn); box-sizing:border-box; }
        .ad-sel { min-height:44px; padding:10px 12px; border:1px solid #cbd5e1; border-radius:10px;
          font:500 13px/1.4 var(--font-bn); background:#fff; }
        .ad-row { display:flex; gap:10px; align-items:center; padding:11px 14px; border-bottom:1px solid #f8fafc; flex-wrap:wrap; }
        .ad-badge { font:800 10px/1 var(--font-bn); padding:4px 7px; border-radius:999px; }
        .ad-badge.adverse { background:#fee2e2; color:#991b1b; }
        .ad-badge.ok { background:#d1fae5; color:#065f46; }
        .ad-badge.mut { background:#f1f5f9; color:#475569; }
        .ad-btn { font:inherit; font:700 12px/1 var(--font-bn); min-height:40px; padding:9px 12px; border-radius:9px;
          border:1px solid #cbd5e1; background:#fff; color:#334155; cursor:pointer; }
        .ad-btn.danger { border-color:#fecaca; background:#fff5f5; color:#b91c1c; }
        .ad-note { padding:11px 13px; border-radius:10px; font:600 13px/1.6 var(--font-bn); margin-bottom:12px; }
        .ad-note.ok { background:#ecfdf5; color:#065f46; }
        .ad-note.err { background:#fef2f2; color:#991b1b; }
        .ad-alarm { padding:13px 15px; border-radius:12px; background:#fef2f2; border:1px solid #fecaca;
          display:flex; gap:11px; align-items:flex-start; margin-bottom:14px; }
        .ad-alarm.good { background:#ecfdf5; border-color:#a7f3d0; }
      `}</style>

      <div className="ad-hd">
        <ShieldCheck size={24} aria-hidden />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1>সিস্টেম প্রশাসন</h1>
          <p>অডিট ট্রেইল, কর্মকর্তা ব্যবস্থাপনা ও সিস্টেমের অবস্থা</p>
        </div>
        <button type="button" className="ad-btn" style={{ background:"rgba(255,255,255,.12)", color:"#fff", borderColor:"rgba(255,255,255,.35)" }} onClick={() => router.push("/chief")}>
          ← চীফ কনসোলে
        </button>
      </div>

      <div className="ad-tabs">
        {([
          ["health", "সিস্টেমের অবস্থা", Activity],
          ["audit", `অডিট ট্রেইল (${entries.length})`, Fingerprint],
          ["people", `কর্মকর্তা ও আবেদনকারী (${users.length})`, Users],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" className={`ad-tab${tab === id ? " on" : ""}`} onClick={() => setTab(id)}>
            <Icon size={14} strokeWidth={2.4} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div className="ad-body">
        {notice ? <div className={`ad-note ${notice.tone}`} role="status">{notice.text}</div> : null}

        {/* ---------------- health ---------------- */}
        {tab === "health" && overview ? (
          <>
            <div className={`ad-alarm${mismatch ? "" : " good"}`} role="status">
              {mismatch ? <AlertTriangle size={19} style={{ color: "#b91c1c", flex: "0 0 19px" }} aria-hidden /> : <CheckCircle2 size={19} style={{ color: "#047857", flex: "0 0 19px" }} aria-hidden />}
              <div>
                <div style={{ font: "800 14px/1.5 var(--font-bn)" }}>
                  {mismatch ? "সতর্কতা: ব্রাউজার ও সার্ভারের বিল্ড আলাদা" : "বিল্ড যাচাই সম্পন্ন — সব ঠিক আছে"}
                </div>
                <p style={{ margin: "4px 0 0", font: "500 12.5px/1.6 var(--font-bn)", color: "#475569" }}>
                  সার্ভার: <b>{overview.build.sha}</b> · ব্রাউজার: <b>{clientSha}</b> · তৈরি: {new Date(overview.build.at).toLocaleString("en-GB")}
                </p>
                {mismatch ? (
                  <p style={{ margin: "5px 0 0", font: "600 12.5px/1.6 var(--font-bn)", color: "#991b1b" }}>
                    ব্রাউজার পুরোনো বিল্ড দেখাচ্ছে। ক্যাশ স্পষ্ট না করে পেজটি রিলোড করুন (⌘⇧R অথবা Ctrl+Shift+R)।
                  </p>
                ) : null}
              </div>
            </div>

            <div className="ad-card">
              <div className="ad-card-h">
                <Users size={16} style={{ color: "#0f766e" }} aria-hidden />
                <div><h2>সিস্টেম সারসংক্ষেপ</h2><p>এই মুহূর্তের সংখ্যা</p></div>
              </div>
              <div className="ad-tiles">
                {[
                  ["users", "মোট ব্যবহারকারী", ""],
                  ["staff", "কর্মকর্তা", ""],
                  ["citizens", "আবেদনকারী", ""],
                  ["cases", "কেস", ""],
                  ["pending", "পর্যালোচনার অপেক্ষায়", "warn"],
                  ["applications", "আবেদন", ""],
                  ["consultations", "সংলাপ", ""],
                  ["assignments", "সক্রিয় নিয়োগ", "good"],
                  ["lawyers", "প্যানেল আইনজীবী", ""],
                  ["complaints", "অভিযোগ", "bad"],
                  ["openComplaints", "অমীমাণিত অভিযোগ", "bad"],
                  ["auditKindsLast24h", "অডিট ধরন (২৪ ঘণ্টা)", ""],
                ].map(([key, label, tone]) => (
                  <div key={key} className={`ad-tile ${tone}`}>
                    <b>{overview.system[key] ?? 0}</b>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="ad-card">
              <div className="ad-card-h">
                <BadgeCheck size={16} style={{ color: "#0f766e" }} aria-hidden />
                <div><h2>রোল অনুযায়ী ব্যবহারকারী</h2><p>রেজিস্ট্রিতে {overview.registrySize}টি রোল</p></div>
              </div>
              <div className="ad-tiles">
                {overview.byRole.map((r) => (
                  <div key={r.role} className="ad-tile">
                    <b>{r.count}</b>
                    <span>{ROLE_DEFINITIONS.find((d) => d.key === r.role)?.titleBn ?? r.titleBn}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {/* ---------------- audit ---------------- */}
        {tab === "audit" ? (
          <div className="ad-card">
            <div className="ad-card-h">
              <Fingerprint size={16} style={{ color: "#0f766e" }} aria-hidden />
              <div style={{ flex: 1 }}>
                <h2>অডিট ট্রেইল</h2>
                <p>শুধু পড়ার জন্য · {adverseCount > 0 ? `${adverseCount}টি অস্বাভাবিক ঘটনা` : "কোনো অস্বাভাবিক ঘটনা নেই"}</p>
              </div>
              <button type="button" className="ad-btn" onClick={() => void loadAudit()}>
                <RefreshCw size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} aria-hidden />রিফ্রেশ
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, padding: 12, flexWrap: "wrap", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ position: "relative", flex: "1 1 220px" }}>
                <Search size={15} aria-hidden style={{ position: "absolute", left: 11, top: 14, color: "#94a3b8" }} />
                <input
                  className="ad-in"
                  style={{ paddingLeft: 33 }}
                  placeholder="বিবরণ, কেস আইডি বা কর্মকর্তা…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="অডিট খুঁজুন"
                />
              </div>
              <select className="ad-sel" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="ঘটনার ধরন">
                <option value="">সব ধরন</option>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {KIND_BN[k] ?? k} ({k})
                  </option>
                ))}
              </select>
              <select className="ad-sel" value={days} onChange={(e) => setDays(e.target.value)} aria-label="সময়সীমা">
                <option value="1">গত ২৪ ঘণ্টা</option>
                <option value="7">গত ৭ দিন</option>
                <option value="30">গত ৩০ দিন</option>
                <option value="365">গত ১ বছর</option>
              </select>
            </div>

            {entries.length === 0 ? (
              <p style={{ padding: 22, margin: 0, textAlign: "center", font: "500 13px/1.6 var(--font-bn)", color: "#64748b" }}>
                এই সময়সীমায় কোনো ঘটনা পাওয়া যায়নি।
              </p>
            ) : (
              entries.map((e) => {
                const adverse = ADVERSE.has(e.kind);
                return (
                  <div key={e.id} className="ad-row">
                    <span className={`ad-badge ${adverse ? "adverse" : "mut"}`}>{KIND_BN[e.kind] ?? e.kind}</span>
                    <div style={{ flex: 1, minWidth: 190 }}>
                      <div style={{ font: "600 13px/1.5 var(--font-bn)" }}>{e.detail || e.kind}</div>
                      <div style={{ font: "500 11px/1.5 var(--font-bn)", color: "#64748b" }}>
                        {e.actorName ?? "সিস্টেম"}
                        {e.actorRole ? ` (${e.actorRole})` : ""} · {when(e.at)}
                        {e.refLabel ? ` · ${e.refLabel}` : ""}
                        {e.reason ? ` · কারণ: ${e.reason}` : ""}
                      </div>
                    </div>
                    <code style={{ fontSize: 10.5, color: "#94a3b8" }}>{e.kind}</code>
                  </div>
                );
              })
            )}
          </div>
        ) : null}

        {/* ---------------- people ---------------- */}
        {tab === "people" ? (
          <div className="ad-card">
            <div className="ad-card-h">
              <Users size={16} style={{ color: "#0f766e" }} aria-hidden />
              <div style={{ flex: 1 }}>
                <h2>ব্যবহারকারী ব্যবস্থাপনা</h2>
                <p>রোল পরিবর্তন, অ্যাকাউন্ট স্থগিত ও পিন রিসেট — প্রতিটি অডিটে নথিভুক্ত</p>
              </div>
              <button type="button" className="ad-btn" onClick={() => void loadUsers()}>
                <RefreshCw size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} aria-hidden />রিফ্রেশ
              </button>
            </div>

            <div style={{ padding: 12, borderBottom: "1px solid #f1f5f9" }}>
              <input
                className="ad-in"
                placeholder="নাম, ফোন বা আইডি দিয়ে খুঁজুন…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="ব্যবহারকারী খুঁজুন"
              />
            </div>

            {users.length === 0 ? (
              <p style={{ padding: 22, margin: 0, textAlign: "center", font: "500 13px/1.6 var(--font-bn)", color: "#64748b" }}>
                কোনো ব্যবহারকারী পাওয়া যায়নি।
              </p>
            ) : (
              users.map((u) => {
                const disabled = u.status === "disabled";
                return (
                  <div key={u.id} className="ad-row">
                    <div style={{ flex: 1, minWidth: 190 }}>
                      <div style={{ font: "700 13.5px/1.4 var(--font-bn)", display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                        {u.name}
                        {disabled ? <span className="ad-badge adverse">নিষ্ক্রিয়</span> : null}
                        {u.isMock ? <span className="ad-badge mut">মক</span> : null}
                      </div>
                      <div style={{ font: "500 11px/1.5 var(--font-bn)", color: "#64748b" }}>
                        {u.titleBn} · {u.phone ?? "ফোন নেই"} · {u.ownCases > 0 ? `${u.ownCases}টি কেস` : ""}
                        {u.activeAssignments > 0 ? ` · ${u.activeAssignments}টি সক্রিয় নিয়োগ` : ""}
                      </div>
                    </div>

                    <select
                      className="ad-sel"
                      value={u.role}
                      disabled={busy === u.id || disabled}
                      aria-label={`${u.name}-এর রোল`}
                      onChange={(ev) => void act(u.id, { role: ev.target.value }, `${u.name}-এর রোল ${ev.target.value} করা হয়েছে`)}
                    >
                      {assignable.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.titleBn}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      className={`ad-btn${disabled ? "" : " danger"}`}
                      disabled={busy === u.id}
                      onClick={() =>
                        void act(
                          u.id,
                          disabled
                            ? { status: "active", reason: "পুনরায় সক্রিয়" }
                            : { status: "disabled", reason: "জেলা অফিস থেকে অবসর" },
                          disabled ? `${u.name} পুনরায় সক্রিয় করা হয়েছে` : `${u.name} নিষ্ক্রিয় করা হয়েছে`,
                        )
                      }
                    >
                      {disabled ? <BadgeCheck size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} aria-hidden /> : <Ban size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} aria-hidden />}
                      {disabled ? "সক্রিয় করুন" : "নিষ্ক্রিয় করুন"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
