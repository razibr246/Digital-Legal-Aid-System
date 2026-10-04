"use client";

/**
 * The applicant's full case page.
 *
 * Its own route rather than more sections on the dashboard. Everything — the stepper,
 * the lawyer, the action tracker, the timeline and the complaint form — is useful but
 * it is *detail*, and stacking it on the dashboard made a phone screen a long scroll
 * past three verification steps and a case list to reach the thing that mattered. The
 * dashboard now carries a short summary and a link; this page carries the rest.
 *
 * Mobile-first: single column, tap targets at least 44px, no horizontal scroll, and the
 * action tracker collapses to counts at the top so the state is legible before any
 * scrolling.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { CitizenCaseView } from "@/lib/data/citizen-case-view";

const REASONS = [
  { code: "not_contacted", bn: "আইনজীবী যোগাযোগ করেননি" },
  { code: "too_slow", bn: "অনেক দেরিতে কাজ হচ্ছে" },
  { code: "not_listening", bn: "আমার কথা ভালোভাবে শোনেন না" },
  { code: "unprofessional", bn: "আচরণ পেশাদার নয়" },
  { code: "demanded_money", bn: "অর্থ চেয়েছেন" },
  { code: "refused_after_assignment", bn: "নিয়োগের পর কাজ করতে অস্বীকার করেছেন" },
  { code: "other", bn: "অন্য কোনো কারণ" },
] as const;

const STATE_BN: Record<string, string> = {
  done: "সম্পন্ন",
  due_soon: "সময় ঘনিয়ে আসছে",
  overdue: "সময় পেরিয়েছে",
  pending: "চলমান",
  na: "প্রযোজ্য নয়",
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("bn-BD", { day: "numeric", month: "long", year: "numeric" });
}

export default function CitizenCasePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const caseId = decodeURIComponent(String(params?.id ?? ""));

  const [data, setData] = useState<CitizenCaseView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0].code);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/my-case", { cache: "no-store" });
      const body = await res.json();
      if (!body?.ok) return;
      const found = (body.cases ?? []).find((c: CitizenCaseView) => c.caseId === caseId);
      if (found) setData(found);
      else setNotFound(true);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(async () => {
    if (!data?.lawyer) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/portal/lawyer-complaint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignmentId: data.lawyer.assignmentId, reasonCode: reason, detailsBn: details }),
      });
      const body = await res.json();
      if (body?.ok) {
        setNotice({ tone: "ok", text: "আপনার অভিযোগটি গ্রহণ করা হয়েছে। জেলা লিগ্যাল এইড অফিস পর্যালোচনা করবে।" });
        setComplaintOpen(false);
        setDetails("");
      } else {
        setNotice({ tone: "err", text: body?.error ?? "অভিযোগ জমা দেওয়া যায়নি।" });
      }
    } catch {
      setNotice({ tone: "err", text: "অভিযোগ জমা দেওয়া যায়নি। আবার চেষ্টা করুন।" });
    } finally {
      setBusy(false);
    }
  }, [data, reason, details]);

  if (loading) {
    return (
      <main style={{ padding: "28px 16px", maxWidth: 860, margin: "0 auto", fontFamily: "var(--font-bn)" }}>
        <p style={{ color: "#64748b" }}>মামলার তথ্য নেওয়া হচ্ছে…</p>
      </main>
    );
  }

  if (notFound || !data) {
    return (
      <main style={{ padding: "28px 16px", maxWidth: 860, margin: "0 auto", fontFamily: "var(--font-bn)" }}>
        <h1 style={{ fontSize: "1.2rem", fontWeight: 800, color: "#0f172a", margin: "0 0 8px" }}>মামলাটি পাওয়া যায়নি</h1>
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>এই মামলাটি আপনার অ্যাকাউন্টে নেই, অথবা এটি আর চালু নেই।</p>
        <button type="button" onClick={() => router.push("/citizen")} className="cc-btn primary" style={{ marginTop: 16 }}>
          ড্যাশবোর্ডে ফিরে যান
        </button>
      </main>
    );
  }

  const t = data.tracker;

  return (
    <main style={{ padding: "16px 14px 56px", maxWidth: 860, margin: "0 auto", fontFamily: "var(--font-bn)" }}>
      <style>{`
        .cc-btn { font:inherit; font:700 14px/1 var(--font-bn); min-height:44px; padding:12px 18px;
          border-radius:12px; border:1px solid #cbd5e1; background:#fff; color:#334155; cursor:pointer; }
        .cc-btn.primary { background:#0f766e; border-color:#0f766e; color:#fff; }
        .cc-btn.report { border-color:#fecaca; background:#fff5f5; color:#b91c1c; }
        .cc-btn:disabled { opacity:.55; cursor:not-allowed; }
        .cc-card { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:16px; margin-bottom:14px;
          box-shadow:0 1px 2px rgba(15,23,42,.04); }
        .cc-h { font:800 11px/1 var(--font-bn); letter-spacing:.5px; text-transform:uppercase; color:#94a3b8; margin:0 0 12px; }
        .cc-docket { font:800 12px/1 var(--font-bn); color:#0f766e; letter-spacing:.3px; }
        .cc-title { margin:7px 0 0; font:800 18px/1.45 var(--font-bn); color:#0f172a; }
        .cc-badges { display:flex; gap:7px; flex-wrap:wrap; margin-top:11px; }
        .cc-badge { font:800 11px/1 var(--font-bn); padding:7px 11px; border-radius:999px; background:#ecfdf5; color:#047857; }
        .cc-badge.red { background:#fef2f2; color:#b91c1c; }

        .cc-steps { display:flex; overflow-x:auto; gap:0; padding:4px 0 2px; -webkit-overflow-scrolling:touch; }
        .cc-step { flex:1 0 84px; text-align:center; position:relative; }
        .cc-dot { width:26px; height:26px; border-radius:50%; margin:0 auto; display:grid; place-items:center;
          font:800 11px/1 var(--font-bn); background:#e2e8f0; color:#94a3b8; position:relative; z-index:2; }
        .cc-step.done .cc-dot { background:#0f766e; color:#fff; }
        .cc-step.current .cc-dot { background:#0f766e; color:#fff; box-shadow:0 0 0 4px rgba(15,118,110,.18); }
        .cc-step::before { content:""; position:absolute; top:13px; left:-50%; width:100%; height:2px; background:#e2e8f0; }
        .cc-step:first-child::before { display:none; }
        .cc-step.done::before, .cc-step.current::before { background:#0f766e; }
        .cc-step-l { margin:8px 3px 0; font:700 10.5px/1.3 var(--font-bn); color:#64748b; }
        .cc-step.current .cc-step-l { color:#0f766e; }
        .cc-step.done .cc-step-l { color:#334155; }

        .cc-bar { height:8px; border-radius:999px; background:#e2e8f0; overflow:hidden; margin:12px 0 6px; }
        .cc-bar > i { display:block; height:100%; background:linear-gradient(90deg,#0f766e,#10b981); border-radius:999px; }
        .cc-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; text-align:center; margin-top:10px; }
        .cc-stat { padding:9px 4px; border-radius:10px; background:#f8fafc; }
        .cc-stat b { display:block; font:800 17px/1.1 var(--font-bn); color:#0f172a; }
        .cc-stat span { font:600 10.5px/1.3 var(--font-bn); color:#64748b; }

        .cc-act { display:flex; gap:11px; align-items:flex-start; padding:12px 0; border-bottom:1px solid #f1f5f9; }
        .cc-act:last-child { border-bottom:0; }
        .cc-ic { width:24px; height:24px; border-radius:50%; flex:0 0 24px; display:grid; place-items:center;
          font:800 11px/1 var(--font-bn); margin-top:2px; }
        .cc-ic.done { background:#d1fae5; color:#047857; }
        .cc-ic.overdue { background:#fee2e2; color:#b91c1c; }
        .cc-ic.due_soon { background:#fef3c7; color:#b45309; }
        .cc-ic.pending { background:#e2e8f0; color:#64748b; }
        .cc-ic.na { background:#f1f5f9; color:#94a3b8; }
        .cc-act-b { font:700 13.5px/1.45 var(--font-bn); color:#1e293b; }
        .cc-act-m { margin:3px 0 0; font:500 11.5px/1.5 var(--font-bn); color:#64748b; }

        .cc-lw { display:flex; gap:12px; align-items:center; margin-bottom:14px; }
        .cc-ava { width:48px; height:48px; border-radius:14px; flex:0 0 48px; display:grid; place-items:center;
          background:#0f766e; color:#fff; font:800 16px/1 var(--font-bn); }
        .cc-lw-n { margin:0; font:800 15.5px/1.3 var(--font-bn); color:#0f172a; }
        .cc-lw-r { margin:3px 0 0; font:600 12px/1.4 var(--font-bn); color:#64748b; }
        .cc-rows { display:grid; gap:10px; }
        .cc-row { display:flex; justify-content:space-between; gap:12px; padding:9px 0; border-bottom:1px solid #f8fafc; }
        .cc-row:last-child { border-bottom:0; }
        .cc-k { font:700 12px/1.4 var(--font-bn); color:#94a3b8; flex:0 0 auto; }
        .cc-v { font:600 13px/1.5 var(--font-bn); color:#1e293b; text-align:right; word-break:break-word; }

        .cc-note { padding:12px 13px; border-radius:11px; font:600 13px/1.65 var(--font-bn); margin-bottom:12px; }
        .cc-note.ok { background:#ecfdf5; color:#065f46; }
        .cc-note.warn { background:#fffbeb; color:#92400e; }
        .cc-note.err { background:#fef2f2; color:#991b1b; }

        .cc-sheet { position:fixed; inset:0; z-index:10001; background:rgba(2,6,23,.72);
          display:flex; align-items:flex-end; }
        @media (min-width:640px) { .cc-sheet { align-items:center; justify-content:center; padding:20px; } }
        .cc-sheet-box { width:100%; max-width:480px; background:#fff; border-radius:18px 18px 0 0;
          padding:20px; max-height:88vh; overflow-y:auto; }
        @media (min-width:640px) { .cc-sheet-box { border-radius:18px; } }
        .cc-reasons { display:grid; gap:8px; margin:12px 0; }
        .cc-reason { display:flex; gap:9px; align-items:center; min-height:44px; padding:11px 12px;
          border:1px solid #e2e8f0; border-radius:10px; font:600 13.5px/1.4 var(--font-bn); color:#1e293b; }
        .cc-reason.sel { border-color:#0f766e; background:#f0fdfa; }
        .cc-ta { width:100%; min-height:88px; padding:11px 12px; border:1px solid #cbd5e1; border-radius:10px;
          font:500 13.5px/1.6 var(--font-bn); resize:vertical; box-sizing:border-box; }
      `}</style>

      <button type="button" className="cc-btn" onClick={() => router.push("/citizen")} style={{ marginBottom: 14 }}>
        ← ড্যাশবোর্ডে ফিরে যান
      </button>

      {/* header */}
      <section className="cc-card">
        <div className="cc-docket">{data.docketId}</div>
        <h1 className="cc-title">{data.problem}</h1>
        <div className="cc-badges">
          {data.sensitive ? <span className="cc-badge red">সংবেদনশীল কেস</span> : null}
          <span className="cc-badge">{data.stageLabelBn}</span>
        </div>
      </section>

      {/* stage stepper */}
      <section className="cc-card">
        <h2 className="cc-h">কেসের অগ্রগতি</h2>
        <div className="cc-steps" role="list">
          {data.stages.map((s) => (
            <div key={s.key} role="listitem" className={`cc-step ${s.state}`} aria-current={s.state === "current" ? "step" : undefined}>
              <div className="cc-dot">{s.state === "done" ? "✓" : ""}</div>
              <p className="cc-step-l">{s.labelBn}</p>
            </div>
          ))}
        </div>
        <div className="cc-note ok" style={{ marginTop: 14, marginBottom: 0 }}>{data.stageNextBn}</div>
      </section>

      {/* eligibility */}
      <section className="cc-card">
        <h2 className="cc-h">সহায়তার সিদ্ধান্ত</h2>
        <div className={`cc-note ${data.eligibility.eligible ? "ok" : "warn"}`} style={{ marginBottom: 10 }}>
          {data.eligibility.assuranceBn}
        </div>
        <div className="cc-rows">
          <div className="cc-row">
            <span className="cc-k">প্রযোজ্য আইন</span>
            <span className="cc-v">{data.eligibility.actBn}</span>
          </div>
          {data.eligibility.basisBn ? (
            <div className="cc-row">
              <span className="cc-k">ভিত্তি</span>
              <span className="cc-v">{data.eligibility.basisBn}</span>
            </div>
          ) : null}
        </div>
      </section>

      {/* lawyer tracker */}
      {t ? (
        <section className="cc-card">
          <h2 className="cc-h">আইনজীবীর কাজের অগ্রগতি</h2>
          <div className="cc-bar"><i style={{ width: `${t.summary.progressPercent}%` }} /></div>
          <div style={{ font: "700 12.5px/1.5 var(--font-bn)", color: "#334155", textAlign: "center" }}>
            {t.summary.done} / {t.summary.total} ধাপ সম্পন্ন · নিয়োগের {t.summary.daysSinceAppointment} দিন পেরিয়েছে
          </div>
          <div className="cc-stats">
            <div className="cc-stat"><b style={{ color: "#047857" }}>{t.summary.done}</b><span>সম্পন্ন</span></div>
            <div className="cc-stat"><b style={{ color: t.summary.overdue ? "#b91c1c" : "#334155" }}>{t.summary.overdue}</b><span>সময় পেরিয়েছে</span></div>
            <div className="cc-stat"><b style={{ color: t.summary.pending + t.summary.dueSoon ? "#b45309" : "#334155" }}>{t.summary.dueSoon}</b><span>ঘনিয়ে আসছে</span></div>
          </div>
          <div className={`cc-note ${t.summary.overdue ? "warn" : "ok"}`} style={{ marginTop: 12 }}>{t.headlineBn}</div>
          <div style={{ marginTop: 4 }}>
            {t.actions.map((a) => (
              <div key={a.code} className="cc-act">
                <span className={`cc-ic ${a.state}`}>{a.state === "done" ? "✓" : a.state === "overdue" ? "!" : ""}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="cc-act-b">{a.labelBn}</div>
                  <p className="cc-act-m">
                    {STATE_BN[a.state]}
                    {a.state === "done" && a.doneAt ? ` · ${fmtDate(a.doneAt)}` : ""}
                    {a.state === "overdue" ? ` · ${Math.abs(a.daysRemaining)} দিন দেরি` : ""}
                    {a.state === "due_soon" ? ` · আর ${a.daysRemaining} দিন` : ""}
                    {a.state === "pending" && a.dueAt ? ` · লক্ষ্য ${fmtDate(a.dueAt)}` : ""}
                    {a.state === "done" && a.noteBn ? ` · ${a.noteBn}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* lawyer details */}
      {data.lawyer ? (
        <section className="cc-card">
          <h2 className="cc-h">আমার আইনজীবী</h2>
          <div className="cc-lw">
            <div className="cc-ava">আই</div>
            <div style={{ minWidth: 0 }}>
              <p className="cc-lw-n">{data.lawyer.name}</p>
              <p className="cc-lw-r">
                প্যানেল আইনজীবী
                {data.lawyer.jurisdiction ? ` · ${data.lawyer.jurisdiction}` : ""}
              </p>
            </div>
          </div>
          <div className="cc-rows">
            {data.lawyer.barRegistration ? (
              <div className="cc-row"><span className="cc-k">বার নিবন্ধন</span><span className="cc-v">{data.lawyer.barRegistration}</span></div>
            ) : null}
            {data.lawyer.phone ? (
              <div className="cc-row"><span className="cc-k">যোগাযোগ</span><span className="cc-v">{data.lawyer.phone}</span></div>
            ) : null}
            {data.lawyer.specialisations ? (
              <div className="cc-row"><span className="cc-k">বিশেষায়ন</span><span className="cc-v">{data.lawyer.specialisations}</span></div>
            ) : null}
            <div className="cc-row"><span className="cc-k">নিয়োগের তারিখ</span><span className="cc-v">{fmtDate(data.lawyer.assignedAt)}</span></div>
            {data.lawyer.assignedByName ? (
              <div className="cc-row"><span className="cc-k">যিনি নিয়োগ করেছেন</span><span className="cc-v">{data.lawyer.assignedByName}</span></div>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 9, marginTop: 14, flexWrap: "wrap" }}>
            <a className="cc-btn primary" href={`tel:${data.lawyer.phone ?? ""}`} aria-disabled={!data.lawyer.phone}>
              আইনজীবীকে কল করুন
            </a>
            <button type="button" className="cc-btn report" onClick={() => { setComplaintOpen(true); setNotice(null); }}>
              অভিযোগ করুন
            </button>
          </div>
        </section>
      ) : (
        <section className="cc-card">
          <h2 className="cc-h">আমার আইনজীবী</h2>
          <div className="cc-note warn" style={{ marginBottom: 0 }}>
            এখনো কোনো আইনজীবী নিয়োগ হয়নি। আপনার আবেদনটি যাচাই ও পর্যালোচনার অপেক্ষায় আছে।
          </div>
        </section>
      )}

      {/* case timeline */}
      {data.timeline.length > 0 ? (
        <section className="cc-card">
          <h2 className="cc-h">যা যা হয়েছে</h2>
          {data.timeline.map((t2, i) => (
            <div key={i} className="cc-act">
              <span className="cc-ic done">•</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="cc-act-b">{t2.labelBn}</div>
                {t2.note ? <p className="cc-act-m">{t2.note}</p> : null}
                <p className="cc-act-m">{fmtDate(t2.at)}{t2.byName ? ` · ${t2.byName}` : ""}</p>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {notice ? <div className={`cc-note ${notice.tone === "ok" ? "ok" : "err"}`} role="status">{notice.text}</div> : null}

      {/* complaint sheet: bottom sheet on a phone, centred dialog on a desktop */}
      {complaintOpen && data.lawyer ? (
        <div className="cc-sheet" onMouseDown={(e) => { if (e.target === e.currentTarget) setComplaintOpen(false); }}>
          <div className="cc-sheet-box" role="dialog" aria-modal="true" aria-label="আইনজীবীর কাজ নিয়ে অভিযোগ">
            <h2 style={{ margin: "0 0 6px", font: "800 17px/1.35 var(--font-bn)", color: "#0f172a" }}>
              আইনজীবীর কাজ নিয়ে অভিযোগ
            </h2>
            <p style={{ margin: 0, font: "500 13px/1.6 var(--font-bn)", color: "#64748b" }}>
              আপনার অভিযোগ জেলা লিগ্যাল এইড অফিসের কাছে পৌঁছাবে। নিয়োগপত্র: {data.lawyer.name}
            </p>
            <div className="cc-reasons">
              {REASONS.map((r) => (
                <label key={r.code} className={`cc-reason${reason === r.code ? " sel" : ""}`}>
                  <input type="radio" name="cc-reason" checked={reason === r.code} onChange={() => setReason(r.code)} />
                  <span>{r.bn}</span>
                </label>
              ))}
            </div>
            <textarea
              className="cc-ta"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="আপনার অভিযোগের বিবরণ লিখুন (ঐচ্ছিক)"
              maxLength={2000}
            />
            <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
              <button type="button" className="cc-btn" style={{ flex: 1 }} onClick={() => setComplaintOpen(false)} disabled={busy}>
                বাতিল
              </button>
              <button type="button" className="cc-btn report" style={{ flex: 1 }} onClick={() => void submit()} disabled={busy}>
                {busy ? "পাঠানো হচ্ছে…" : "অভিযোগ পাঠান"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
