"use client";

/**
 * The entry point to the AI Suggestion Center, shown on the DLAO's default tab.
 *
 * The workbench itself lives behind the "প্যানেল অ্যাডভোকেটী" tab, which is the right
 * place for it — but burying a capability there means it does not exist as far as an
 * officer is concerned. A fresh login lands on the applications queue, and from there
 * the new feature was invisible, so the first thing a reviewer saw was an unchanged
 * screen. This card makes it reachable from where people actually are, and says how
 * many cases are actually waiting on a lawyer, so it is worth clicking rather than
 * decoration.
 */

import { motion } from "framer-motion";
import { ArrowRight, Sparkles, UserCheck } from "lucide-react";
import { AiSparkleBadge } from "@/components/ai-assist";

export default function AiAssistCallout({
  waitingCount,
  onOpen,
}: {
  /** Open cases with no active panel lawyer. */
  waitingCount: number;
  onOpen: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        padding: "15px 18px",
        marginBottom: "var(--space-lg)",
        borderRadius: 15,
        border: "1px solid #fde68a",
        background: "linear-gradient(120deg,#fffbeb 0%,#faf5ff 55%,#eef2ff 100%)",
        boxShadow: "0 2px 10px rgba(180,83,9,.10)",
        fontFamily: "var(--font-bn)",
      }}
    >
      <AiSparkleBadge size={40} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            color: "#92400e",
            marginBottom: 3,
          }}
        >
          <Sparkles size={14} strokeWidth={2.4} aria-hidden />
          <span style={{ font: "800 11px/1 var(--font-bn)", letterSpacing: ".5px" }}>
            এইচ সহায়তা
          </span>
        </div>
        <p
          style={{
            margin: 0,
            font: "800 15px/1.45 var(--font-bn)",
            color: "#1c1917",
          }}
        >
          কোনো কেসে আইনজীবী দরকার? এইচ সেরা আইনজীবী সুপারিশ করবে
        </p>
        <p
          style={{
            margin: "4px 0 0",
            font: "500 12.5px/1.55 var(--font-bn)",
            color: "#57534e",
          }}
        >
          {waitingCount > 0
            ? `${waitingCount}টি কেসে এখনো কোনো আইনজীবী নিয়োগ হয়নি। কেসটি বেছে নিলে সমস্যার ধরন অনুযায়ী সেরা আইনজীবী সুপারিশ করে ও এক ক্লিকে নিয়োগ দিতে পারবেন।`
            : "কেস বেছে নিলে সমস্যার ধরন, জেলা ও আইনজীবীর ভার মিলিয়ে সেরা আইনজীবী সুপারিশ করবে।"}
        </p>
      </div>

      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          flex: "0 0 auto",
          padding: "11px 15px",
          minHeight: 44,
          borderRadius: 11,
          background: "#7c3aed",
          color: "#fff",
          font: "800 13px/1 var(--font-bn)",
        }}
      >
        <UserCheck size={15} strokeWidth={2.4} aria-hidden />
        খুলুন
        <ArrowRight size={15} strokeWidth={2.4} aria-hidden />
      </span>
    </motion.button>
  );
}
