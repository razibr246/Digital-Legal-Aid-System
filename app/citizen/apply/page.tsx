"use client";

import { useState } from "react";
import { CitizenShell } from "@/lib/ui/shell/CitizenShell";
import { Card, CardContent } from "@/lib/ui/components/Card";
import { FormField } from "@/lib/ui/components/FormField";
import { Button } from "@/lib/ui/components/Button";

export default function CitizenApply() {
  const [docketId, setDocketId] = useState("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successId, setSuccessId] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const res = await fetch("/api/portal/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docketId, summary }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create case");
      setSuccessId(data.case.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <CitizenShell>
      <div style={{ marginBottom: "var(--space-2xl)" }}>
        <h1 style={{ fontFamily: "var(--font-bn)", fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-xs)" }}>
          নতুন আবেদন
        </h1>
        <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text-secondary)" }}>
          ভয়েস ইনটেক সম্পন্ন করার পর প্রাপ্ত ডকেট আইডি দিয়ে পূর্ণাঙ্গ আবেদন করুন।
        </p>
      </div>

      <Card>
        <CardContent>
          {successId ? (
            <div style={{ textAlign: "center", padding: "var(--space-2xl) 0" }}>
              <div style={{ fontSize: "3rem", marginBottom: "var(--space-md)" }}>✅</div>
              <h2 style={{ fontFamily: "var(--font-bn)", fontSize: "1.5rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-sm)" }}>
                আবেদন সফলভাবে জমা হয়েছে
              </h2>
              <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text-secondary)", marginBottom: "var(--space-xl)" }}>
                আপনার আবেদনের ট্র্যাকিং নম্বর: <strong style={{ color: "var(--portal-accent-text)" }}>{successId}</strong>
              </p>
              <Button onClick={() => window.location.href = "/citizen/track?id=" + successId}>
                স্ট্যাটাস ট্র্যাক করুন
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                <FormField
                  label="ডকেট আইডি (Docket ID)"
                  type="text"
                  value={docketId}
                  onChange={(e) => setDocketId(e.target.value)}
                  placeholder="যেমন: DLAS-2025-XXXX"
                  required
                />
                
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                  <label style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", fontWeight: 600, color: "var(--portal-text)" }}>
                    ঘটনার সংক্ষিপ্ত বিবরণ
                  </label>
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="আপনার আইনি সমস্যার বিবরণ এখানে লিখুন..."
                    required
                    style={{
                      width: "100%",
                      minHeight: "120px",
                      padding: "var(--space-md)",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--portal-border)",
                      backgroundColor: "var(--portal-bg)",
                      fontFamily: "var(--font-bn)",
                      fontSize: "1rem",
                      color: "var(--portal-text)",
                      outline: "none",
                      resize: "vertical",
                    }}
                  />
                </div>
              </div>
              
              {error && (
                <div style={{ padding: "var(--space-md)", backgroundColor: "#fef2f2", color: "#b91c1c", borderRadius: "var(--radius-md)", fontSize: "0.875rem", fontFamily: "var(--font-bn)" }}>
                  {error}
                </div>
              )}
              
              <Button type="submit" loading={loading} fullWidth>
                আবেদন জমা দিন
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </CitizenShell>
  );
}
