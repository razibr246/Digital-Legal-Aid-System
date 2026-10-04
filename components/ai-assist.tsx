"use client";

/**
 * The loading state for lawyer selection, and the sparkle mark used across the
 * assistant surfaces.
 *
 * The copy is deliberate about the two things the officer is waiting on: which case
 * is being considered, and that the suggestion follows the type of problem. "Loading"
 * alone tells a user in a district office that something is happening; this tells them
 * what is being worked out and on what basis.
 *
 * The sparkle is drawn rather than borrowed from the icon set so it can carry a
 * gradient and a slow shimmer — it has to read as "the system is thinking" at a
 * glance across a room, which a flat outline icon does not.
 */

import { motion } from "framer-motion";

export function AiSparkle({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{ display: "inline-grid", placeItems: "center", width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <defs>
          <linearGradient id="ai-spark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <path
          d="M12 2.6l1.85 5.05a3 3 0 0 0 1.75 1.75L20.6 11.2a.6.6 0 0 1 0 1.1l-4.99 1.8a3 3 0 0 0-1.76 1.75L12 20.9a.6.6 0 0 1-1.1 0l-1.8-5.05a3 3 0 0 0-1.75-1.75L3.4 12.3a.6.6 0 0 1 0-1.1l4.94-1.8a3 3 0 0 0 1.76-1.75L10.9 2.6a.6.6 0 0 1 1.1 0z"
          fill="url(#ai-spark)"
        />
        <path
          d="M19 2.2l.62 1.5a1.1 1.1 0 0 0 .68.68l1.5.62a.25.25 0 0 1 0 .46l-1.5.62a1.1 1.1 0 0 0-.68.68L19 8.3a.25.25 0 0 1-.46 0l-.62-1.5a1.1 1.1 0 0 0-.68-.68l-1.5-.62a.25.25 0 0 1 0-.46l1.5-.62a1.1 1.1 0 0 0 .68-.68l.62-1.5a.25.25 0 0 1 .46 0z"
          fill="url(#ai-spark)"
          opacity=".85"
        />
      </svg>
    </span>
  );
}

/** Slowly rotating halo behind the sparkle, so "thinking" is legible at a distance. */
export function AiSparkleBadge({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        display: "inline-grid",
        placeItems: "center",
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        borderRadius: 10,
        background: "linear-gradient(135deg,#fffbeb,#f5f3ff)",
        boxShadow: "inset 0 0 0 1px #fde68a",
      }}
    >
      <motion.span
        style={{ position: "absolute", inset: -3, borderRadius: 13 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "linear" }}
      >
        <svg viewBox="0 0 40 40" width={size + 6} height={size + 6} fill="none">
          <circle
            cx="20"
            cy="20"
            r="18"
            stroke="url(#ai-halo)"
            strokeWidth="2"
            strokeDasharray="14 26"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="ai-halo" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
        </svg>
      </motion.span>
      <AiSparkle size={Math.round(size * 0.55)} />
    </span>
  );
}

export function SuggestionLoader({
  caseLabel,
  problemType,
}: {
  caseLabel?: string | null;
  problemType?: string | null;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "13px 14px",
        borderRadius: 13,
        background: "linear-gradient(135deg,#fffbeb,#faf5ff)",
        border: "1px solid #fde68a",
      }}
    >
      <AiSparkleBadge size={34} />
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-bn)",
            fontWeight: 800,
            fontSize: 13.5,
            lineHeight: 1.5,
            color: "#7c2d12",
          }}
        >
          {caseLabel
            ? `${caseLabel} — এই মামলার জন্য উপযুক্ত আইনজীবী খোঁজা হচ্ছে…`
            : "এই মামলার জন্য উপযুক্ত আইনজীবী খোঁজা হচ্ছে…"}
        </p>
        <p
          style={{
            margin: "3px 0 0",
            fontFamily: "var(--font-bn)",
            fontWeight: 600,
            fontSize: 12,
            lineHeight: 1.55,
            color: "#92400e",
          }}
        >
          {problemType
            ? `সমস্যার ধরন "${problemType}" অনুযায়ী এইচ বিশেষায়ন, জেলা ও ভার মিলিয়ে আইনজীবী সুপারিশ করছে।`
            : "সমস্যার ধরন অনুযায়ী এইচ বিশেষায়ন, জেলা ও ভার মিলিয়ে আইনজীবী সুপারিশ করছে।"}
        </p>
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "13px 15px", borderBottom: "1px solid #f1f5f9" }} aria-hidden>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: "#e2e8f0", flex: "0 0 42px" }} />
      <div style={{ flex: 1, minWidth: 150 }}>
        <div className="sac-skel" style={{ width: "46%" }} />
        <div className="sac-skel" style={{ width: "68%" }} />
      </div>
    </div>
  );
}
