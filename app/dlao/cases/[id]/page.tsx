"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { DlaoShell } from "@/lib/ui/shell/DlaoShell";
import { Card, CardContent } from "@/lib/ui/components/Card";
import { StatusBadge } from "@/lib/ui/components/StatusBadge";
import { RiskBadgeRow } from "@/components/risk-badges";
import AiLawyerPicker from "@/components/ai-lawyer-picker";
import { Button } from "@/lib/ui/components/Button";
import { getStatusVariant, getStatusLabel } from "@/lib/data/case-store";
import type { PortalCase } from "@/lib/data/case-projection";

function getUrgencyLabel(urgency: string): string {
  if (urgency === "emergency_danger") return "জরুরি";
  if (urgency === "urgent") return "অগ্রাধিকার";
  return "স্বাভাবিক";
}

function getPriorityLabel(priority: string): string {
  if (priority === "urgent") return "অতি জরুরি";
  if (priority === "high") return "উচ্চ";
  return "স্বাভাবিক";
}

function getSeverityLabel(severity: string | null): string {
  if (severity === "emergency") return "জরুরি পরিস্থিতি";
  if (severity === "high") return "উচ্চ ঝুঁকি";
  if (severity === "medium") return "মাঝারি ঝুঁকি";
  if (severity === "low") return "কম ঝুঁকি";
  return "নির্ধারিত হয়নি";
}

export default function DlaoCaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [caseData, setCaseData] = useState<PortalCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [recording, setRecording] = useState<{ id: string; durationMs: number; createdAt: string } | null>(null);

  // Form state
  const [assignedLawyer, setAssignedLawyer] = useState("");
  const [assignedLawyerName, setAssignedLawyerName] = useState("");
  const [status, setStatus] = useState("");
  const [dlaoNotes, setDlaoNotes] = useState("");
  const [semanticBangla, setSemanticBangla] = useState("");
  const [semanticIntent, setSemanticIntent] = useState("");
  const [semanticReviewState, setSemanticReviewState] = useState<"idle" | "saving" | "saved">("idle");

  const fetchCase = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/cases/${id}`);
      const data = await res.json();
      if (data.ok) {
        setCaseData(data.case);
        setAssignedLawyer(data.case.assignedLawyerId || "");
        setAssignedLawyerName(data.case.assignedLawyerName || "");
        setStatus(data.case.status);
         setDlaoNotes(data.case.dlaoNotes || "");
         setSemanticBangla(data.case.semanticNormalizedBangla || data.case.problemStatement || "");
         setSemanticIntent(data.case.semanticIntent || "");
         setRecording(data.case.recording || null);
         if (data.case.docketId) {
          try {
            const recordingResponse = await fetch(`/api/recordings?docketId=${encodeURIComponent(data.case.docketId)}`);
            const recordingPayload = await recordingResponse.json().catch(() => null);
            setRecording(recordingPayload?.recording || null);
          } catch {
            setRecording(null);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchCase();
  }, [fetchCase]);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/portal/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          assignedLawyerId: assignedLawyer || null,
          dlaoNotes,
        }),
      });
      if (res.ok) {
        fetchCase();
      }
    } finally {
      setUpdating(false);
    }
  };

  const handleSemanticReview = async (decision: "approved" | "rejected") => {
    setSemanticReviewState("saving");
    try {
      const response = await fetch(`/api/portal/cases/${id}/semantic-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, correctedBangla: semanticBangla, correctedIntent: semanticIntent }),
      });
      if (response.ok) setSemanticReviewState("saved");
    } finally {
      setSemanticReviewState((current) => (current === "saved" ? "saved" : "idle"));
    }
  };

  if (loading) return <DlaoShell><div style={{ padding: "var(--space-xl)", textAlign: "center" }}>Loading...</div></DlaoShell>;
  if (!caseData) return <DlaoShell><div style={{ padding: "var(--space-xl)", textAlign: "center" }}>Case not found</div></DlaoShell>;

  return (
    <DlaoShell>
      <div style={{ marginBottom: "var(--space-lg)" }}>
        <Link href="/dlao" style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-accent)", textDecoration: "none", fontWeight: 600 }}>
          ← ড্যাশবোর্ডে ফিরে যান
        </Link>
      </div>

      <div style={{ marginBottom: "var(--space-2xl)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bn)", fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-xs)" }}>
             আবেদন: {caseData.applicationId || caseData.docketId || caseData.id}
          </h1>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text-secondary)" }}>
             আবেদনকারী: {caseData.applicantName || caseData.citizenName} ({caseData.primaryContactNumber || caseData.citizenPhone || "ফোন নেই"})
          </p>
        </div>
        <StatusBadge variant={getStatusVariant(caseData.status)}>{getStatusLabel(caseData.status)}</StatusBadge>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-xl)", alignItems: "start" }}>
        {/* Left Column: Details */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
           <Card>
             <CardContent>
               <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700, marginBottom: "var(--space-md)" }}>আবেদনের তথ্য</h3>
               <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)" }}>
                 <div>
                   <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>আবেদন আইডি</p>
                   <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600 }}>{caseData.applicationId || caseData.docketId}</p>
                 </div>
                 <div>
                   <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>আবেদনের সময়</p>
                   <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600 }}>{new Date(caseData.applicationTime || caseData.createdAt).toLocaleString("bn-BD")}</p>
                 </div>
                 <div>
                   <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>আবেদনকারীর নাম</p>
                   <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600 }}>{caseData.applicantName || caseData.citizenName}</p>
                 </div>
                 <div>
                   <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>প্রাথমিক যোগাযোগ নম্বর</p>
                   <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600 }}>{caseData.primaryContactNumber || caseData.citizenPhone || "ফোন নেই"}</p>
                 </div>
                 <div>
                   <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>প্রতিবন্ধকতা</p>
                   <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600 }}>{caseData.hasDisability ? caseData.disabilityType || "হ্যাঁ" : "না"}</p>
                 </div>
                 <div>
                   <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>লিঙ্গ</p>
                   <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600 }}>{caseData.gender || "দেওয়া হয়নি"}</p>
                 </div>
                 <div style={{ gridColumn: "1 / -1" }}>
                   <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>ঠিকানা</p>
                   <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600 }}>{caseData.address || "দেওয়া হয়নি"}</p>
                 </div>
               </div>
             </CardContent>
            </Card>
            <Card>
              <CardContent>
                <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700, marginBottom: "var(--space-md)" }}>ডিএলএও পর্যালোচনা সারসংক্ষেপ</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                  <div>
                    <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>আবেদনের সারসংক্ষেপ</p>
                    <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", lineHeight: 1.6 }}>{caseData.intakeSummary || caseData.problemStatement}</p>
                  </div>
                  {/* Was three rows of small bold text in a two-column grid, which made
                      the most important fact on the case look the same as the district.
                      Badges lead, so triage is readable at a glance. */}
                  <div style={{ marginBottom: "var(--space-md)" }}>
                    <RiskBadgeRow
                      urgency={caseData.urgency}
                      priority={caseData.priority}
                      severity={caseData.severityLevel}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)" }}>
                    {caseData.severityCategory ? (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>স্ক্রিনিং বিভাগ</p>
                        <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600 }}>{caseData.severityCategory}</p>
                      </div>
                    ) : null}
                    {Array.isArray(caseData.severityFactors) && caseData.severityFactors.length ? (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>ঝুঁকির কারণ</p>
                        <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600 }}>{caseData.severityFactors.join(", ")}</p>
                      </div>
                    ) : null}
                    <div>
                      <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>বিভাগ</p>
                      <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600 }}>{caseData.severityCategory || "নির্ধারিত হয়নি"}</p>
                    </div>
                  </div>
                  {caseData.severityFactors.length > 0 && (
                    <div>
                      <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>ঝুঁকির কারণ</p>
                      <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem" }}>{caseData.severityFactors.join(", ")}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            {caseData.sourceLanguage !== "bn" && (
             <Card>
               <CardContent>
                 <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700, marginBottom: "var(--space-md)" }}>আভাষিক ব্যাখ্যা</h3>
                 <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                   <div>
                     <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>আবেদনের ভাষা</p>
                     <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600 }}>{caseData.sourceLanguage === "marma" ? "মারমা" : "চাকমা"}</p>
                   </div>
                   <div>
                     <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>মূল উচ্চারণ</p>
                     <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text)" }}>{caseData.originalTranscript || "দেওয়া হয়নি"}</p>
                   </div>
                   <div>
                     <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>বাংলা অর্থ</p>
                     <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text)" }}>{caseData.semanticNormalizedBangla || caseData.problemStatement}</p>
                   </div>
                   <div>
                     <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>আইনি বিষয়</p>
                     <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600 }}>{caseData.semanticIntent || "নির্ধারিত হয়নি"}</p>
                   </div>
                    <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.8rem", color: "var(--portal-text-muted)" }}>
                      সেমান্টিক মিলের নির্ভরযোগ্যতা: {caseData.semanticConfidence !== null ? `${Math.round(caseData.semanticConfidence * 100)}%` : "দেওয়া হয়নি"} · ব্যবহারকারীর নিশ্চিতকরণ: {caseData.semanticMatched ? "হ্যাঁ" : "যাচাই করা হয়নি"}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)", marginTop: "var(--space-sm)" }}>
                      <label style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", fontWeight: 600 }}>যাচাইকৃত বাংলা অর্থ</label>
                      <textarea value={semanticBangla} onChange={(event) => setSemanticBangla(event.target.value)} style={{ padding: "var(--space-sm)", borderRadius: "var(--radius-md)", border: "1px solid var(--portal-border)", fontFamily: "var(--font-bn)", minHeight: "72px" }} />
                      <label style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", fontWeight: 600 }}>যাচাইকৃত আইনি বিষয়</label>
                      <input value={semanticIntent} onChange={(event) => setSemanticIntent(event.target.value)} style={{ padding: "var(--space-sm)", borderRadius: "var(--radius-md)", border: "1px solid var(--portal-border)", fontFamily: "var(--font-bn)" }} />
                      <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                        <Button onClick={() => void handleSemanticReview("approved")} loading={semanticReviewState === "saving"}>অর্থ গ্রহণ করুন</Button>
                        <Button onClick={() => void handleSemanticReview("rejected")} loading={semanticReviewState === "saving"} variant="secondary">পুনরায় পর্যালোচনা</Button>
                      </div>
                      {semanticReviewState === "saved" && <span style={{ color: "var(--status-success)", fontSize: "0.8rem" }}>পর্যালোচনা সংরক্ষিত হয়েছে।</span>}
                    </div>
                  </div>
               </CardContent>
             </Card>
           )}
           <Card>
             <CardContent>
               <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700, marginBottom: "var(--space-md)" }}>সমস্যার বিবরণ</h3>
               <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text)", lineHeight: 1.6 }}>
                   {caseData.problemStatement || caseData.summary}
               </p>

               <div style={{ marginTop: "var(--space-lg)", paddingTop: "var(--space-md)", borderTop: "1px solid var(--portal-border)" }}>
                 <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>ভয়েস ডকেট আইডি</p>
                 <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600 }}>{caseData.docketId}</p>
               </div>
             </CardContent>
           </Card>
           <Card>
             <CardContent>
               <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700, marginBottom: "var(--space-md)" }}>কথোপকথন রেকর্ডিং</h3>
               {recording ? (
                 <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                   <audio controls preload="metadata" src={`/api/recordings?recordingId=${encodeURIComponent(recording.id)}`} style={{ width: "100%" }} />
                   <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-secondary)" }}>
                     {Math.max(1, Math.round(recording.durationMs / 60000))} মিনিটের রেকর্ডিং · {new Date(recording.createdAt).toLocaleString("bn-BD")}
                   </span>
                 </div>
               ) : (
                 <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>
                   এই আবেদনের জন্য রেকর্ডিং এখনও প্রসেস হচ্ছে বা সংরক্ষিত হয়নি।
                 </p>
               )}
             </CardContent>
           </Card>
         </div>

          {/* Right Column: Actions */}


        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          <Card>
            <CardContent style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700 }}>মামলা পরিচালনা</h3>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                <label style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", fontWeight: 600, color: "var(--portal-text)" }}>অবস্থা পরিবর্তন</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={{
                    padding: "var(--space-sm)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--portal-border)",
                    fontFamily: "var(--font-bn)",
                    fontSize: "1rem"
                  }}
                >
                  <option value="pending_review">পর্যালোচনার অপেক্ষায়</option>
                  <option value="needs_documents">কাগজপত্র প্রয়োজন</option>
                  <option value="assigned">আইনজীবী নিযুক্ত</option>
                  <option value="closed">নিষ্পত্তি</option>
                </select>
              </div>

              {/* Was a <select> hardcoded to a single mock lawyer, so the case page
                  offered one fake option and nothing behind the placeholder. The real
                  roster and the recommendation engine existed on another tab, where
                  nobody looks for a control. */}
              <AiLawyerPicker
                caseId={String(caseData.id || "")}
                caseLabel={String(caseData.applicationId || caseData.docketId || caseData.id)}
                problemType={
                  caseData.severityCategory
                  ?? (caseData.problemStatement?.split(":")[1]?.trim() || caseData.problemStatement || null)
                }
                current={assignedLawyerName ? { id: assignedLawyer, name: assignedLawyerName } : null}
                onAssigned={(name) => {
                  setAssignedLawyerName(name);
                  setStatus("assigned");
                }}
              />

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                <label style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", fontWeight: 600, color: "var(--portal-text)" }}>অফিসিয়াল মন্তব্য</label>
                <textarea
                  value={dlaoNotes}
                  onChange={(e) => setDlaoNotes(e.target.value)}
                  placeholder="আপনার মন্তব্য এখানে লিখুন..."
                  style={{
                    padding: "var(--space-sm)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--portal-border)",
                    fontFamily: "var(--font-bn)",
                    fontSize: "1rem",
                    minHeight: "80px",
                    resize: "vertical"
                  }}
                />
              </div>

              <div style={{ marginTop: "var(--space-sm)" }}>
                <Button fullWidth onClick={handleUpdate} loading={updating}>
                  আপডেট সংরক্ষণ করুন
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DlaoShell>
  );
}
