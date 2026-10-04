"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    background: var(--portal-accent);
    color: var(--portal-text-on-accent);
  `,
  secondary: `
    background: var(--portal-white);
    color: var(--portal-accent-text);
    border: 1.5px solid var(--portal-border-strong);
  `,
  ghost: `
    background: transparent;
    color: var(--portal-accent-text);
  `,
  danger: `
    background: #dc2626;
    color: #ffffff;
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "padding: var(--space-sm) var(--space-lg); font-size: 0.8125rem;",
  md: "padding: var(--space-md) var(--space-xl); font-size: 0.9375rem;",
  lg: "padding: var(--space-lg) var(--space-2xl); font-size: 1.0625rem;",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      fullWidth = false,
      disabled,
      children,
      style,
      ...rest
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    const combinedStyle: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "var(--space-sm)",
      fontFamily: "var(--font-bn)",
      fontWeight: 600,
      borderRadius: "var(--radius-md)",
      minHeight: "var(--touch-min)",
      cursor: isDisabled ? "not-allowed" : "pointer",
      opacity: isDisabled ? 0.55 : 1,
      transition: "background var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast)",
      border: "none",
      width: fullWidth ? "100%" : undefined,
      ...parseCSSString(variantStyles[variant]),
      ...parseCSSString(sizeStyles[size]),
      ...style,
    };

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        style={combinedStyle}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading && (
          <span
            aria-hidden="true"
            style={{
              width: "1em",
              height: "1em",
              border: "2px solid currentColor",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "portal-spin 0.6s linear infinite",
              display: "inline-block",
              flexShrink: 0,
            }}
          />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

/* ---- helper ---- */
function parseCSSString(css: string): React.CSSProperties {
  const obj: Record<string, string> = {};
  css.split(";").forEach((rule) => {
    const [key, ...val] = rule.split(":");
    if (key && val.length) {
      const camel = key
        .trim()
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      obj[camel] = val.join(":").trim();
    }
  });
  return obj as unknown as React.CSSProperties;
}
