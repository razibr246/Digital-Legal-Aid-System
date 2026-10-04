"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BadgeCheck, IdCard, ShieldAlert } from "lucide-react";

export interface IdentitySummary {
  documentType: "nid" | "passport";
  documentNumberMasked: string;
  status: "verified" | "review" | "rejected";
  nameMatch: boolean | null;
  nameEn: string | null;
  nameBn: string | null;
  simulated: boolean;
  createdAt: string;
}

export interface IdentityPayload {
  profile: { displayName: string; verificationStatus: string };
  identity: { attempts: number; latest: IdentitySummary | null };
}

const VERIFICATION_LABELS: Record<string, { label: string; tone: string }> = {
  verified: { label: "যাচাইকৃত", tone: "bg-primary/10 text-primary" },
  pending: { label: "যাচাই প্রক্রিয়াধীন", tone: "bg-amber-100 text-amber-800" },
  unverified: { label: "যাচাই বাকি", tone: "bg-muted text-muted-foreground" },
};

/**
 * Identity verification status plus the NID/passport call to action. Rendered on
 * both the citizen dashboard and the profile page, so the state and the entry
 * point to /citizen/verify are identical wherever a citizen lands.
 */
export function VerificationCard({
  payload,
  compact,
  className,
}: {
  /** Pass the already-loaded profile payload to avoid a second fetch. */
  payload?: IdentityPayload | null;
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [fetched, setFetched] = useState<IdentityPayload | null>(null);
  const [loading, setLoading] = useState(!payload);

  // The parent may already have the payload; otherwise fetch it once.
  const data = payload ?? fetched;

  useEffect(() => {
    if (payload) return;
    let cancelled = false;
    fetch("/api/portal/profile", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: IdentityPayload | null) => {
        if (!cancelled && result) setFetched(result);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const status = data?.profile?.verificationStatus ?? "unverified";
  const tone = VERIFICATION_LABELS[status] ?? VERIFICATION_LABELS.unverified;
  const latest = data?.identity?.latest ?? null;
  const isVerified = status === "verified";

  return (
    <Card className={cn("w-full", className)}>
      <CardContent className={cn("flex flex-col gap-3", compact ? "p-4" : "p-5")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={cn("font-semibold text-foreground", compact ? "text-base" : "text-lg")}>
              পরিচয় যাচাই
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              NID বা পাসপোর্ট দিয়ে আপনার পরিচয় যাচাই করুন
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
              loading ? "bg-muted text-muted-foreground" : tone.tone,
            )}
          >
            {loading ? "লোড হচ্ছে…" : tone.label}
          </span>
        </div>

        {latest ? (
          <p className="text-sm text-muted-foreground">
            {latest.documentType === "nid" ? "জাতীয় পরিচয়পত্র" : "পাসপোর্ট"} ·{" "}
            {latest.documentNumberMasked}
            {latest.simulated ? (
              <span className="ml-2 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                simulated
              </span>
            ) : null}
          </p>
        ) : null}

        {latest?.nameMatch === false ? (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            পরিচয়পত্রের নামের সাথে আপনার নাম মেলেনি। যাচাইয়ের সময় নাম সংশোধনের অপশন পাবেন।
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {isVerified ? (
            <Button asChild variant="outline">
              <Link href="/citizen/verify">
                <BadgeCheck aria-hidden="true" />
                যাচাইয়ের তথ্য দেখুন
              </Link>
            </Button>
          ) : (
            <Button asChild onClick={() => router.refresh()}>
              <Link href="/citizen/verify">
                <IdCard aria-hidden="true" />
                NID বা পাসপোর্ট দিয়ে যাচাই করুন
              </Link>
            </Button>
          )}
          {data?.identity?.attempts ? (
            <span className="text-xs text-muted-foreground">
              মোট {data.identity.attempts} বার চেষ্টা
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
