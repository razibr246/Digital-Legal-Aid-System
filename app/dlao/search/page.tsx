"use client";

import { useState } from "react";
import Link from "next/link";
import { DlaoShell } from "@/lib/ui/shell/DlaoShell";
import { Card, CardContent } from "@/lib/ui/components/Card";
import { FormField } from "@/lib/ui/components/FormField";
import { Button } from "@/lib/ui/components/Button";
import { StatusBadge } from "@/lib/ui/components/StatusBadge";
import { getStatusVariant, getStatusLabel } from "@/lib/data/case-store";

export default function DlaoSearch() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    
    setLoading(true);
    setHasSearched(true);
    
    try {
      // In a real app we'd have a specific search endpoint. 
      // For the demo we fetch all and filter client side.
      const res = await fetch("/api/portal/cases");
      const data = await res.json();
      if (data.ok) {
        const q = query.toLowerCase();
        // Every one of these fields is nullable on PortalCase — `citizenPhone` is null
        // whenever the application has no contact number, and `docketId` is null on an
        // application that was never docketed. Calling .toLowerCase() or .includes() on
        // them unguarded threw a TypeError that blanked the whole results list, so a
        // single incomplete row took the search down.
        const includes = (value: unknown): boolean =>
          typeof value === "string" && value.toLowerCase().includes(q);
        const filtered = data.cases.filter(
          (c: any) =>
            includes(c.id) ||
            includes(c.citizenPhone) ||
            includes(c.citizenName) ||
            includes(c.docketId) ||
            includes(c.applicationId) ||
            includes(c.problem),
        );
        setResults(filtered);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <DlaoShell>
      <div style={{ marginBottom: "var(--space-lg)" }}>
        <Link href="/dlao" style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-accent)", textDecoration: "none", fontWeight: 600 }}>
          ← ড্যাশবোর্ডে ফিরে যান
        </Link>
      </div>

      <div style={{ marginBottom: "var(--space-2xl)" }}>
        <h1 style={{ fontFamily: "var(--font-bn)", fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-xs)" }}>
          অনুসন্ধান
        </h1>
        <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text-secondary)" }}>
          মামলার আইডি, আবেদনকারীর নাম, মোবাইল নম্বর বা ডকেট আইডি দিয়ে খুঁজুন।
        </p>
      </div>

      <Card style={{ marginBottom: "var(--space-xl)" }}>
        <CardContent>
          <form onSubmit={handleSearch} style={{ display: "flex", gap: "var(--space-md)", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <FormField
                label="সার্চ ক্যোয়ারি"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="যেমন: CASE-2025-0001 অথবা রহিম"
              />
            </div>
            <Button type="submit" loading={loading} style={{ height: "42px" }}>
              খুঁজুন
            </Button>
          </form>
        </CardContent>
      </Card>

      {hasSearched && !loading && results.length === 0 && (
        <div style={{ padding: "var(--space-xl)", textAlign: "center", backgroundColor: "var(--portal-bg-subtle)", borderRadius: "var(--radius-lg)", border: "1px dashed var(--portal-border)" }}>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", color: "var(--portal-text-secondary)" }}>
            কোনো ফলাফল পাওয়া যায়নি।
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-xs)" }}>
            ফলাফল ({results.length})
          </h3>
          {results.map((c) => (
            <Link key={c.id} href={`/dlao/cases/${c.id}`} style={{ textDecoration: "none" }}>
              <Card style={{ transition: "all var(--transition-fast)" }}>
                <CardContent style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-2xs)" }}>
                      <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700, color: "var(--portal-text)" }}>
                        {c.id}
                      </h3>
                      <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)" }}>
                        {c.citizenName} ({c.citizenPhone})
                      </span>
                    </div>
                  </div>
                  <StatusBadge variant={getStatusVariant(c.status)}>{getStatusLabel(c.status)}</StatusBadge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </DlaoShell>
  );
}
