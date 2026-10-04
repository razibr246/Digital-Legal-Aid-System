"use client";

import { type InputHTMLAttributes, forwardRef, useId } from "react";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helpText?: string;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, error, helpText, id: providedId, className = "", ...rest }, ref) => {
    const fallbackId = useId();
    const id = providedId ?? fallbackId;
    const errorId = `${id}-error`;
    const helpId = `${id}-help`;

    const hasError = !!error;

    return (
      <div
        className={className}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-xs)",
        }}
      >
        <label
          htmlFor={id}
          style={{
            fontFamily: "var(--font-bn)",
            fontWeight: 600,
            color: "var(--portal-text)",
            fontSize: "0.9375rem",
          }}
        >
          {label}
          {rest.required && <span style={{ color: "#dc2626", marginLeft: "4px" }}>*</span>}
        </label>

        <input
          ref={ref}
          id={id}
          aria-invalid={hasError}
          aria-describedby={
            [hasError ? errorId : undefined, helpText ? helpId : undefined]
              .filter(Boolean)
              .join(" ") || undefined
          }
          style={{
            fontFamily: "var(--font-ui)", // UI font for input content (numbers, latin)
            fontSize: "1rem",
            padding: "var(--space-md) var(--space-lg)",
            borderRadius: "var(--radius-md)",
            border: `1.5px solid ${hasError ? "#dc2626" : "var(--portal-border-strong)"}`,
            backgroundColor: "var(--portal-white)",
            color: "var(--portal-text)",
            minHeight: "var(--touch-min)",
            outline: "none",
            transition: "border-color var(--transition-fast), box-shadow var(--transition-fast)",
            width: "100%",
          }}
          // Basic focus ring handling via class or style is tricky without CSS modules or styled-components.
          // We rely on the global :focus-visible from tokens.css for the outline,
          // but input needs special care. Using a tailwind-like approach or just inline styles for normal state.
          onFocus={(e) => {
             e.target.style.borderColor = hasError ? "#dc2626" : "var(--portal-accent)";
             e.target.style.boxShadow = `0 0 0 3px ${hasError ? "#fee2e2" : "var(--portal-accent-light)"}`;
             if (rest.onFocus) rest.onFocus(e);
          }}
          onBlur={(e) => {
            e.target.style.borderColor = hasError ? "#dc2626" : "var(--portal-border-strong)";
            e.target.style.boxShadow = "none";
            if (rest.onBlur) rest.onBlur(e);
          }}
          {...rest}
        />

        {hasError && (
          <p
            id={errorId}
            role="alert"
            style={{
              fontFamily: "var(--font-bn)",
              color: "#dc2626",
              fontSize: "0.8125rem",
              fontWeight: 500,
              marginTop: "2px",
            }}
          >
            {error}
          </p>
        )}

        {helpText && !hasError && (
          <p
            id={helpId}
            style={{
              fontFamily: "var(--font-bn)",
              color: "var(--portal-text-secondary)",
              fontSize: "0.8125rem",
              marginTop: "2px",
            }}
          >
            {helpText}
          </p>
        )}
      </div>
    );
  },
);
FormField.displayName = "FormField";
