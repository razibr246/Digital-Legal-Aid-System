"use client";

import Image from "next/image";
import Link from "next/link";
import { isSystemAdministrator } from "@/lib/auth/screen-guard";
import { useEffect, useState, type ReactNode } from "react";
import { AgentFab } from "./AgentFab";
import BuildStamp from "@/components/build-stamp";
import { formatBn } from "@/lib/case/mediation";

export type DlaoTab =
  | "applications"
  | "new"
  | "cases"
  | "panel"
  | "mediation"
  | "calendar"
  | "hearing"
  | "online"
  | "lawyers"
  | "advice"
  | "reports";

interface DlaoShellProps {
  children: ReactNode;
  activeTab?: DlaoTab;
  onTabChange?: (tab: DlaoTab) => void;
  /** Current role, so the system-administration tab is only offered to the Chief DLAO. */
  role?: string | null;
  tabCounts?: {
    new: number;
    cases: number;
    panel: number;
    mediation?: number;
  };
}

const TABS: Array<{ id: DlaoTab; label: string }> = [
  { id: "applications", label: "আবেদন" },
  { id: "new", label: "নতুন আবেদন" },
  { id: "cases", label: "কেস" },
  { id: "panel", label: "প্যানেল বিবরণ" },
  { id: "mediation", label: "মধ্যস্থতা" },
  { id: "calendar", label: "ক্যালেন্ডার" },
  // "শনি" was a typo for "শুনানি" and there is no hearing column in the schema, so
  // this tab has always rendered an empty queue. It stays for now but says what it is.
  { id: "hearing", label: "শুনানি" },
  { id: "online", label: "ওনলি" },
  { id: "lawyers", label: "প্যানেল অ্যাডভোকেটী" },
  { id: "advice", label: "পরামর্শ" },
  { id: "reports", label: "প্রতিবেদন" },
];

/**
 * Today, in Bangla.
 *
 * This used to be `new Date().toLocaleDateString("bn-BD", …)`, which is wrong twice over
 * and produced a React hydration mismatch on every /dlao load:
 *
 *   1. `toLocaleDateString` formats in the RUNTIME's timezone. The Worker is UTC and the
 *      officer's browser is UTC+6, so for six hours a day the server sent one date and the
 *      client corrected it to the next — the same class of bug that had the calendar
 *      render a different day than the one being booked.
 *   2. It depends on the host's ICU data, so the server and the browser can format the
 *      same instant differently and disagree about the text, not just the value.
 *
 * `formatBn` reads the Bangladesh civil fields off the instant and builds the Bangla
 * string itself, so both sides necessarily agree. The remaining hazard — the BD date
 * flipping between the server render and hydration — is closed by rendering it only once
 * mounted, which is why this is a hook and not a plain function.
 */
function useTodayBn(): string {
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(formatBn(new Date(), true));
  }, []);
  return today;
}

export function DlaoShell({ children, activeTab, onTabChange, tabCounts, role }: DlaoShellProps) {
  const [localTab, setLocalTab] = useState<DlaoTab>(activeTab || "applications");
  const [language, setLanguage] = useState<"bn" | "en">("bn");
  const today = useTodayBn();
  const currentTab = activeTab || localTab;

  const selectTab = (tab: DlaoTab) => {
    setLocalTab(tab);
    onTabChange?.(tab);
  };

  return (
    <div data-portal="dlao" className="dlao-root">
      <div className="dlao-government-strip">
        <div className="dlao-shell-width dlao-government-inner">
          <span><span className="dlao-government-dot" /> পরিচালনা ব্যবস্থাপনা সরকার / Government of the People&apos;s Republic of Bangladesh.</span>
          <BuildStamp />
        </div>
      </div>

      <header className="dlao-header">
        <div className="dlao-shell-width dlao-header-inner">
          <Link href="/dlao" className="dlao-brand" aria-label="DLAO dashboard">
            <Image src="/assets/logo/logo-mark-reference.png" alt="DLAS" width={38} height={38} />
            <span>
              <strong>DLAS</strong>
              <small>ডিজিটাল লিগ্যাল এইড সিস্টেম</small>
            </span>
          </Link>
          <div className="dlao-header-account">
            <span className="dlao-account-name">DLAO ড্যাশবোর্ড</span>
            <div className="dlao-language-switch" role="group" aria-label="Language">
              <button className={language === "bn" ? "active" : ""} onClick={() => setLanguage("bn")}>বাংলা</button>
              <button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>English</button>
            </div>
            <button
              className="dlao-logout"
              onClick={() => {
                document.cookie = "auth_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
                window.location.href = "/login";
              }}
            >
              লগআউট
            </button>
          </div>
        </div>
      </header>

      <div className="dlao-service-strip">
        <div className="dlao-shell-width dlao-service-inner">
          <div className="dlao-service-title">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z" /></svg>
            <span>ডেলওয়েকা জেলা লিগ্যাল এইড অফিস</span>
          </div>
          <Link href="/citizen/apply" className="dlao-new-application">+ নতুন আবেদন পরিচালনা করুন (ওয়েব-ফর্ম)</Link>
          <span className="dlao-updated">{today}</span>
        </div>
      </div>

      <nav className="dlao-tabs" aria-label="DLAO sections">
        <div className="dlao-shell-width dlao-tabs-inner">
          {isSystemAdministrator(role) ? (
            <Link
              href="/admin"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              সিস্টেম প্রশাসন
            </Link>
          ) : null}
          {TABS.map((tab) => {
            const count =
              tab.id === "new" ? tabCounts?.new
              : tab.id === "cases" ? tabCounts?.cases
              : tab.id === "panel" ? tabCounts?.panel
              : tab.id === "mediation" ? tabCounts?.mediation
              : undefined;
            return (
              <button
                key={tab.id}
                className={currentTab === tab.id ? "active" : ""}
                onClick={() => selectTab(tab.id)}
              >
                {tab.label}
                {count !== undefined && <span className="dlao-tab-count">{count}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="dlao-main dlao-shell-width">{children}</main>
      <AgentFab />
    </div>
  );
}
