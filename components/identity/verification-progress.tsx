"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, CircleDashed, ScanFace, Signature } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  VERIFICATION_STEPS,
  type VerificationProgress,
  type VerificationStepState,
} from "@/lib/identity/steps";

const ICONS = {
  document: ScanFace,
  face: ScanFace,
  signature: Signature,
} as const;

export function VerificationProgressBar({ className }: { className?: string }) {
  const [progress, setProgress] = useState<VerificationProgress | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/portal/verification-progress", { credentials: "include" });
    if (!response.ok) return;
    const payload = (await response.json()) as { progress?: VerificationProgress };
    if (payload.progress) setProgress(payload.progress);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchProgress = () => {
      fetch("/api/portal/verification-progress", { credentials: "include" })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { progress?: VerificationProgress } | null) => {
          if (!cancelled && payload?.progress) setProgress(payload.progress);
        })
        .catch(() => undefined);
    };
    fetchProgress();
    // Steps completed on sibling pages announce themselves.
    window.addEventListener("verification-progress-updated", fetchProgress);
    return () => {
      cancelled = true;
      window.removeEventListener("verification-progress-updated", fetchProgress);
    };
  }, []);

  const states = progress?.steps ?? [];
  const stateFor = (id: string): VerificationStepState =>
    states.find((step) => step.id === id) ?? {
      id: id as VerificationStepState["id"],
      status: "pending",
      completedAt: null,
      result: null,
    };

  const completed = progress?.completed ?? 0;
  const total = progress?.total ?? VERIFICATION_STEPS.length;
  const percent = progress?.percent ?? 0;

  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">পরিচয় যাচাই — ৩ ধাপ</h2>
            <p className="text-sm text-muted-foreground">
              {completed} / {total} ধাপ সম্পন্ন
            </p>
          </div>
          <span className="text-sm font-bold tabular-nums text-primary">{percent}%</span>
        </div>

        <Progress value={percent} aria-label="পরিচয় যাচাইয়ের অগ্রগতি" />

        <ol className="flex flex-col gap-2">
          {VERIFICATION_STEPS.map((definition) => {
            const state = stateFor(definition.id);
            const done = state.status === "complete";
            const Icon = done ? Check : ICONS[definition.id] ?? CircleDashed;
            return (
              <li key={definition.id}>
                <Link
                  href={definition.href}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 transition hover:bg-accent",
                    done ? "border-primary/40 bg-primary/5" : "border-border",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {definition.order}. {definition.titleBn}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase",
                          done ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {done ? "সম্পন্ন" : "অপেক্ষমাণ"}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {definition.descriptionBn}
                    </span>
                    {state.result && done ? (
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {summarise(definition.id, state.result)}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>

        {progress?.allComplete ? (
          <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
            তিনটি ধাপই সম্পন্ন হয়েছে। এখন আবেদন জমা দিতে পারেন।
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function summarise(step: string, result: Record<string, unknown>): string {
  if (step === "document") {
    const type = result.documentType === "nid" ? "জাতীয় পরিচয়পত্র" : "পাসপোর্ট";
    return `${type} · ${String(result.documentNumberMasked ?? "")}`;
  }
  if (step === "face") {
    const score = Number(result.matchScore);
    return `মিলের হার ${(Number.isFinite(score) ? Math.round(score * 100) : 0)}% · সিমুলেটেড`;
  }
  if (step === "signature") {
    return `স্বাক্ষর সংরক্ষিত · ${String(result.signedName ?? "")}`;
  }
  return "";
}
