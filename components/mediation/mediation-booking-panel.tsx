"use client";

import { useCallback, useEffect, useState } from "react";
import { WorkingDayPicker } from "./working-day-picker";
import { OUTCOME_LABELS, formatBn, fromDateKey, isDateKey, type MediationOutcome } from "@/lib/case/mediation";
import type { SettlementDraft } from "@/lib/case/settlement-draft";

/**
 * ADR booking + session + settlement — the prototype's three mediation screens
 * (`mediation-booking`, `mediation-session`, `settlement`) in one panel, because they
 * are three steps of one record rather than three destinations.
 *
 * The gate is the point. `bookingVerdict` in lib/case/mediation.ts asks the same
 * `caseActionState` the server asks, so when the reason is `mandatory` or
 * `alreadySettled` the officer is told WHY in Bangla instead of finding a button that
 * does nothing. The server re-checks regardless — a disabled button is a courtesy, not
 * a control.
 */

interface MediatorOption {
  id: string;
  name: string;
  district: string | null;
  specialisations: string | null;
}

interface HistoryRow {
  id: string;
  scheduled_at: string | null;
  venue: string | null;
  outcome: string | null;
  notes: string | null;
  mediator_name: string | null;
}

interface Props {
  caseId: string;
  docketId: string;
  applicantName?: string | null;
  mediators: MediatorOption[];
  onBooked?: () => void;
}

type Gate = { ok: boolean; reason: string; noteBn?: string } | null;

export default function MediationBookingPanel({ caseId, docketId, applicantName, mediators, onBooked }: Props) {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [requests, setRequests] = useState<Array<{ id: string; mediator_name: string | null; status: string }>>([]);
  const [settlement, setSettlement] = useState<{ signed_applicant: number; signed_opposite: string | null; signed_mediator: number; certified: number } | null>(null);
  const [gate, setGate] = useState<Gate>(null);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [venue, setVenue] = useState("জেলা লিগ্যাল এইড অফিস, সালিস কক্ষ");
  const [mediatorId, setMediatorId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [draft, setDraft] = useState<SettlementDraft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/mediations?caseId=${encodeURIComponent(caseId)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setMessage({ tone: "err", text: body.error || "তথ্য লোড করা যায়নি।" });
        return;
      }
      setHistory(body.history ?? []);
      setRequests(body.mediatorRequests ?? []);
      setSettlement(body.settlement ?? null);
      setGate(body.case?.mediationAllowed ?? null);
    } catch {
      setMessage({ tone: "err", text: "সংযোগ বিচ্ছিন্ন।" });
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  async function book() {
    if (!isDateKey(date)) {
      setMessage({ tone: "err", text: "একটি কার্যদিবসের তারিখ বেছে নিন।" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/portal/mediations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, date, time, venue, mediatorId: mediatorId || null, notes }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setMessage({ tone: "err", text: body.error || "নির্ধারণ করা যায়নি।" });
        return;
      }
      setMessage({ tone: "ok", text: `মধ্যস্থতা নির্ধারিত হয়েছে — ${formatBn(fromDateKey(date))} ${time}` });
      setDate("");
      setNotes("");
      await load();
      onBooked?.();
    } catch {
      setMessage({ tone: "err", text: "সংযোগ বিচ্ছিন্ন।" });
    } finally {
      setBusy(false);
    }
  }

  async function recordOutcome(mediationId: string, outcome: "settled" | "failed") {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/portal/mediations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediationId, outcome }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setMessage({ tone: "err", text: body.error || "ফলাফল নথিভুক্ত হয়নি।" });
        return;
      }
      if (outcome === "settled" && body.draft) {
        setDraft(body.draft as SettlementDraft);
        setMessage({ tone: "ok", text: "সালিশ হিসেবে নথিভুক্ত। সালিশ সনদ প্রস্তুত করা হয়েছে — নিচে দেখুন।" });
      } else {
        setMessage({
          tone: "ok",
          text: outcome === "settled" ? "সালিশ হিসেবে নথিভুক্ত।" : "ব্যর্থ হিসেবে নথিভুক্ত।",
        });
      }
      await load();
      onBooked?.();
    } catch {
      setMessage({ tone: "err", text: "সংযোগ বিচ্ছিন্ন।" });
    } finally {
      setBusy(false);
    }
  }

  async function sign(role: "applicant" | "opposite" | "mediator") {
    if (!history.length) return;
    const latest = history[0];
    setBusy(true);
    try {
      // The settlement row is created by the server when an attempt is marked settled.
      // Signing flips the party bit; the Chief certifies only when all three are set
      // (certificationState in domain.ts), so no single click can certify alone.
      const res = await fetch("/api/portal/mediations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediationId: latest.id, sign: role, caseId }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setMessage({ tone: "err", text: body.error || "স্বাক্ষর নথিভুক্ত হয়নি।" });
        return;
      }
      await load();
      onBooked?.();
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    minHeight: "var(--touch-min, 2.75rem)",
    padding: "0 12px",
    border: "1.5px solid var(--portal-border-strong, #94a3b8)",
    borderRadius: 8,
    background: "#fff",
    fontFamily: "var(--font-bn)",
    fontSize: "0.9375rem",
    color: "var(--portal-text, #0f172a)",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: "var(--font-bn)",
    fontSize: "0.8125rem",
    fontWeight: 600,
    marginBottom: 6,
    color: "var(--portal-text, #0f172a)",
  };

  if (loading) {
    return <p style={{ fontFamily: "var(--font-bn)", color: "var(--portal-text-secondary, #64748b)" }}>মধ্যস্থতার তথ্য লোড হচ্ছে…</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl, 24px)" }}>
      <header>
        <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.0625rem", fontWeight: 700, margin: 0 }}>
          মধ্যস্থতা (ADR) — {docketId}
        </h3>
        {applicantName ? (
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text-secondary, #64748b)", margin: "4px 0 0" }}>
            আবেদনকারী: {applicantName}
          </p>
        ) : null}
      </header>

      {message ? (
        <p
          role="status"
          style={{
            fontFamily: "var(--font-bn)",
            fontSize: "0.875rem",
            fontWeight: 600,
            margin: 0,
            padding: "10px 12px",
            borderRadius: 8,
            background: message.tone === "ok" ? "#dff3ea" : "#fde8ec",
            color: message.tone === "ok" ? "#047857" : "#9f1239",
          }}
        >
          {message.text}
        </p>
      ) : null}

      {/* The gate, in the officer's language, before they touch a form. */}
      {gate && !gate.ok ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            background: "#fffbeb",
            border: "1.5px solid #fcd34d",
          }}
        >
          <strong style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "#92400e" }}>
            এই কেসে নতুন মধ্যস্থতা নির্ধারণ করা যাবে না
          </strong>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "#92400e", margin: "4px 0 0" }}>
            {gate.noteBn} <span style={{ opacity: 0.7 }}>({gate.reason})</span>
          </p>
        </div>
      ) : null}

      {/* ---- booking ---- */}
      <section style={{ border: "1px solid var(--portal-border, #e2e8f0)", borderRadius: 12, padding: "var(--space-lg, 16px)" }}>
        <h4 style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", fontWeight: 700, margin: "0 0 12px" }}>
          নতুন মধ্যস্থতা নির্ধারণ
        </h4>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <WorkingDayPicker value={date} onChange={setDate} minDate={new Date()} />
          <div>
            <label htmlFor="med-time" style={labelStyle}>সময়</label>
            <input id="med-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label htmlFor="med-mediator" style={labelStyle}>মধ্যস্থতাকারী</label>
            <select id="med-mediator" value={mediatorId} onChange={(e) => setMediatorId(e.target.value)} style={fieldStyle}>
              <option value="">নির্বাচন করা হয়নি</option>
              {mediators.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.district ? ` — ${m.district}` : ""}
                </option>
              ))}
            </select>
            <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.6875rem", color: "#64748b", margin: "4px 0 0" }}>
              মধ্যস্থতাকারী গ্রহণ করলেই ক্ষতিপূরণ বিবেচনাযোগ্য হয়।
            </p>
          </div>
          <div>
            <label htmlFor="med-venue" style={labelStyle}>স্থান</label>
            <input id="med-venue" type="text" value={venue} onChange={(e) => setVenue(e.target.value)} style={fieldStyle} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label htmlFor="med-notes" style={labelStyle}>নোট</label>
          <textarea
            id="med-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{ ...fieldStyle, padding: "10px 12px", height: "auto" }}
            placeholder="যা লিখবেন তা উভয় পক্ষকে জানানো হবে"
          />
        </div>
        <button
          type="button"
          onClick={book}
          disabled={busy || (gate ? !gate.ok : false)}
          style={{
            marginTop: 14,
            background: "var(--portal-accent, #15803d)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "0 20px",
            minHeight: "var(--touch-min, 2.75rem)",
            fontFamily: "var(--font-bn)",
            fontWeight: 700,
            fontSize: "0.9375rem",
            cursor: busy || (gate && !gate.ok) ? "not-allowed" : "pointer",
            opacity: busy || (gate && !gate.ok) ? 0.55 : 1,
          }}
        >
          {busy ? "নথিভুক্ত হচ্ছে…" : "মধ্যস্থতা নির্ধারণ করুন"}
        </button>
      </section>

      {/* ---- history + session outcome ---- */}
      <section>
        <h4 style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", fontWeight: 700, margin: "0 0 12px" }}>
          মধ্যস্থতার ইতিহাস ({history.length})
        </h4>
        {history.length === 0 ? (
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text-secondary, #64748b)", margin: 0 }}>
            এখনো কোনো মধ্যস্থতা নথিভুক্ত হয়নি।
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {history.map((row) => {
              const outcome = (row.outcome ?? "scheduled") as MediationOutcome;
              const tone =
                outcome === "settled" ? { bg: "#dff3ea", fg: "#047857" }
                : outcome === "failed" ? { bg: "#fde8ec", fg: "#9f1239" }
                : { bg: "#e0edff", fg: "#1d4ed8" };
              const open = outcome === "scheduled";
              return (
                <div
                  key={row.id}
                  style={{ border: "1px solid var(--portal-border, #e2e8f0)", borderLeft: `4px solid ${tone.fg}`, borderRadius: 10, padding: "12px 14px" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem" }}>
                        {row.scheduled_at ? formatBn(new Date(row.scheduled_at)) : "তারিখ নির্ধারিত নয়"}
                      </strong>
                      <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-secondary, #64748b)", margin: "3px 0 0" }}>
                        {row.venue || "স্থান উল্লেখ নেই"}{row.mediator_name ? ` · ${row.mediator_name}` : ""}
                      </p>
                      {row.notes ? (
                        <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-secondary, #64748b)", margin: "3px 0 0" }}>
                          {row.notes}
                        </p>
                      ) : null}
                    </div>
                    <span
                      style={{
                        alignSelf: "flex-start",
                        background: tone.bg,
                        color: tone.fg,
                        borderRadius: 999,
                        padding: "4px 10px",
                        fontFamily: "var(--font-bn)",
                        fontSize: "0.6875rem",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {OUTCOME_LABELS[outcome]?.bn ?? row.outcome}
                    </span>
                  </div>

                  {open ? (
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => recordOutcome(row.id, "settled")}
                        disabled={busy}
                        style={{ background: "#047857", color: "#fff", border: "none", borderRadius: 8, padding: "0 14px", minHeight: 40, fontFamily: "var(--font-bn)", fontWeight: 700, cursor: busy ? "wait" : "pointer" }}
                      >
                        সালিশ হয়েছে
                      </button>
                      <button
                        type="button"
                        onClick={() => recordOutcome(row.id, "failed")}
                        disabled={busy}
                        style={{ background: "#fff", color: "#9f1239", border: "1.5px solid #9f1239", borderRadius: 8, padding: "0 14px", minHeight: 40, fontFamily: "var(--font-bn)", fontWeight: 700, cursor: busy ? "wait" : "pointer" }}
                      >
                        ব্যর্থ
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- mediator acceptance ---- */}
      {requests.length ? (
        <section>
          <h4 style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", fontWeight: 700, margin: "0 0 8px" }}>
            মধ্যস্থতাকারীর সম্মতি
          </h4>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {requests.map((r) => (
              <li key={r.id} style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text-secondary, #64748b)" }}>
                {r.mediator_name || "মধ্যস্থতাকারী"} —{" "}
                <strong style={{ color: r.status === "accepted" ? "#047857" : r.status === "declined" ? "#9f1239" : "#b45309" }}>
                  {r.status === "accepted" ? "গ্রহণ করেছেন" : r.status === "declined" ? "প্রত্যাখ্যান করেছেন" : "অপেক্ষমাণ"}
                </strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- the AI's drafting pass, shown clause by clause ----
          The point of rendering the SOURCES and not just the text is that a judge can
          see the difference between a term the record supports and a term the system
          refused to invent. An open clause is the deliverable, not a gap in the demo. */}
      {draft ? (
        <section style={{ border: "1.5px solid #7c3aed", borderRadius: 12, padding: "var(--space-lg, 16px)", background: "#faf5ff" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <h4 style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 700, margin: 0, color: "#5b21b6" }}>
              AI সালিশ সনদ প্রস্তুত করেছে
            </h4>
            <span style={{ fontSize: "0.6875rem", fontWeight: 700, color: "#7c3aed" }}>
              {draft.clauses.length - draft.openClauseIds.length}/{draft.clauses.length} অংশ নথি থেকে নির্ধারিত
            </span>
          </div>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "#5b21b6", margin: "0 0 12px", lineHeight: 1.65 }}>
            প্রতিটি অংশের পাশে তার উৎস দেখানো হয়েছে। যেটির উৎস নেই সেটি ফাঁকা রাখা হয়েছে — কারণ সালিশ সনদ একটি বাস্তবায়নযোগ্য দলিল, তাই নথিতে না থাকা কোনো শর্ত বানিয়ে লেখা যায় না।
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {draft.clauses.map((clause) => {
              const open = clause.bodyBn === null;
              return (
                <div
                  key={clause.id}
                  style={{
                    border: `1px solid ${open ? "#fcd34d" : "#ddd6fe"}`,
                    borderLeft: `4px solid ${open ? "#f59e0b" : "#7c3aed"}`,
                    borderRadius: 8,
                    background: "#fff",
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text, #0f172a)" }}>
                      {clause.headingBn}
                    </strong>
                    <span
                      style={{
                        fontSize: "0.625rem",
                        fontWeight: 700,
                        borderRadius: 999,
                        padding: "2px 8px",
                        background: open ? "#fffbeb" : "#f5f3ff",
                        color: open ? "#b45309" : "#6d28d9",
                      }}
                    >
                      {open ? "উৎস নেই — অনির্ধারিত" : `উৎস: ${clause.source}`}
                    </span>
                  </div>
                  {open ? (
                    <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "#b45309", margin: "6px 0 0", lineHeight: 1.6 }}>
                      {clause.needsBn}
                    </p>
                  ) : (
                    <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text, #0f172a)", margin: "6px 0 0", lineHeight: 1.7 }}>
                      {clause.bodyBn}
                    </p>
                  )}
                  {clause.legalBasisBn ? (
                    <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.6875rem", color: "var(--portal-text-secondary, #64748b)", margin: "5px 0 0" }}>
                      আইনি ভিত্তি: {clause.legalBasisBn}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <p
            style={{
              fontFamily: "var(--font-bn)",
              fontSize: "0.8125rem",
              fontWeight: 700,
              color: draft.readyToSign ? "#047857" : "#9f1239",
              margin: "12px 0 0",
              lineHeight: 1.65,
            }}
          >
            {draft.readyToSign ? "✓ " : "⚠ "}
            {draft.blockingBn}
          </p>
        </section>
      ) : null}

      {/* ---- settlement signatures ---- */}
      {settlement ? (
        <section style={{ border: "1px solid var(--portal-border, #e2e8f0)", borderRadius: 12, padding: "var(--space-lg, 16px)" }}>
          <h4 style={{ fontFamily: "var(--font-bn)", fontSize: "0.9375rem", fontWeight: 700, margin: "0 0 8px" }}>
            সালিশ সনদ
          </h4>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-secondary, #64748b)", margin: "0 0 10px" }}>
            তিন পক্ষ — আবেদনকারী, বিপরীত পক্ষ ও মধ্যস্থতাকারী — সবাই স্বাক্ষর করলেই প্রধান কর্মকর্তা প্রতিপালন করবেন।
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([
              ["applicant", "আবেদনকারী", Boolean(settlement.signed_applicant)],
              ["opposite", "বিপরীত পক্ষ", Boolean(settlement.signed_opposite)],
              ["mediator", "মধ্যস্থতাকারী", Boolean(settlement.signed_mediator)],
            ] as const).map(([role, label, signed]) => (
              <button
                key={role}
                type="button"
                disabled={busy || signed}
                onClick={() => sign(role)}
                style={{
                  border: signed ? "1.5px solid #047857" : "1.5px solid #cbd5e1",
                  background: signed ? "#dff3ea" : "#fff",
                  color: signed ? "#047857" : "#334155",
                  borderRadius: 8,
                  padding: "8px 12px",
                  minHeight: 40,
                  fontFamily: "var(--font-bn)",
                  fontWeight: 700,
                  fontSize: "0.8125rem",
                  cursor: signed || busy ? "not-allowed" : "pointer",
                  opacity: signed || busy ? 0.8 : 1,
                }}
              >
                {signed ? "✓ " : ""}{label}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
