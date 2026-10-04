"use client";

/**
 * Severity, urgency and priority as badges rather than as plain text.
 *
 * These were rendered as small bold words in a two-column grid, which meant the single
 * most important fact on a case — whether this person is in danger — was visually
 * indistinguishable from their district. Colour, an icon and a filled treatment make
 * it readable at a glance, which is the whole point of a triage screen.
 *
 * The labels and the cut-offs live here rather than in each screen, so a case cannot
 * read "জরুরি" in one place and "অগ্রাধিকার" in another.
 */

import { AlertOctagon, AlertTriangle, Clock, Flame, Info, ShieldAlert, TrendingUp } from "lucide-react";

export type RiskTone = "critical" | "high" | "medium" | "low" | "none";

const TONE_STYLE: Record<RiskTone, { bg: string; fg: string; border: string; dot: string }> = {
  critical: { bg: "#fef2f2", fg: "#991b1b", border: "#fecaca", dot: "#dc2626" },
  high: { bg: "#fff7ed", fg: "#9a3412", border: "#fed7aa", dot: "#ea580c" },
  medium: { bg: "#fffbeb", fg: "#92400e", border: "#fde68a", dot: "#d97706" },
  low: { bg: "#f0fdf4", fg: "#166534", border: "#bbf7d0", dot: "#16a34a" },
  none: { bg: "#f8fafc", fg: "#475569", border: "#e2e8f0", dot: "#94a3b8" },
};

export function urgencyTone(urgency: string | null | undefined): RiskTone {
  if (urgency === "emergency_danger") return "critical";
  if (urgency === "urgent") return "high";
  return "none";
}

export function priorityTone(priority: string | null | undefined): RiskTone {
  if (priority === "urgent") return "critical";
  if (priority === "high") return "high";
  return "none";
}

export function severityTone(severity: string | null | undefined): RiskTone {
  if (severity === "emergency") return "critical";
  if (severity === "high") return "high";
  if (severity === "medium") return "medium";
  if (severity === "low") return "low";
  return "none";
}

const URGENCY_BN: Record<string, string> = {
  emergency_danger: "জরুরি বিপদ",
  urgent: "অগ্রাধিকার",
  normal: "স্বাভাবিক",
};
const PRIORITY_BN: Record<string, string> = { urgent: "অতি জরুরি", high: "উচ্চ", normal: "স্বাভাবিক" };
const SEVERITY_BN: Record<string, string> = {
  emergency: "জরুরি পরিস্থিতি",
  high: "উচ্চ ঝুঁকি",
  medium: "মাঝারি ঝুঁকি",
  low: "কম ঝুঁকি",
};

const ICONS = {
  critical: AlertOctagon,
  high: Flame,
  medium: AlertTriangle,
  low: ShieldAlert,
  none: Info,
} as const;

export function RiskBadge({
  label,
  value,
  tone,
  icon: Icon,
  emphasis = false,
}: {
  label: string;
  value: string;
  tone: RiskTone;
  icon?: React.ComponentType<{ size?: number | string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  /** Filled treatment, for the one fact that should lead the screen. */
  emphasis?: boolean;
}) {
  const t = TONE_STYLE[tone];
  const Resolved = (Icon ?? ICONS[tone]) as React.ComponentType<{ size?: number; strokeWidth?: number }>;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: emphasis ? "9px 13px" : "6px 10px",
        borderRadius: 10,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        fontFamily: "var(--font-bn)",
        fontWeight: 800,
        fontSize: emphasis ? 13.5 : 12,
        lineHeight: 1.3,
      }}
    >
      <Resolved size={emphasis ? 16 : 14} strokeWidth={2.4} />
      <span style={{ opacity: 0.72, fontWeight: 700 }}>{label}</span>
      <span>{value}</span>
    </span>
  );
}

/** The three triage facts together, leading with the worst. */
export function RiskBadgeRow({
  urgency,
  priority,
  severity,
  className,
}: {
  urgency: string | null | undefined;
  priority: string | null | undefined;
  severity: string | null | undefined;
  className?: string;
}) {
  const uTone = urgencyTone(urgency);
  const pTone = priorityTone(priority);
  const sTone = severityTone(severity);
  const worst: RiskTone =
    uTone === "critical" || pTone === "critical" || sTone === "critical"
      ? "critical"
      : uTone === "high" || pTone === "high" || sTone === "high"
        ? "high"
        : sTone === "medium"
          ? "medium"
          : "none";

  return (
    <div
      className={className}
      style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
      role="group"
      aria-label="ঝুঁকি ও অগ্রাধিকার"
    >
      {urgency ? (
        <RiskBadge
          label="জরুরি অবস্থা"
          value={URGENCY_BN[urgency] ?? urgency}
          tone={uTone}
          emphasis={worst === "critical"}
        />
      ) : null}
      {priority ? (
        <RiskBadge
          label="অগ্রাধিকার"
          value={PRIORITY_BN[priority] ?? priority}
          tone={pTone}
          icon={priority === "urgent" ? Flame : TrendingUp}
          emphasis={worst === "critical" && urgency !== "emergency_danger"}
        />
      ) : null}
      {severity ? (
        <RiskBadge
          label="তীব্রতা"
          value={SEVERITY_BN[severity] ?? severity}
          tone={sTone}
          icon={Clock}
          emphasis={worst === "critical" && urgency !== "emergency_danger" && priority !== "urgent"}
        />
      ) : null}
    </div>
  );
}
