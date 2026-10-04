"use client";

import { useEffect, useState } from "react";
import type { SettlementDraft } from "@/lib/case/settlement-draft";

/**
 * The settlement as a printable document.
 *
 * Why the browser prints it rather than the server writing a .pdf: Bangla needs complex-
 * script shaping. The conjuncts in "সালিশকরণ" and "স্বাক্ষর" have to be reordered and
 * ligated, and a PDF library emitting raw Unicode produces boxes — there is no font file
 * in this repo to embed and no shaper on the server. The browser already renders this
 * site's Bangla correctly, so `window.print()` produces a correct A4 PDF with no
 * dependency, no font licensing question, and no broken glyphs.
 *
 * The document is honest about being unsigned: an open clause is printed as a ruled blank
 * with the question that has to be answered, never as an invented term.
 */

const BN = "০১২৩৪৫৬৭৮৯";
const toBn = (s: string) => s.replace(/[0-9]/g, (d) => BN[Number(d)]);

export default function SettlementPrintPage() {
  const [caseId, setCaseId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SettlementDraft | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("caseId");
    if (!id) { setError("caseId দেওয়া হয়নি।"); return; }
    setCaseId(id);
    (async () => {
      const res = await fetch(`/api/portal/mediations?caseId=${encodeURIComponent(id)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const body = await res.json();
      if (!res.ok || !body.ok) { setError(body.error || "সালিশ সনদ লোড করা যায়নি।"); return; }
      setDraft(body.draft ?? null);
    })();
  }, []);

  // Print once the document has actually rendered, or the page comes out blank.
  useEffect(() => {
    if (!draft) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [draft]);

  function downloadText() {
    if (!draft) return;
    const body = draft.clauses
      .map((c) => (c.bodyBn === null ? `[${c.headingBn} — অনির্ধারিত: ${c.needsBn}]` : c.bodyBn))
      .join("\n");
    const blob = new Blob(
      [`${draft.titleBn}\n${draft.docketId}\n\n${body}\n\n— ${draft.blockingBn}\n`],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.docketId}-settlement.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return <main style={{ padding: 40, fontFamily: "var(--font-bn)" }}><p role="alert">{error}</p></main>;
  }
  if (!draft) {
    return <main style={{ padding: 40, fontFamily: "var(--font-bn)" }}><p>সালিশ সনদ প্রস্তুত হচ্ছে…</p></main>;
  }

  return (
    <>
      <style>{`
        @page { size: A4; margin: 18mm 16mm; }
        @media print {
          .no-print { display: none !important; }
          html, body { background: #fff !important; }
        }
        @media screen {
          body { background: #e2e8f0; margin: 0; padding: 24px; }
        }
      `}</style>

      <div className="no-print" style={{ maxWidth: 210, margin: "0 auto 16px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontFamily: "var(--font-bn)" }}>
        <button
          onClick={() => window.print()}
          style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontFamily: "var(--font-bn)", cursor: "pointer" }}
        >
          PDF হিসেবে সংরক্ষণ করুন
        </button>
        <button
          onClick={downloadText}
          style={{ background: "#fff", color: "#0f172a", border: "1.5px solid #94a3b8", borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontFamily: "var(--font-bn)", cursor: "pointer" }}
        >
          লেখা ফাইল নামান
        </button>
        <span style={{ fontSize: "0.8125rem", color: "#475569" }}>
          প্রিন্ট উইন্ডো থেকে “Save as PDF” বেছে নিন — বাংলা অক্ষর সঠিকভাবে সাজবে।
        </span>
      </div>

      <article
        style={{
          maxWidth: 210,
          minHeight: 297,
          margin: "0 auto",
          background: "#fff",
          padding: "18mm 16mm",
          boxShadow: "0 4px 24px rgba(15,23,42,0.18)",
          fontFamily: "var(--font-bn)",
          color: "#0f172a",
          boxSizing: "border-box",
        }}
      >
        <header style={{ textAlign: "center", borderBottom: "2px solid #0f172a", paddingBottom: 12, marginBottom: 18 }}>
          <p style={{ fontSize: "0.75rem", margin: 0, letterSpacing: "0.06em" }}>গণপ্রজাতন্ত্রী আইনি সহায়তা প্রদান সংস্থা</p>
          <p style={{ fontSize: "0.75rem", margin: "2px 0 0" }}>জাতীয় আইনগত সহায়তা প্রদান আইন, ২০০৬</p>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "10px 0 4px" }}>{draft.titleBn}</h1>
          <p style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0 }}>নথি নম্বর: {draft.docketId}</p>
        </header>

        {!draft.readyToSign ? (
          <div style={{ border: "1.5px solid #b45309", background: "#fffbeb", padding: "10px 12px", borderRadius: 6, marginBottom: 16, fontSize: "0.8125rem", lineHeight: 1.7, color: "#92400e" }}>
            <strong>সতর্কতা: এটি প্রস্তাবি।</strong> {draft.blockingBn} নিচের ফাঁকা অংশগুলো উভয় পক্ষকে উপস্থিত করে পূরণ না করা পর্যন্ত এই দলিল কার্যকর হবে না।
          </div>
        ) : null}

        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {draft.clauses.map((clause) => {
            const open = clause.bodyBn === null;
            return (
              <div key={clause.id}>
                <h2 style={{ fontSize: "0.875rem", fontWeight: 700, margin: "0 0 5px" }}>{clause.headingBn}</h2>
                {open ? (
                  <>
                    <p style={{ fontSize: "0.8125rem", margin: "0 0 6px", color: "#92400e", lineHeight: 1.7 }}>
                      <em>{clause.needsBn}</em>
                    </p>
                    <div style={{ borderBottom: "1px dotted #94a3b8", height: 22 }} />
                    <div style={{ borderBottom: "1px dotted #94a3b8", height: 22 }} />
                  </>
                ) : (
                  <p style={{ fontSize: "0.875rem", margin: 0, lineHeight: 1.9 }}>{clause.bodyBn}</p>
                )}
                {clause.legalBasisBn ? (
                  <p style={{ fontSize: "0.6875rem", margin: "5px 0 0", color: "#64748b" }}>আইনি ভিত্তি: {clause.legalBasisBn}</p>
                ) : null}
              </div>
            );
          })}
        </section>

        <section style={{ marginTop: 28, borderTop: "1px solid #cbd5e1", paddingTop: 14 }}>
          <p style={{ fontSize: "0.75rem", color: "#475569", margin: "0 0 16px" }}>
            তিন পক্ষ স্বাক্ষর করলেই প্রধান কর্মকর্তা প্রতিপালন করবেন। স্বাক্ষরের তারিখ ও নম্বর নিজে লিখতে হবে।
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, fontSize: "0.8125rem" }}>
            {["আবেদনকারী", "বিপরীত পক্ষ", "মধ্যস্থতাকারী"].map((role) => (
              <div key={role}>
                <div style={{ borderBottom: "1px solid #0f172a", height: 34 }} />
                <p style={{ margin: "4px 0 0", fontWeight: 700 }}>{role}</p>
                <div style={{ borderBottom: "1px dotted #94a3b8", height: 20, marginTop: 8 }} />
                <p style={{ margin: "3px 0 0", fontSize: "0.6875rem", color: "#64748b" }}>তারিখ ও নম্বর</p>
              </div>
            ))}
          </div>
        </section>

        <footer style={{ marginTop: 24, borderTop: "1px solid #cbd5e1", paddingTop: 8, fontSize: "0.625rem", color: "#64748b", textAlign: "center" }}>
          <p style={{ margin: 0 }}>
            {draft.docketId} · কেস আইডি {caseId} · এই দলিলটি সিস্টেম-প্রস্তুত প্রস্তাবি; প্রতিটি অংশ কেস নথি থেকে নির্ধারিত।
          </p>
          <p style={{ margin: "2px 0 0" }}>পৃষ্ঠা ১ / ১ · {toBn(new Date().toISOString().slice(0, 10))}</p>
        </footer>
      </article>
    </>
  );
}
