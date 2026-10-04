"use client";

import { type ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "var(--space-3xl) var(--space-xl)",
        backgroundColor: "var(--portal-bg-subtle)",
        border: "1px dashed var(--portal-border-strong)",
        borderRadius: "var(--radius-xl)",
        margin: "var(--space-lg) 0",
      }}
    >
      {icon && (
        <div
          style={{
            color: "var(--portal-text-muted)",
            marginBottom: "var(--space-lg)",
          }}
        >
          {icon}
        </div>
      )}
      <h3
        style={{
          fontFamily: "var(--font-bn)",
          fontSize: "1.25rem",
          fontWeight: 700,
          color: "var(--portal-text)",
          marginBottom: "var(--space-sm)",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontFamily: "var(--font-bn)",
          fontSize: "1rem",
          color: "var(--portal-text-secondary)",
          maxWidth: "400px",
          marginBottom: action ? "var(--space-xl)" : 0,
        }}
      >
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}
