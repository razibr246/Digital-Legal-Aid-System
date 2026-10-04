"use client";

import { type HTMLAttributes, forwardRef } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className = "", style, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={className}
        style={{
          backgroundColor: "var(--portal-white)",
          border: "1px solid var(--portal-border)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-sm)",
          overflow: "hidden",
          ...style,
        }}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
Card.displayName = "Card";

export const CardHeader = ({
  children,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    style={{
      padding: "var(--space-lg) var(--space-xl)",
      borderBottom: "1px solid var(--portal-border)",
      backgroundColor: "var(--portal-white)",
      ...style,
    }}
    {...rest}
  >
    {children}
  </div>
);

export const CardContent = ({
  children,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    style={{
      padding: "var(--space-xl)",
      ...style,
    }}
    {...rest}
  >
    {children}
  </div>
);

export const CardFooter = ({
  children,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    style={{
      padding: "var(--space-lg) var(--space-xl)",
      borderTop: "1px solid var(--portal-border)",
      backgroundColor: "var(--portal-bg-subtle)",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "var(--space-md)",
      ...style,
    }}
    {...rest}
  >
    {children}
  </div>
);
