"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { AgentFab } from "./AgentFab";

interface LawyerShellProps {
  children: ReactNode;
}

export function LawyerShell({ children }: LawyerShellProps) {
  return (
    <div
      data-portal="lawyer"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--portal-bg)",
      }}
    >
      <header
        style={{
          backgroundColor: "var(--portal-white)",
          borderBottom: "1px solid var(--portal-border)",
          padding: "var(--space-md) var(--space-xl)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--portal-accent)",
              color: "var(--portal-white)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.25rem",
              fontWeight: 700,
            }}
          >
            L
          </div>
          <div>
            <h1
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "var(--portal-text)",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Panel Lawyer Workspace
            </h1>
            <p
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "0.8125rem",
                color: "var(--portal-text-secondary)",
                margin: 0,
              }}
            >
              Assigned Cases
            </p>
          </div>
        </div>

        <nav style={{ display: "flex", gap: "var(--space-lg)", alignItems: "center" }}>
          <Link
            href="/lawyer"
            style={{
              fontFamily: "var(--font-ui)",
              fontWeight: 600,
              color: "var(--portal-text)",
              textDecoration: "none",
            }}
          >
            My Worklist
          </Link>
          <button
            onClick={() => {
              document.cookie = "auth_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
              window.location.href = "/login";
            }}
            style={{
              background: "transparent",
              border: "1px solid var(--portal-border-strong)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-xs) var(--space-md)",
              color: "var(--portal-text)",
              fontFamily: "var(--font-ui)",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Sign Out
          </button>
        </nav>
      </header>

      <main
        style={{
          flex: 1,
          padding: "var(--space-2xl)",
          maxWidth: "1000px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {children}
      </main>

      <AgentFab />
    </div>
  );
}
