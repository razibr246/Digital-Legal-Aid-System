"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { AgentFab } from "./AgentFab";
import { UniversalChatWidget } from "@/components/chat/universal-chat-widget";
import { ResponsiveNav, type ResponsiveNavItem } from "@/components/ui/responsive-nav";
import { Button } from "@/components/ui/button";

const NAV_ITEMS: ResponsiveNavItem[] = [
  { href: "/citizen", label: "ড্যাশবোর্ড" },
  { href: "/citizen/apply", label: "নতুন আবেদন" },
  { href: "/citizen/track", label: "ট্র্যাক" },
  { href: "/citizen/documents", label: "ডকুমেন্ট" },
  { href: "/citizen/sms", label: "এসএমএস" },
  { href: "/citizen/profile", label: "প্রোফাইল" },
];

const LOGOUT_ITEM_CLASS =
  "w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive md:ml-2 md:w-auto md:justify-center md:border-l md:border-border md:pl-3";

interface CitizenShellProps {
  children: ReactNode;
}

export function CitizenShell({ children }: CitizenShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  const logoutButton = (
    <Button
      type="button"
      variant="ghost"
      onClick={handleLogout}
      className={LOGOUT_ITEM_CLASS}
      aria-label="লগআউট"
    >
      <LogOut aria-hidden="true" />
      লগআউট
    </Button>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/citizen" className="flex min-w-0 items-center gap-3" aria-label="নাগরিক পোর্টাল — ড্যাশবোর্ড">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-lg"
            >
              🏛️
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-base font-bold leading-tight text-foreground">নাগরিক পোর্টাল</span>
              <span className="truncate text-xs text-muted-foreground">জাতীয় আইনগত সহায়তা প্রদান সংস্থা</span>
            </span>
          </Link>

          <ResponsiveNav
            items={NAV_ITEMS}
            isActive={(href) => pathname === href}
            label="নাগরিক পোর্টাল নেভিগেশন"
            footer={logoutButton}
            itemClassName="text-foreground hover:bg-accent hover:text-accent-foreground"
            activeItemClassName="text-accent-foreground underline decoration-primary decoration-2 underline-offset-4"
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6">{children}</main>

      <AgentFab />
      {/* Universal assistant: citizens and visitors only. Staff shells
          (DlaoShell, LawyerShell) deliberately do not mount it. */}
      <UniversalChatWidget />
    </div>
  );
}
