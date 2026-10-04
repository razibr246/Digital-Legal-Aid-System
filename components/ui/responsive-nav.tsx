"use client";

import * as React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export interface ResponsiveNavItem {
  href: string;
  label: string;
  /** Extra classes for the matching nav item, e.g. a highlight colour. */
  className?: string;
}

interface ResponsiveNavProps {
  items: ResponsiveNavItem[];
  /** Marks the current page; receives each item href. */
  isActive: (href: string) => boolean;
  /** Accessible name for both the desktop row and the mobile panel. */
  label: string;
  /** Rendered inside the panel, below the links (e.g. a logout button). */
  footer?: React.ReactNode;
  className?: string;
  itemClassName?: string;
  activeItemClassName?: string;
}

/**
 * One responsive navigation for every shell in the app.
 *
 * Desktop renders a single horizontal row. Mobile collapses to a shadcn Sheet,
 * which gives us the hamburger, focus trapping, Escape-to-close, scroll locking,
 * focus restore and outside-tap dismissal from Radix instead of hand-rolled
 * state — so none of that behaviour is duplicated per shell.
 */
export function ResponsiveNav({
  items,
  isActive,
  label,
  footer,
  className,
  itemClassName,
  activeItemClassName,
}: ResponsiveNavProps) {
  const linkClasses = cn(
    "inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    itemClassName,
  );

  const panelLinkClasses = cn(
    "flex min-h-12 items-center rounded-md px-3 py-2.5 text-base font-semibold transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    itemClassName,
  );

  return (
    <>
      {/* Desktop: a single row, hidden below the md breakpoint by the class below. */}
      <nav aria-label={label} className={cn("hidden items-center gap-1 md:flex", className)}>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={cn(linkClasses, isActive(item.href) && activeItemClassName)}
          >
            {item.label}
          </Link>
        ))}
        {footer}
      </nav>

      {/* Mobile: shadcn Sheet handles all of the disclosure behaviour. */}
      <div className="md:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="default"
            className="min-h-11 gap-2 md:hidden"
            aria-label={`${label} — মেনু খুলুন`}
          >
            <Menu aria-hidden="true" />
            <span>মেনু</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="top" aria-label={label}>
          <SheetTitle className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </SheetTitle>
          {items.map((item) => (
            <SheetClose asChild key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(panelLinkClasses, isActive(item.href) && activeItemClassName)}
              >
                {item.label}
              </Link>
            </SheetClose>
          ))}
          {footer ? <SheetClose asChild>{footer}</SheetClose> : null}
        </SheetContent>
      </Sheet>
      </div>
    </>
  );
}
