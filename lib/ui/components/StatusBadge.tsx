"use client";

import { type HTMLAttributes, forwardRef } from "react";

export type StatusVariant = "new" | "pending" | "overdue" | "urgent" | "closed" | "success";

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant: StatusVariant;
  icon?: React.ReactNode;
}

const variantStyles: Record<StatusVariant, { color: string; bg: string }> = {
  new: { color: "var(--status-new)", bg: "var(--status-new-bg)" },
  pending: { color: "var(--status-pending)", bg: "var(--status-pending-bg)" },
  overdue: { color: "var(--status-overdue)", bg: "var(--status-overdue-bg)" },
  urgent: { color: "var(--status-urgent)", bg: "var(--status-urgent-bg)" },
  closed: { color: "var(--status-closed)", bg: "var(--status-closed-bg)" },
  success: { color: "var(--status-success)", bg: "var(--status-success-bg)" },
};

export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ variant, icon, children, style, ...rest }, ref) => {
    const theme = variantStyles[variant];

    return (
      <span
        ref={ref}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px 10px",
          borderRadius: "var(--radius-full)",
          backgroundColor: theme.bg,
          color: theme.color,
          fontFamily: "var(--font-bn)",
          fontWeight: 600,
          fontSize: "0.75rem",
          letterSpacing: "0.025em",
          ...style,
        }}
        {...rest}
      >
        {icon && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon}
          </span>
        )}
        {children}
      </span>
    );
  },
);
StatusBadge.displayName = "StatusBadge";
