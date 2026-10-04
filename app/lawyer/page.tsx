"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LawyerShell } from "@/lib/ui/shell/LawyerShell";
import { Card, CardContent } from "@/lib/ui/components/Card";
import { StatusBadge } from "@/lib/ui/components/StatusBadge";
import { EmptyState } from "@/lib/ui/components/EmptyState";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { getStatusVariant, getStatusLabel } from "@/lib/data/case-store";

export default function LawyerDashboard() {
  const { currentUser } = useVoiceSession();
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/cases")
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setCases(data.cases);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <LawyerShell>
      <div style={{ marginBottom: "var(--space-2xl)" }}>
        <h1 style={{ fontFamily: "var(--font-bn)", fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-xs)" }}>
          স্বাগতম, {currentUser?.displayName || "আইনজীবী"}
        </h1>
        <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text-secondary)" }}>
          আপনার জন্য বরাদ্দকৃত সকল মামলার তালিকা ও বিস্তারিত তথ্য।
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "var(--space-lg)", marginBottom: "var(--space-2xl)" }}>
        <Card style={{ backgroundColor: "var(--portal-accent-subtle)", border: "none" }}>
          <CardContent style={{ padding: "var(--space-lg)" }}>
            <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>মোট মামলা</p>
            <p style={{ fontFamily: "var(--font-bn)", fontSize: "2rem", fontWeight: 700, color: "var(--portal-text)" }}>{cases.length}</p>
          </CardContent>
        </Card>
      </div>

      <h2 style={{ fontFamily: "var(--font-bn)", fontSize: "1.25rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-lg)" }}>
        বরাদ্দকৃত মামলাসমূহ
      </h2>

      {loading ? (
        <div style={{ padding: "var(--space-xl)", textAlign: "center", color: "var(--portal-text-secondary)" }}>Loading...</div>
      ) : cases.length === 0 ? (
        <EmptyState 
          title="কোনো মামলা পাওয়া যায়নি" 
          description="বর্তমানে আপনার জন্য কোনো নতুন মামলা বরাদ্দ করা হয়নি।" 
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          {cases.map((c) => (
            <Link key={c.id} href={`/lawyer/cases/${c.id}`} style={{ textDecoration: "none" }}>
              <Card style={{ transition: "transform var(--transition-fast)" }}>
                <CardContent style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-2xs)" }}>
                      {c.id}
                    </h3>
                    <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "400px" }}>
                      {c.summary}
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-xs)" }}>
                    <StatusBadge variant={getStatusVariant(c.status)}>{getStatusLabel(c.status)}</StatusBadge>
                    <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.75rem", color: "var(--portal-text-subtle)" }}>
                      {new Date(c.createdAt).toLocaleDateString('bn-BD')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </LawyerShell>
  );
}
