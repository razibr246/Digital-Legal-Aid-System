"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  MOCK_ROLE_IDENTITIES,
  ROLE_GROUPS,
  rolesInGroup,
  type RoleGroupId,
  type StaffRole,
} from "@/lib/auth/roles";
import { Button } from "@/lib/ui/components/Button";
import { FormField } from "@/lib/ui/components/FormField";
import { Card, CardContent } from "@/lib/ui/components/Card";
import { PersonaSwitcher } from "@/components/demo/persona-switcher";
import { homePathForRole } from "@/lib/auth/screen-guard";

/**
 * The picker is two steps — group, then role — because fourteen role buttons in one
 * list is unreadable. Only canonical roles are offered; the legacy keys stay
 * reachable through the API but are not what a person should have to choose between.
 */
const GROUPED_ROLES = ROLE_GROUPS.map((group) => ({
  group,
  roles: rolesInGroup(group.id),
}));

function LoginContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"citizen" | "staff">(() => searchParams.get("tab") === "staff" ? "staff" : "citizen");

  // Citizen Login State
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [isCitizenLoading, setIsCitizenLoading] = useState(false);
  const [citizenError, setCitizenError] = useState("");

  // Staff Login State
  const [selectedGroup, setSelectedGroup] = useState<RoleGroupId | null>(null);
  const [selectedRole, setSelectedRole] = useState<StaffRole | null>(null);
  const [isStaffLoading, setIsStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");

  const handleCitizenLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCitizenLoading(true);
    setCitizenError("");

    try {
      const res = await fetch("/api/portal/citizen-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      
      // Redirect to citizen portal
      window.location.href = "/citizen";
    } catch (err) {
      setCitizenError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsCitizenLoading(false);
    }
  };

  // One click on a role card logs in immediately — no separate confirm button.
  // `selectedRole` still tracks which card is mid-request so it can show its own
  // loading state while the others stay disabled.
  const handleStaffLogin = async (role: StaffRole) => {
    setSelectedRole(role);
    setIsStaffLoading(true);
    setStaffError("");

    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      // Court-side roles land on the lawyer workspace, everyone else on the DLAO one.
      window.location.href = homePathForRole(role);
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : "Unknown error");
      setIsStaffLoading(false);
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: "480px" }}>
      <div style={{ textAlign: "center", marginBottom: "var(--space-2xl)" }}>
        <h1
          style={{
            fontFamily: "var(--font-bn)",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "var(--portal-text)",
            marginBottom: "var(--space-sm)",
          }}
        >
          পোর্টাল লগইন
        </h1>
        <p
          style={{
            fontFamily: "var(--font-bn)",
            fontSize: "1rem",
            color: "var(--portal-text-secondary)",
          }}
        >
          জাতীয় আইনগত সহায়তা প্রদান সংস্থা
        </p>
      </div>

      <Card>
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--portal-border)",
          }}
        >
          <button
            onClick={() => setActiveTab("citizen")}
            style={{
              flex: 1,
              padding: "var(--space-lg)",
              backgroundColor: activeTab === "citizen" ? "var(--portal-white)" : "var(--portal-bg-subtle)",
              border: "none",
              borderBottom: activeTab === "citizen" ? "2px solid var(--portal-accent)" : "2px solid transparent",
              fontFamily: "var(--font-bn)",
              fontWeight: 600,
              fontSize: "1rem",
              color: activeTab === "citizen" ? "var(--portal-accent-text)" : "var(--portal-text-secondary)",
              cursor: "pointer",
            }}
          >
            নাগরিক লগইন
          </button>
          <button
            onClick={() => setActiveTab("staff")}
            style={{
              flex: 1,
              padding: "var(--space-lg)",
              backgroundColor: activeTab === "staff" ? "var(--portal-white)" : "var(--portal-bg-subtle)",
              border: "none",
              borderBottom: activeTab === "staff" ? "2px solid var(--portal-accent)" : "2px solid transparent",
              fontFamily: "var(--font-bn)",
              fontWeight: 600,
              fontSize: "1rem",
              color: activeTab === "staff" ? "var(--portal-accent-text)" : "var(--portal-text-secondary)",
              cursor: "pointer",
            }}
          >
            কর্মকর্তা লগইন
          </button>
        </div>

        <CardContent>
          {activeTab === "citizen" ? (
            <>
            <form onSubmit={handleCitizenLogin} style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
              <div>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", marginBottom: "var(--space-lg)" }}>
                  ভয়েস ইনটেক সম্পন্ন হলে আপনার প্রাথমিক ফোন নম্বরে পাঠানো ৪ সংখ্যার পিন দিয়ে লগইন করুন।
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                  <FormField
                    label="মোবাইল নম্বর"
                     type="tel"
                     inputMode="tel"
                     maxLength={11}
                     value={phone}

                     onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}

                    placeholder="01XXXXXXXXX"
                    required
                  />
                  <FormField
                     label="৪ সংখ্যার পিন"
                     type="text"
                     inputMode="numeric"
                     maxLength={4}
                     value={pin}
                     onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                     placeholder="৪ সংখ্যার পিন"

                    required
                    error={citizenError}
                  />
                </div>
              </div>
              <Button type="submit" fullWidth loading={isCitizenLoading}>
                লগইন করুন
              </Button>
            </form>

              {/* Part A of the brief. These five people are the prototype's required
                  scenarios, and none of them can use the form above: two are not safely
                  reachable on a phone at all, one is blind, one cannot read, and one
                  has no smartphone. Asking them to type a phone number and a PIN would
                  demonstrate the opposite of what the brief asks for, so the demo path
                  is a single click. The form above stays because the voice-PIN login is
                  a real path and worth showing too. */}
              <div
                style={{
                  marginTop: "var(--space-2xl)",
                  paddingTop: "var(--space-lg)",
                  borderTop: "1px solid var(--portal-border)",
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-bn)",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--portal-text)",
                    margin: "0 0 var(--space-xs)",
                  }}
                >
                  ডেমো: এক ক্লিকে নাগরিক লগইন
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-bn)",
                    fontSize: "0.8125rem",
                    color: "var(--portal-text-secondary)",
                    margin: "0 0 var(--space-md)",
                  }}
                >
                  ব্রিফের পাঁচটি আবশ্যিক সিনারিও। মোয়ূরী ও রিপন একই ঘটনা — তাই এক বোতামে তাঁদের সিমুলেশন।
                  বাকিরা এক ক্লিকে নিজ নিজ পোর্টালে ঢুকবে।
                </p>
                <PersonaSwitcher variant="compact" />
                <Link
                  href="/demo"
                  style={{
                    display: "inline-block",
                    marginTop: "var(--space-md)",
                    fontFamily: "var(--font-bn)",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    color: "var(--portal-accent-text)",
                    textDecoration: "none",
                  }}
                >
                  পাঁচটি সিনারিও ও তাদের শর্ত বিস্তারিত দেখুন →
                </Link>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
              <div>
                <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", marginBottom: "var(--space-lg)" }}>
                  হ্যাকাথন ডেমো: নিচে থেকে যেকোনো একটি রোল সিলেক্ট করে লগইন করুন।
                </p>
                
                {!selectedGroup ? (
                  <div style={{ display: "grid", gap: "var(--space-sm)", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                    {GROUPED_ROLES.map(({ group, roles }) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setSelectedGroup(group.id)}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          gap: 4,
                          padding: "var(--space-md)",
                          borderRadius: "var(--radius-md)",
                          border: "1.5px solid var(--portal-border)",
                          backgroundColor: "var(--portal-white)",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "all var(--transition-fast)",
                        }}
                      >
                        <span style={{ fontFamily: "var(--font-bn)", fontWeight: 700, fontSize: "0.9375rem", color: "var(--portal-text)" }}>
                          {group.titleBn}
                        </span>
                        <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text-secondary)" }}>
                          {group.blurbBn}
                        </span>
                        <span style={{ fontSize: "0.6875rem", color: "var(--portal-text-secondary)", opacity: 0.75 }}>
                          {roles.length}টি রোল
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                    <button
                      type="button"
                      onClick={() => { setSelectedGroup(null); setSelectedRole(null); }}
                      style={{
                        alignSelf: "flex-start",
                        border: 0,
                        background: "none",
                        padding: 0,
                        color: "var(--portal-accent-text)",
                        fontFamily: "var(--font-bn)",
                        fontSize: "0.8125rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      ← সব গ্রুপ দেখুন
                    </button>
                    {rolesInGroup(selectedGroup).map((role) => {
                      const isThisRoleLoading = isStaffLoading && selectedRole === role.key;
                      return (
                        <button
                          key={role.key}
                          type="button"
                          disabled={isStaffLoading}
                          onClick={() => handleStaffLogin(role.key as StaffRole)}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            gap: 3,
                            padding: "var(--space-md)",
                            borderRadius: "var(--radius-md)",
                            border: `1.5px solid ${selectedRole === role.key ? "var(--portal-accent)" : "var(--portal-border)"}`,
                            backgroundColor: selectedRole === role.key ? "var(--portal-accent-subtle)" : "var(--portal-white)",
                            cursor: isStaffLoading ? "default" : "pointer",
                            textAlign: "left",
                            opacity: isStaffLoading && !isThisRoleLoading ? 0.5 : 1,
                            transition: "all var(--transition-fast)",
                          }}
                        >
                          <span style={{ fontFamily: "var(--font-bn)", fontWeight: 700, fontSize: "0.9375rem", color: "var(--portal-text)" }}>
                            {role.titleBn}
                            {role.loginAnnotationBn && (
                              <span style={{ fontWeight: 600, color: "var(--portal-accent-text)" }}>
                                {" "}({role.loginAnnotationBn})
                              </span>
                            )}
                          </span>
                          <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "var(--portal-text-secondary)" }}>
                            {role.scopeBn}
                          </span>
                          <span style={{ fontSize: "0.6875rem", color: "var(--portal-text-secondary)", opacity: 0.75 }}>
                            {isThisRoleLoading ? "লগইন হচ্ছে..." : MOCK_ROLE_IDENTITIES[role.key as StaffRole]?.displayName}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {staffError && (
                  <p style={{ fontFamily: "var(--font-bn)", color: "#dc2626", fontSize: "0.8125rem", marginTop: "var(--space-md)", fontWeight: 500 }}>
                    {staffError}
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div style={{ marginTop: "var(--space-xl)", textAlign: "center" }}>
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-bn)",
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "var(--portal-accent)",
            textDecoration: "none",
          }}
        >
          ← মূল পেজে ফিরে যান
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--portal-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-xl)",
      }}
    >
      <Suspense fallback={<div>Loading...</div>}>
        <LoginContent />
      </Suspense>
    </main>
  );
}
