"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { LawyerShell } from "@/lib/ui/shell/LawyerShell";
import { Card, CardContent } from "@/lib/ui/components/Card";
import { StatusBadge } from "@/lib/ui/components/StatusBadge";
import { Button } from "@/lib/ui/components/Button";
import { getStatusVariant, getStatusLabel } from "@/lib/data/case-store";

export default function LawyerCaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [caseData, setCaseData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const fetchCase = async () => {
    try {
      const res = await fetch(`/api/portal/cases/${id}`);
      const data = await res.json();
      if (data.ok) {
        setCaseData(data.case);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCase();
  }, [id]);

  const handleCloseCase = async () => {
    if (!confirm("আপনি কি নিশ্চিত যে এই মামলাটি নিষ্পত্তি করতে চান?")) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/portal/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      if (res.ok) {
        fetchCase();
      }
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <LawyerShell><div style={{ padding: "var(--space-xl)", textAlign: "center" }}>Loading...</div></LawyerShell>;
  if (!caseData) return <LawyerShell><div style={{ padding: "var(--space-xl)", textAlign: "center" }}>Case not found</div></LawyerShell>;

  return (
    <LawyerShell>
      <div style={{ marginBottom: "var(--space-lg)" }}>
        <Link href="/lawyer" style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-accent)", textDecoration: "none", fontWeight: 600 }}>
          ← ড্যাশবোর্ডে ফিরে যান
        </Link>
      </div>

      <div style={{ marginBottom: "var(--space-2xl)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-bn)", fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-xs)" }}>
            মামলা: {caseData.id}
          </h1>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text-secondary)" }}>
            আবেদনকারী: {caseData.citizenName} ({caseData.citizenPhone})
          </p>
        </div>
        <StatusBadge variant={getStatusVariant(caseData.status)}>{getStatusLabel(caseData.status)}</StatusBadge>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
        <Card>
          <CardContent>
            <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700, marginBottom: "var(--space-md)" }}>ঘটনার বিবরণ</h3>
            <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text)", lineHeight: 1.6 }}>
              {caseData.summary}
            </p>
            
            <div style={{ marginTop: "var(--space-lg)", paddingTop: "var(--space-md)", borderTop: "1px solid var(--portal-border)" }}>
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>ভয়েস ডকেট আইডি (বিস্তারিত তথ্যের জন্য)</p>
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600 }}>{caseData.docketId}</p>
            </div>
          </CardContent>
        </Card>

        {caseData.dlaoNotes && (
          <Card style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <CardContent>
              <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700, color: "#166534", marginBottom: "var(--space-md)" }}>DLAO অফিসারের মন্তব্য</h3>
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "#166534", lineHeight: 1.6 }}>
                {caseData.dlaoNotes}
              </p>
            </CardContent>
          </Card>
        )}

        {caseData.status !== "closed" && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={handleCloseCase} loading={updating} style={{ backgroundColor: "var(--status-closed)", color: "var(--portal-white)" }}>
              মামলা নিষ্পত্তি করুন
            </Button>
          </div>
        )}
      </div>
    </LawyerShell>
  );
}
