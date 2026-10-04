"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CitizenShell } from "@/lib/ui/shell/CitizenShell";
import { Card, CardContent } from "@/lib/ui/components/Card";
import { StatusBadge } from "@/lib/ui/components/StatusBadge";
import { EmptyState } from "@/lib/ui/components/EmptyState";
import { Button } from "@/lib/ui/components/Button";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { VerificationCard } from "@/components/identity/verification-card";
import ConsultationPanel from "@/components/consultation-panel";
import CaseProgressPanel from "@/components/case-progress-panel";
import { VerificationProgressBar } from "@/components/identity/verification-progress";
import { getStatusVariant, getStatusLabel } from "@/lib/data/case-store";
import { personaForUserId } from "@/lib/demo/personas";
import { PersonaSwitcher } from "@/components/demo/persona-switcher";
import type { PortalCase } from "@/lib/data/case-projection";

export default function CitizenDashboard() {
  const router = useRouter();
  const { currentUser } = useVoiceSession();
  const [cases, setCases] = useState<PortalCase[]>([]);
  const [loading, setLoading] = useState(true);
  // Bumped by the consultation so the case panel re-reads the case once it exists.
  const [caseToken, setCaseToken] = useState(0);

  // Null for a real applicant, which is what keeps the demo banner off their screen.
  const demoPersona = personaForUserId(currentUser?.id);

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
    <CitizenShell>
      <div style={{ marginBottom: "var(--space-2xl)" }}>
        <h1 style={{ fontFamily: "var(--font-bn)", fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-xs)" }}>
          স্বাগতম, {currentUser?.displayName || "নাগরিক"}
        </h1>
        <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text-secondary)" }}>
          আপনার আইনি সহায়তার বর্তমান অবস্থা এবং আবেদনসমূহ।
        </p>
      </div>

      <VerificationProgressBar className="mb-6" />

      {/* Demo banner. Only rendered when the session IS one of the five seeded
          personas — a real applicant never sees this, because the match is on the
          seeded users.id and a real account cannot have one. */}
      {demoPersona && (
        <Card style={{ marginBottom: "var(--space-2xl)", borderStyle: "dashed" }}>
          <CardContent style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  background: "var(--portal-accent)",
                  color: "var(--portal-text-on-accent)",
                  borderRadius: "var(--radius-full)",
                  padding: "3px 8px",
                }}
              >
                {demoPersona.code}
              </span>
              <h2
                style={{
                  fontFamily: "var(--font-bn)",
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--portal-text)",
                  margin: 0,
                }}
              >
                ডেমো মোড — {demoPersona.nameBn}, {demoPersona.districtBn}
              </h2>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-lg)" }}>
              <div>
                <h3
                  style={{
                    fontFamily: "var(--font-bn)",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "var(--portal-text-secondary)",
                    margin: "0 0 6px",
                  }}
                >
                  পরিস্থিতি
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-bn)",
                    fontSize: "0.8125rem",
                    lineHeight: 1.6,
                    color: "var(--portal-text)",
                    margin: 0,
                  }}
                >
                  {demoPersona.situationBn}
                </p>
              </div>

              <div>
                <h3
                  style={{
                    fontFamily: "var(--font-bn)",
                    fontSize: "0.6875rem",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "var(--portal-text-secondary)",
                    margin: "0 0 6px",
                  }}
                >
                  যা দেখা উচিত
                </h3>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                  {demoPersona.evidenceBn.map((line) => (
                    <li
                      key={line}
                      style={{
                        display: "flex",
                        gap: 8,
                        fontFamily: "var(--font-bn)",
                        fontSize: "0.8125rem",
                        lineHeight: 1.55,
                        color: "var(--portal-text-secondary)",
                      }}
                    >
                      <span aria-hidden="true" style={{ color: "var(--portal-accent)", flexShrink: 0, fontWeight: 700 }}>
                        ☐
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--portal-border)", paddingTop: "var(--space-md)" }}>
              <p
                style={{
                  fontFamily: "var(--font-bn)",
                  fontSize: "0.75rem",
                  color: "var(--portal-text-secondary)",
                  margin: "0 0 var(--space-sm)",
                }}
              >
                অন্য কারও নজরে দেখতে চাইলে — এক ক্লিকে বদলান:
              </p>
              <PersonaSwitcher variant="compact" activePersonaId={demoPersona.id} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* The DLAO callback comes first: it is the step that turns an application into a case. */}
      <ConsultationPanel
        applicantName={currentUser?.displayName || "আবেদনকারী"}
        onConsultationComplete={() => setCaseToken((n) => n + 1)}
      />

      {/* Case progress, the appointed lawyer, and a route to complain about them. */}
      <CaseProgressPanel refreshToken={caseToken} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--space-lg)", marginBottom: "var(--space-2xl)" }}>
        <VerificationCard />
        <Link href="/citizen/profile" style={{ textDecoration: "none", color: "inherit" }}>
          <Card style={{ height: "100%", transition: "transform var(--transition-fast)", cursor: "pointer" }}>
            <CardContent style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "var(--space-xl)", textAlign: "center", gap: "var(--space-md)" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "var(--portal-accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--portal-accent-text)", fontSize: "1.5rem" }}>
                👤
              </div>
              <div>
                <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700 }}>আমার প্রোফাইল</h3>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", marginTop: "var(--space-xs)" }}>
                  অ্যাকাউন্ট, যাচাই ও আবেদনের সারসংক্ষেপ
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/citizen/apply" style={{ textDecoration: "none", color: "inherit" }}>
          <Card style={{ height: "100%", transition: "transform var(--transition-fast)", cursor: "pointer", border: "2px dashed var(--portal-border)", backgroundColor: "var(--portal-bg-subtle)" }}>
            <CardContent style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "var(--space-xl)", textAlign: "center", gap: "var(--space-md)" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "var(--portal-accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--portal-accent-text)", fontSize: "1.5rem" }}>
                +
              </div>
              <div>
                <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700 }}>নতুন আবেদন করুন</h3>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", marginTop: "var(--space-xs)" }}>
                  ভয়েস ইনটেকের পর পূর্ণাঙ্গ আবেদন ফর্ম পূরণ করুন
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/citizen/track" style={{ textDecoration: "none", color: "inherit" }}>
          <Card style={{ height: "100%", transition: "transform var(--transition-fast)", cursor: "pointer" }}>
            <CardContent style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "var(--space-xl)", textAlign: "center", gap: "var(--space-md)" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", backgroundColor: "var(--portal-accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--portal-accent-text)", fontSize: "1.5rem" }}>
                🔍
              </div>
              <div>
                <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 700 }}>আবেদন ট্র্যাক করুন</h3>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", marginTop: "var(--space-xs)" }}>
                  আপনার বর্তমান আবেদনের সর্বশেষ অবস্থা জানুন
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <h2 style={{ fontFamily: "var(--font-bn)", fontSize: "1.25rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-lg)" }}>
        আপনার চলমান মামলাসমূহ
      </h2>
      
      {loading ? (
        <Card>
          <CardContent style={{ fontFamily: "var(--font-bn)", padding: "var(--space-xl)", textAlign: "center", color: "var(--portal-text-secondary)" }}>
            তথ্য লোড হচ্ছে…
          </CardContent>
        </Card>
      ) : cases.length === 0 ? (
        <EmptyState 
          title="কোনো মামলা পাওয়া যায়নি" 
          description="আপনার বর্তমানে কোনো চলমান আইনি আবেদন বা মামলা নেই।" 
          action={<Button onClick={() => router.push("/citizen/apply")}>নতুন আবেদন করুন</Button>}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          {cases.map((c) => (
            <Link key={c.id} href={`/citizen/track?id=${c.id}`} style={{ textDecoration: "none" }}>
              <Card>
                <CardContent style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-md)" }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", fontWeight: 600, color: "var(--portal-text)", margin: 0 }}>
                      {c.docketId || c.applicationId || c.id}
                    </h3>
                    <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", marginTop: "var(--space-2xs)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "320px" }}>
                      {c.summary || c.problemStatement}
                    </p>
                  </div>
                  <StatusBadge variant={getStatusVariant(c.status)}>{getStatusLabel(c.status)}</StatusBadge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </CitizenShell>
  );
}
