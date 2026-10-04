"use client";

import Link from "next/link";
import { PersonaSwitcher } from "@/components/demo/persona-switcher";

/**
 * Part A of the brief, on screen: the five mandatory citizen scenarios.
 *
 * This exists as its own page rather than only inside the login form because the brief
 * is a specification, and a reviewer needs to read the requirement and then watch the
 * system satisfy it. A card that only says "log in" would hide the half of the brief
 * that is about what has to be true afterwards.
 */
export default function DemoScenariosPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--portal-bg)",
        padding: "var(--space-2xl) var(--space-xl)",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-2xl)" }}>
        <header>
          <p
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--portal-accent-text)",
              margin: "0 0 var(--space-sm)",
            }}
          >
            Part A — Five citizen scenarios
          </p>
          <h1
            style={{
              fontFamily: "var(--font-bn)",
              fontSize: "1.875rem",
              fontWeight: 700,
              color: "var(--portal-text)",
              margin: "0 0 var(--space-sm)",
              lineHeight: 1.3,
            }}
          >
            পাঁচটি নাগরিক, পাঁচটি আলাদা বাধা
          </h1>
          <p
            style={{
              fontFamily: "var(--font-bn)",
              fontSize: "1rem",
              color: "var(--portal-text-secondary)",
              margin: 0,
              maxWidth: "70ch",
              lineHeight: 1.7,
            }}
          >
            এই পাঁচজন আবশ্যক, বিকল্প নয়। একই স্থাপত্য প্রতিটির নির্দিষ্ট বাধা কীভাবে সমাধান করে তা দেখাতে হবে।
            শেয়ার্ড কম্পোনেন্ট ব্যবহার করা যাবে, কিন্তু প্রত্যেকের সমস্যা স্পষ্টভাবে সমাধান হতে হবে।
          </p>
        </header>

        <PersonaSwitcher />

        <div
          style={{
            border: "1.5px solid var(--portal-accent, #15803d)",
            borderRadius: "var(--radius-lg, 14px)",
            background: "var(--portal-accent-subtle, #f0fdf4)",
            padding: "var(--space-lg, 20px)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-sm, 8px)",
          }}
        >
          <strong style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text, #0f172a)" }}>
            সিমুলেশন মোড
          </strong>
          <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary, #475569)", margin: 0, lineHeight: 1.7 }}>
            ১৬৬৯৯-এর ভয়েস কথোপকথনটি ধাপে ধাপে দেখুন — কলকারীর কথা থেকে শ্রেণিবিভাগ, নিরাপদ সময়ের ১৫ মিনিট, কর্মকর্তার
            অনুস্মারক এবং মধ্যস্থতা নির্ধারণ পর্যন্ত। শ্রেণিবিভাগটি আসল ইঞ্জিন করে, কোথাও লেখা নেই।
          </p>
          <Link
            href="/demo/simulation"
            style={{
              alignSelf: "flex-start",
              marginTop: "var(--space-xs, 4px)",
              background: "var(--portal-accent, #15803d)",
              color: "var(--portal-text-on-accent, #fff)",
              textDecoration: "none",
              borderRadius: "var(--radius-md, 8px)",
              padding: "0 18px",
              minHeight: "var(--touch-min, 2.75rem)",
              display: "inline-flex",
              alignItems: "center",
              fontFamily: "var(--font-bn)",
              fontWeight: 700,
              fontSize: "0.9375rem",
            }}
          >
            সিমুলেশন চালু করুন
          </Link>
        </div>

        <footer style={{ borderTop: "1px solid var(--portal-border)", paddingTop: "var(--space-lg)" }}>
          <Link
            href="/login"
            style={{
              fontFamily: "var(--font-bn)",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--portal-accent-text)",
              textDecoration: "none",
            }}
          >
            ← লগইন পাতায় ফিরে যান
          </Link>
        </footer>
      </div>
    </main>
  );
}
