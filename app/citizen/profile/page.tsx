"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CitizenShell } from "@/lib/ui/shell/CitizenShell";
import { Card, CardContent } from "@/lib/ui/components/Card";
import { StatusBadge } from "@/lib/ui/components/StatusBadge";
import { getStatusLabel, getStatusVariant } from "@/lib/data/case-store";
import { VerificationCard, type IdentityPayload } from "@/components/identity/verification-card";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ProfileApplication {
  applicationId: string;
  docketId: string;
  caseId: string | null;
  applicantName: string;
  source: string;
  sourceLanguage: string;
  urgency: string;
  priority: string;
  status: string;
  submittedAt: string;
}

interface ProfileVerification {
  id: string;
  documentType: "nid" | "passport";
  documentNumberMasked: string;
  status: "verified" | "review" | "rejected";
  nameMatch: boolean | null;
  nameEn: string | null;
  nameBn: string | null;
  simulated: boolean;
  createdAt: string;
}

interface ProfilePayload {
  profile: {
    userId: string;
    displayName: string;
    role: string;
    status: string;
    verificationStatus: string;
    phone: string | null;
    memberSince: string | null;
    hasVoicePin: boolean;
    isMock: boolean;
  };
  identity: {
    attempts: number;
    latest: ProfileVerification | null;
  };
  stats: {
    totalApplications: number;
    activeCases: number;
    closedCases: number;
    voiceApplications: number;
  };
  applications: ProfileApplication[];
}

const URGENCY_LABELS: Record<string, string> = {
  emergency_danger: "জরুরি — বিপদ",
  urgent: "জরুরি",
  high: "উচ্চ অগ্রাধিকার",
  normal: "স্বাভাবিক",
};

const LANGUAGE_LABELS: Record<string, string> = {
  bn: "বাংলা",
  marma: "মারমা",
  chakma: "চাকমা",
};

const SOURCE_LABELS: Record<string, string> = {
  voice: "ভয়েস ইনটেক",
  portal: "ওয়েব ফর্ম",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("bn-BD", { year: "numeric", month: "long", day: "numeric" }).format(parsed);
}

const cellStyle = { fontFamily: "var(--font-bn)" };

export default function CitizenProfilePage() {
  const router = useRouter();
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameWarning, setNameWarning] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/profile", { credentials: "include" })
      .then((response) => response.json())
      .then((payload: ProfilePayload & { ok?: boolean; error?: string }) => {
        if (cancelled) return;
        if (payload.ok) {
          setData(payload);
          setError("");
        } else {
          setError(payload.error || "প্রোফাইল তৈরি করা যায়নি");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Re-reads the profile so the page reflects a just-saved change. */
  const reload = useCallback(async () => {
    const response = await fetch("/api/portal/profile", { credentials: "include" });
    if (!response.ok) return;
    setData((await response.json()) as ProfilePayload);
  }, []);

  async function saveName() {
    const next = nameDraft.trim();
    if (next.length < 2) {
      setNameError("নাম কমপক্ষে ২ অক্ষরের হতে হবে");
      return;
    }
    setSavingName(true);
    setNameError("");
    try {
      const response = await fetch("/api/portal/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayName: next }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string; nameWarning?: string | null };
      if (!response.ok || !payload.ok) {
        setNameError(payload.error || "নাম সংরক্ষণ করা যায়নি");
        return;
      }
      setEditingName(false);
      setNameWarning(payload.nameWarning ?? "");
      await reload();
      router.refresh();
    } finally {
      setSavingName(false);
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      router.push("/");
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  }

  const profile = data?.profile;
  const stats = data?.stats;

  return (
    <CitizenShell>
      <div style={{ marginBottom: "var(--space-2xl)" }}>
        <h1 style={{ ...cellStyle, fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-xs)" }}>
          আমার প্রোফাইল
        </h1>
        <p style={{ ...cellStyle, fontSize: "1rem", color: "var(--portal-text-secondary)" }}>
          আপনার অ্যাকাউন্ট, আবেদন ও যাচাইয়ের তথ্য এক জায়গায় দেখুন।
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent style={{ ...cellStyle, padding: "var(--space-xl)", textAlign: "center", color: "var(--portal-text-secondary)" }}>
            তথ্য লোড হচ্ছে…
          </CardContent>
        </Card>
      ) : error ? (
        <Card style={{ borderColor: "var(--portal-accent-border)" }}>
          <CardContent style={{ ...cellStyle, padding: "var(--space-xl)" }}>
            <p style={{ color: "var(--portal-text)", marginBottom: "var(--space-md)" }}>{error}</p>
            <div style={{ display: "flex", gap: "var(--space-md)", flexWrap: "wrap" }}>
              <Link
                href="/citizen"
                style={{ ...cellStyle, display: "inline-flex", background: "var(--portal-accent)", color: "var(--portal-text-on-accent)", borderRadius: "var(--radius-md, 10px)", padding: "10px 18px", fontWeight: 600, textDecoration: "none" }}
              >
                ড্যাশবোর্ডে ফিরুন
              </Link>
              <Link href="/login?tab=citizen" style={{ ...cellStyle, color: "var(--portal-accent-text)", fontWeight: 600 }}>
                লগইন / রেজিস্টার
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : profile ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-lg)", marginBottom: "var(--space-2xl)" }}>
            <VerificationCard payload={data as unknown as IdentityPayload | null} />
            <Card>
              <CardContent style={{ display: "flex", gap: "var(--space-md)", alignItems: "center" }}>
                <div
                  aria-hidden="true"
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "var(--radius-full)",
                    backgroundColor: "var(--portal-accent-light)",
                    color: "var(--portal-accent-text)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {profile.displayName.trim().slice(0, 1) || "ন"}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  {editingName ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                      <Input
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        aria-label="আপনার নাম"
                        autoFocus
                        className="max-w-xs"
                      />
                      {nameError ? (
                        <p style={{ ...cellStyle, fontSize: "0.75rem", color: "#b91c1c" }}>{nameError}</p>
                      ) : null}
                      <div style={{ display: "flex", gap: "var(--space-xs)" }}>
                        <Button
                          size="sm"
                          onClick={saveName}
                          disabled={savingName}
                        >
                          {savingName ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingName(false);
                            setNameError("");
                          }}
                          disabled={savingName}
                        >
                          বাতিল
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                        <h2 style={{ ...cellStyle, fontSize: "1.125rem", fontWeight: 700, color: "var(--portal-text)", margin: 0 }}>
                          {profile.displayName}
                        </h2>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setNameDraft(profile.displayName);
                            setNameError("");
                            setNameWarning("");
                            setEditingName(true);
                          }}
                        >
                          নাম পরিবর্তন
                        </Button>
                      </div>
                      <p style={{ ...cellStyle, fontSize: "0.875rem", color: "var(--portal-text-secondary)", margin: "4px 0 0" }}>
                        নাগরিক অ্যাকাউন্ট
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

          </div>

          {nameWarning ? (
            <Alert variant="warning" className="mb-5">
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>নামের পার্থক্য</AlertTitle>
              <AlertDescription>{nameWarning}</AlertDescription>
            </Alert>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "var(--space-md)", marginBottom: "var(--space-2xl)" }}>
            {[
              { label: "মোট আবেদন", value: stats?.totalApplications ?? 0 },
              { label: "চলমান মামলা", value: stats?.activeCases ?? 0 },
              { label: "নিষ্পত্তি", value: stats?.closedCases ?? 0 },
              { label: "ভয়েস ইনটেক", value: stats?.voiceApplications ?? 0 },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent style={{ textAlign: "center", padding: "var(--space-lg)" }}>
                  <div style={{ ...cellStyle, fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-accent-text)" }}>{item.value}</div>
                  <div style={{ ...cellStyle, fontSize: "0.8125rem", color: "var(--portal-text-secondary)", marginTop: "4px" }}>{item.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card style={{ marginBottom: "var(--space-2xl)" }}>
            <CardContent>
              <h2 style={{ ...cellStyle, fontSize: "1.125rem", fontWeight: 700, color: "var(--portal-text)", margin: "0 0 var(--space-md)" }}>
                ব্যক্তিগত তথ্য
              </h2>
              <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-md)", margin: 0 }}>
                {[
                  { term: "যোগাযোগের নম্বর", detail: profile.phone || "দেওয়া হয়নি" },
                  { term: "সদস্য হয়েছেন", detail: formatDate(profile.memberSince) },
                  { term: "অ্যাকাউন্ট আইডি", detail: profile.userId },
                  { term: "অবস্থা", detail: profile.status === "active" ? "সক্রিয়" : profile.status },
                ].map((row) => (
                  <div key={row.term} style={{ background: "var(--portal-bg-subtle)", borderRadius: "var(--radius-md, 10px)", padding: "var(--space-md)" }}>
                    <dt style={{ ...cellStyle, fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--portal-text-muted)" }}>{row.term}</dt>
                    <dd style={{ ...cellStyle, margin: "6px 0 0", fontWeight: 600, color: "var(--portal-text)", wordBreak: "break-word" }}>{row.detail}</dd>
                  </div>
                ))}
              </dl>
              <p style={{ ...cellStyle, fontSize: "0.8125rem", color: "var(--portal-text-muted)", margin: "var(--space-md) 0 0" }}>
                নাম, ফোন নম্বর বা ঠিকানা সংশোধনের জন্য জেলা লিগ্যাল এইড অফিসে যোগাযোগ করুন অথবা ১৬৬৯৯ এ কল করুন।
              </p>
            </CardContent>
          </Card>

          <h2 style={{ ...cellStyle, fontSize: "1.25rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-lg)" }}>
            আমার আবেদনসমূহ
          </h2>
          {data && data.applications.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)", marginBottom: "var(--space-2xl)" }}>
              {data.applications.map((application) => (
                <Link
                  key={application.applicationId}
                  href={`/citizen/track?id=${encodeURIComponent(application.caseId || application.applicationId)}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <Card>
                    <CardContent style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{ ...cellStyle, fontSize: "1rem", fontWeight: 700, color: "var(--portal-text)", margin: 0 }}>
                          {application.docketId}
                        </h3>
                        <p style={{ ...cellStyle, fontSize: "0.8125rem", color: "var(--portal-text-secondary)", margin: "4px 0 0" }}>
                          {SOURCE_LABELS[application.source] || application.source} · {LANGUAGE_LABELS[application.sourceLanguage] || application.sourceLanguage} · {formatDate(application.submittedAt)}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap" }}>
                        <StatusBadge variant={getStatusVariant(application.status)}>{getStatusLabel(application.status)}</StatusBadge>
                        {application.urgency && application.urgency !== "normal" ? (
                          <StatusBadge variant="urgent">{URGENCY_LABELS[application.urgency] || application.urgency}</StatusBadge>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card style={{ marginBottom: "var(--space-2xl)" }}>
              <CardContent style={{ ...cellStyle, padding: "var(--space-xl)", textAlign: "center", color: "var(--portal-text-secondary)" }}>
                আপনার নামে এখনো কোনো আবেদন নেই। ভয়েস ইনটেক অথবা ওয়েব ফর্মের মাধ্যমে আবেদন করতে পারেন।
              </CardContent>
            </Card>
          )}

          <div style={{ display: "flex", gap: "var(--space-md)", flexWrap: "wrap" }}>
            <Link
              href="/citizen/apply"
              style={{ ...cellStyle, background: "var(--portal-accent)", color: "var(--portal-text-on-accent)", borderRadius: "var(--radius-md, 10px)", padding: "12px 20px", fontWeight: 600, textDecoration: "none" }}
            >
              নতুন আবেদন করুন
            </Link>
            <Link
              href="/citizen/sms"
              style={{ ...cellStyle, border: "1px solid var(--portal-accent-border)", background: "var(--portal-accent-subtle)", color: "var(--portal-accent-text)", borderRadius: "var(--radius-md, 10px)", padding: "12px 20px", fontWeight: 600, textDecoration: "none" }}
            >
              এসএমএস ইনবক্স
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              style={{ ...cellStyle, border: "1px solid var(--portal-border-strong)", background: "var(--portal-white)", color: "var(--portal-text)", borderRadius: "var(--radius-md, 10px)", padding: "12px 20px", fontWeight: 600, cursor: isLoggingOut ? "wait" : "pointer" }}
            >
              {isLoggingOut ? "লগআউট হচ্ছে…" : "লগআউট"}
            </button>
          </div>
        </>
      ) : null}
    </CitizenShell>
  );
}
