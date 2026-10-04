"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PERSONAS, DEMO_GROUPS, getPersona, type Persona, type PersonaId } from "@/lib/demo/personas";

/**
 * The one-click surface for Part A of the brief.
 *
 * A card per persona, and a card IS the button. There is no second "log in" step,
 * because the point being demonstrated is that none of these five people can use the
 * normal path: two of them cannot safely be reached on a phone at all, one is blind,
 * one cannot read, one has no smartphone. A demo that asked them to type a phone number
 * and a PIN would be demonstrating the opposite of what the brief asks for.
 *
 * Each card carries the brief's own three columns — situation, must solve, minimum
 * evidence — because a reviewer has to be able to check the requirement against the
 * screen. "Minimum evidence" is a checklist of what the *system* must demonstrate, so
 * it is shown as things to look for, not as things already done.
 */

type Language = "bn" | "en";

interface PersonaSwitcherProps {
  /** Highlights the persona currently logged in. */
  activePersonaId?: string | null;
  /** `compact` is the chip row for the dashboard; `full` is the spec view. */
  variant?: "full" | "compact";
  className?: string;
}

const ACCENT_TINTS: Record<PersonaId, { bg: string; fg: string }> = {
  // Deliberately distinct per persona. In a demo five cards that look alike get mixed
  // up, and "am I looking at the survivor or the lawyer's client?" is a real question
  // when you are switching between them.
  moyuri: { bg: "#fde8ec", fg: "#9f1239" },
  ripon: { bg: "#e0edff", fg: "#1d4ed8" },
  nabila: { bg: "#ede4ff", fg: "#6d28d9" },
  nuching: { bg: "#dff3ea", fg: "#047857" },
  malek: { bg: "#fdf0d8", fg: "#a16207" },
};

function bulletList(items: string[], color: string) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((item) => (
        <li
          key={item}
          style={{
            display: "flex",
            gap: 8,
            fontFamily: "var(--font-bn)",
            fontSize: "0.8125rem",
            lineHeight: 1.55,
            color,
          }}
        >
          <span aria-hidden="true" style={{ color: "var(--portal-accent)", flexShrink: 0, fontWeight: 700 }}>
            •
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SpecCell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <h4
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
        {title}
      </h4>
      {children}
    </div>
  );
}

export function PersonaSwitcher({ activePersonaId = null, variant = "full", className }: PersonaSwitcherProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<PersonaId | null>(null);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<Language>("bn");

  async function loginAs(persona: Persona) {
    setPendingId(persona.id);
    setError("");
    try {
      const res = await fetch("/api/portal/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaId: persona.id }),
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "লগইন করা যায়নি");
      // A full navigation, not router.push: the session cookie is HttpOnly and
      // proxy.ts re-reads it on a document request, so a soft navigation would leave
      // the page rendering as the previous person.
      window.location.href = "/citizen";
    } catch (err) {
      setError(err instanceof Error ? err.message : "লগইন করা যায়নি");
      setPendingId(null);
    }
  }

  if (variant === "compact") {
    return (
      <div className={className} style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
        <div style={{ display: "grid", gap: "var(--space-sm)", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
          {DEMO_GROUPS.map((group) => {
            const members = group.personas
              .map((id) => getPersona(id))
              .filter((p): p is Persona => Boolean(p));
            const isPending = members.some((p) => p.id === pendingId);
            const isActive = members.some((p) => p.id === activePersonaId);
            // A merged group is one story, so it is one button. The first persona's tint
            // leads and both codes are shown, so a judge can still see A1 and A2 are in it.
            const tint = ACCENT_TINTS[members[0]?.id ?? "moyuri"];
            const codes = members.map((p) => p.code).join("+");

            const inner = (
              <>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      fontSize: "0.625rem",
                      fontWeight: 700,
                      background: tint.fg,
                      color: "#fff",
                      borderRadius: "var(--radius-full)",
                      padding: "2px 6px",
                    }}
                  >
                    {codes}
                  </span>
                  <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", fontWeight: 700, color: "var(--portal-text, #0f172a)" }}>
                    {group.labelBn}
                  </span>
                </span>
                <span style={{ fontFamily: "var(--font-bn)", fontSize: "0.6875rem", color: "var(--portal-text-secondary, #64748b)", lineHeight: 1.5 }}>
                  {group.hintBn}
                </span>
              </>
            );

            const style: React.CSSProperties = {
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 4,
              textAlign: "left",
              textDecoration: "none",
              padding: "10px 12px",
              minHeight: "var(--touch-min, 2.75rem)",
              borderRadius: "var(--radius-md)",
              border: `1.5px solid ${isActive ? tint.fg : "var(--portal-border, #e2e8f0)"}`,
              background: isActive ? tint.bg : "var(--portal-white, #fff)",
              cursor: isPending ? "wait" : "pointer",
              opacity: isPending ? 0.6 : 1,
              transition: "all var(--transition-fast)",
            };

            // A group with a startUrl is a call to WATCH, so it navigates. A group without
            // one is a portal to look at, so it signs in.
            if (group.startUrl) {
              return (
                <a key={group.id} href={group.startUrl} style={style} aria-label={`${group.labelBn} — সিমুলেশন শুরু করুন`}>
                  {inner}
                </a>
              );
            }
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => loginAs(members[0])}
                disabled={isPending}
                aria-busy={isPending || undefined}
                aria-label={`${group.labelBn} হিসেবে লগইন করুন`}
                style={style}
              >
                {inner}
              </button>
            );
          })}
        </div>
        {error && (
          <p role="alert" style={{ fontFamily: "var(--font-bn)", fontSize: "0.8125rem", color: "#dc2626", margin: 0 }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-sm)" }}>
        <p
          style={{
            fontFamily: "var(--font-bn)",
            fontSize: "0.8125rem",
            color: "var(--portal-text-secondary)",
            margin: 0,
            maxWidth: "52ch",
          }}
        >
          পাঁচটি নাগরিকই আবশ্যিক — বিকল্প নয়। যেকোনো একটিতে এক ক্লিকে ঢুকুন এবং তার নিজের বাধাটি সমাধান হয়েছে কি না দেখুন।
        </p>
        <button
          type="button"
          onClick={() => setLanguage((l) => (l === "bn" ? "en" : "bn"))}
          style={{
            border: "1.5px solid var(--portal-border)",
            background: "var(--portal-white)",
            borderRadius: "var(--radius-md)",
            padding: "6px 12px",
            minHeight: "var(--touch-min)",
            fontFamily: "var(--font-ui)",
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "var(--portal-text-secondary)",
            cursor: "pointer",
          }}
        >
          {language === "bn" ? "English" : "বাংলা"}
        </button>
      </div>

      {error && (
        <p role="alert" style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "#dc2626", margin: 0 }}>
          {error}
        </p>
      )}

      <div style={{ display: "grid", gap: "var(--space-md)" }}>
        {PERSONAS.map((persona) => {
          const tint = ACCENT_TINTS[persona.id];
          const isActive = persona.id === activePersonaId;
          const isPending = persona.id === pendingId;
          const bn = language === "bn";
          return (
            <article
              key={persona.id}
              style={{
                border: `1.5px solid ${isActive ? tint.fg : "var(--portal-border)"}`,
                borderLeft: `5px solid ${tint.fg}`,
                borderRadius: "var(--radius-lg)",
                background: "var(--portal-white)",
                padding: "var(--space-lg)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-md)",
              }}
            >
              <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-md)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      aria-hidden="true"
                      style={{
                        fontSize: "0.6875rem",
                        fontWeight: 700,
                        background: tint.fg,
                        color: "#fff",
                        borderRadius: "var(--radius-full)",
                        padding: "3px 8px",
                      }}
                    >
                      {persona.code}
                    </span>
                    <h3
                      style={{
                        fontFamily: "var(--font-bn)",
                        fontSize: "1.0625rem",
                        fontWeight: 700,
                        color: "var(--portal-text)",
                        margin: 0,
                      }}
                    >
                      {bn ? persona.nameBn : persona.nameEn}
                      <span style={{ fontWeight: 500, color: "var(--portal-text-secondary)" }}>
                        {" — "}
                        {bn ? persona.districtBn : persona.districtEn}
                      </span>
                    </h3>
                  </div>
                  <p
                    style={{
                      fontFamily: "var(--font-bn)",
                      fontSize: "0.8125rem",
                      color: "var(--portal-text-secondary)",
                      margin: "6px 0 0",
                    }}
                  >
                    {bn ? persona.roleBn : persona.roleEn}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => loginAs(persona)}
                  disabled={isPending}
                  aria-busy={isPending || undefined}
                  aria-label={`${bn ? persona.nameBn : persona.nameEn} হিসেবে এক ক্লিকে লগইন করুন`}
                  style={{
                    flexShrink: 0,
                    background: tint.fg,
                    color: "#fff",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    padding: "0 var(--space-lg)",
                    minHeight: "var(--touch-min)",
                    fontFamily: "var(--font-bn)",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    cursor: isPending ? "wait" : "pointer",
                    opacity: isPending ? 0.65 : 1,
                    transition: "filter var(--transition-fast)",
                  }}
                >
                  {isPending ? "ঢুকছি…" : isActive ? "আপনি এখন এখানে" : "১ ক্লিকে ঢুকুন"}
                </button>
              </header>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {persona.barriers.map((barrier) => (
                  <span
                    key={barrier.en}
                    style={{
                      fontFamily: "var(--font-bn)",
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                      background: tint.bg,
                      color: tint.fg,
                      borderRadius: "var(--radius-full)",
                      padding: "3px 9px",
                    }}
                  >
                    {bn ? barrier.bn : barrier.en}
                  </span>
                ))}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "var(--space-md)",
                  paddingTop: "var(--space-sm)",
                  borderTop: "1px solid var(--portal-border)",
                }}
              >
                <SpecCell title={bn ? "পরিস্থিতি" : "Situation"}>
                  <p
                    style={{
                      fontFamily: "var(--font-bn)",
                      fontSize: "0.8125rem",
                      lineHeight: 1.6,
                      color: "var(--portal-text)",
                      margin: 0,
                    }}
                  >
                    {bn ? persona.situationBn : persona.situationEn}
                  </p>
                </SpecCell>

                <SpecCell title={bn ? "সমাধান যা করতে হবে" : "Must be solved"}>
                  {bulletList(bn ? persona.mustSolveBn : persona.mustSolveEn, "var(--portal-text)")}
                </SpecCell>

                <SpecCell title={bn ? "ন্যূনতম প্রমাণ" : "Minimum evidence"}>
                  {bulletList(bn ? persona.evidenceBn : persona.evidenceEn, "var(--portal-text-secondary)")}
                </SpecCell>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default PersonaSwitcher;
