"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CitizenShell } from "@/lib/ui/shell/CitizenShell";
import { Card, CardContent } from "@/lib/ui/components/Card";
import { FormField } from "@/lib/ui/components/FormField";
import { Button } from "@/lib/ui/components/Button";
import { StatusBadge } from "@/lib/ui/components/StatusBadge";
import { getStatusVariant, getStatusLabel } from "@/lib/data/case-store";

function TrackContent() {
  const searchParams = useSearchParams();
  const initialId = searchParams.get("id") || "";
  
  const [trackId, setTrackId] = useState(initialId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [caseData, setCaseData] = useState<any>(null);

  const fetchCase = async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError("");
    setCaseData(null);
    try {
      const res = await fetch(`/api/portal/cases/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Case not found");
      setCaseData(data.case);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialId) {
      fetchCase(initialId);
    }
  }, [initialId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCase(trackId);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2xl)" }}>
      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} style={{ display: "flex", gap: "var(--space-md)", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <FormField
                label="ট্র্যাকিং আইডি (Case ID)"
                type="text"
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                placeholder="যেমন: CASE-2025-0001"
                required
              />
            </div>
            <Button type="submit" loading={loading} style={{ height: "42px" }}>
              খুঁজুন
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <div style={{ padding: "var(--space-md)", backgroundColor: "#fef2f2", color: "#b91c1c", borderRadius: "var(--radius-md)", fontSize: "0.875rem", fontFamily: "var(--font-bn)", textAlign: "center" }}>
          {error === "Error: Forbidden" ? "আপনার এই মামলাটি দেখার অনুমতি নেই।" : "কোনো মামলা পাওয়া যায়নি। ট্র্যাকিং নম্বরটি যাচাই করুন।"}
        </div>
      )}

      {caseData && (
        <Card>
          <CardContent style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--portal-border)", paddingBottom: "var(--space-md)" }}>
              <div>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>ট্র্যাকিং নম্বর</p>
                <h2 style={{ fontFamily: "var(--font-bn)", fontSize: "1.25rem", fontWeight: 700, color: "var(--portal-text)" }}>{caseData.id}</h2>
              </div>
              <StatusBadge variant={getStatusVariant(caseData.status)}>{getStatusLabel(caseData.status)}</StatusBadge>
            </div>
            
            <div>
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", marginBottom: "var(--space-2xs)" }}>আবেদনের তারিখ</p>
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text)" }}>
                {new Date(caseData.createdAt).toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>

            <div>
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", marginBottom: "var(--space-2xs)" }}>ঘটনার বিবরণ</p>
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text)", lineHeight: 1.5 }}>
                {caseData.summary}
              </p>
            </div>

            {caseData.assignedLawyerId && (
              <div style={{ backgroundColor: "var(--portal-bg-subtle)", padding: "var(--space-md)", borderRadius: "var(--radius-md)" }}>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", marginBottom: "var(--space-2xs)" }}>নিযুক্ত প্যানেল আইনজীবী</p>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600, color: "var(--portal-text)" }}>
                  {caseData.assignedLawyerId}
                </p>
              </div>
            )}
            
            {caseData.dlaoNotes && (
              <div style={{ backgroundColor: "#f0fdf4", padding: "var(--space-md)", border: "1px solid #bbf7d0", borderRadius: "var(--radius-md)" }}>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "#166534", marginBottom: "var(--space-2xs)", fontWeight: 600 }}>অফিসারের মন্তব্য</p>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "#166534" }}>
                  {caseData.dlaoNotes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function CitizenTrack() {
  return (
    <CitizenShell>
      <div style={{ marginBottom: "var(--space-2xl)" }}>
        <h1 style={{ fontFamily: "var(--font-bn)", fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-xs)" }}>
          আবেদন ট্র্যাকিং
        </h1>
        <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text-secondary)" }}>
          আপনার ট্র্যাকিং নম্বর দিয়ে আবেদনের বর্তমান অবস্থা জানুন।
        </p>
      </div>

      <Suspense fallback={<div style={{ textAlign: "center", padding: "var(--space-xl)", color: "var(--portal-text-secondary)" }}>Loading...</div>}>
        <TrackContent />
      </Suspense>
    </CitizenShell>
  );
}
