"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, BadgeCheck, Camera, Eye, EyeOff, IdCard, Loader2, Save, ScanLine, ShieldAlert } from "lucide-react";

import { CitizenShell } from "@/lib/ui/shell/CitizenShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IdCapture } from "@/components/identity/id-capture";
import { VerificationProgressBar } from "@/components/identity/verification-progress";
import type { DocumentType, IdentityVerificationRecord } from "@/lib/identity/identity";

type Stage = "idle" | "capturing" | "ocr" | "registry" | "done" | "error";

const STAGE_COPY: Record<Exclude<Stage, "idle" | "error" | "done">, string> = {
  capturing: "ছবি প্রস্তুত করা হচ্ছে…",
  ocr: "ছবি থেকে তথ্য পড়া হচ্ছে (OCR)…",
  registry: "পরিচয়পত্র যাচাই করা হচ্ছে…",
};

export default function VerifyIdentityPage() {
  const router = useRouter();
  const [documentType, setDocumentType] = useState<DocumentType>("nid");
  const [number, setNumber] = useState("");
  const [photo, setPhoto] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<IdentityVerificationRecord | null>(null);
  const [history, setHistory] = useState<IdentityVerificationRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [revealId, setRevealId] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(result?.acceptedAt ?? null);

  const busy = stage === "capturing" || stage === "ocr" || stage === "registry";

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/portal/verifications", { credentials: "include" });
    if (!response.ok) return;
    const payload = (await response.json()) as { verifications?: Record<string, unknown>[] };
    setHistory((payload.verifications ?? []) as unknown as IdentityVerificationRecord[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/verifications", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { verifications?: Record<string, unknown>[] } | null) => {
        if (cancelled || !payload) return;
        setHistory((payload.verifications ?? []) as unknown as IdentityVerificationRecord[]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  /** Runs the request while stepping through the pipeline labels. */
  const runPipeline = useCallback(
    async (send: () => Promise<Response>, needsOcr: boolean) => {
      setError("");
      setResult(null);
      setStage(needsOcr ? "capturing" : "registry");
      const request = send();

      if (needsOcr) {
        const toOcr = setTimeout(() => setStage("ocr"), 350);
        const toRegistry = setTimeout(() => setStage("registry"), 1400);
        try {
          const response = await request;
          clearTimeout(toOcr);
          clearTimeout(toRegistry);
          return response;
        } finally {
          clearTimeout(toOcr);
          clearTimeout(toRegistry);
        }
      }

      return request;
    },
    [],
  );

  const submitNumber = async (event: React.FormEvent) => {
    event.preventDefault();
    const response = await runPipeline(
      () =>
        fetch("/api/portal/verify-identity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ documentType, documentNumber: number.trim() }),
        }),
      false,
    );
    const payload = (await response.json()) as {
      ok: boolean;
      error?: string;
      verification?: IdentityVerificationRecord;
    };
    if (!response.ok || !payload.ok || !payload.verification) {
      setStage("error");
      setError(payload.error || "যাচাই সম্পন্ন হয়নি");
      return;
    }
    setResult(payload.verification);
    setStage("done");
    void loadHistory();
    router.refresh();
    window.dispatchEvent(new Event("verification-progress-updated"));
  };

  const submitPhoto = async () => {
    if (!photo) {
      setStage("error");
      setError("প্রথমে পত্রের ছবি ধরুন বা আপলোড করুন।");
      return;
    }
    const base64 = photo.split(",")[1] ?? "";
    const mimeType = photo.slice(5, photo.indexOf(";"));
    const formData = new FormData();
    formData.append("photo", base64ToBlob(base64, mimeType), "document.jpg");
    formData.append("documentType", documentType);

    const response = await runPipeline(
      () =>
        fetch("/api/portal/verify-identity", {
          method: "POST",
          credentials: "include",
          body: formData,
        }),
      true,
    );
    const payload = (await response.json()) as {
      ok: boolean;
      error?: string;
      verification?: IdentityVerificationRecord;
    };
    if (!response.ok || !payload.ok || !payload.verification) {
      setStage("error");
      setError(payload.error || "ছবি যাচাই করা যায়নি");
      return;
    }
    setResult(payload.verification);
    setStage("done");
    void loadHistory();
    router.refresh();
    window.dispatchEvent(new Event("verification-progress-updated"));
  };

  /** Explicit sign-off: this is what makes the record "accepted". */
  const saveVerification = async () => {
    if (!result) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/portal/verify-identity/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ verificationId: result.id }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string; acceptedAt?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.error || "ফলাফল সংরক্ষণ করা যায়নি");
        return;
      }
      setSavedAt(payload.acceptedAt ?? new Date().toISOString());
      router.refresh();
      void loadHistory();
    } finally {
      setSaving(false);
    }
  };

  const stageLabel = useMemo(() => {
    if (stage in STAGE_COPY) return STAGE_COPY[stage as keyof typeof STAGE_COPY];
    return null;
  }, [stage]);

  return (
    <CitizenShell>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground">
        <Link href="/citizen">
          <ArrowLeft aria-hidden="true" />
          ড্যাশবোর্ডে ফিরুন
        </Link>
      </Button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">পরিচয় যাচাই</h1>
        <p className="mt-1 text-muted-foreground">
          জাতীয় পরিচয়পত্র (NID) অথবা পাসপোর্ট দিয়ে আপনার পরিচয় যাচাই করুন।
        </p>
      </div>

      <Alert variant="warning" className="mb-5">
        <ShieldAlert aria-hidden="true" />
        <AlertTitle>এটি একটি সিমুলেশন</AlertTitle>
        <AlertDescription>
          OCR ও পরিচয়পত্র যাচাই এখন প্রকৃত সরকারি ডাটাবেসের বদলে নকল (simulated) ফলাফল দেয়। যাচাইকৃত
          হিসেবে গণ্য হওয়ার আগে একজন DLAO কর্মকর্তাকে আসল পরিচয়পত্র দেখাতে হবে।
        </AlertDescription>
      </Alert>

      <VerificationProgressBar className="mb-5" />

      <div className="grid gap-5 pb-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Card>
          <CardHeader>
            <CardTitle>যাচাইয়ের পদ্ধতি</CardTitle>
            <CardDescription>দুইটি যেকোনো একটি পদ্ধতি বেছে নিন।</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2">
              {(["nid", "passport"] as DocumentType[]).map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={documentType === type ? "default" : "outline"}
                  onClick={() => setDocumentType(type)}
                  disabled={busy}
                >
                  {type === "nid" ? "জাতীয় পরিচয়পত্র" : "পাসপোর্ট"}
                </Button>
              ))}
            </div>

            <Tabs defaultValue="number">
              <TabsList>
                <TabsTrigger value="number">
                  <IdCard aria-hidden="true" />
                  নম্বর দিয়ে যাচাই
                </TabsTrigger>
                <TabsTrigger value="photo">
                  <Camera aria-hidden="true" />
                  ছবি তুলে যাচাই
                </TabsTrigger>
              </TabsList>

              <TabsContent value="number">
                <form onSubmit={submitNumber} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="doc-number">
                      {documentType === "nid" ? "জাতীয় পরিচয়পত্র নম্বর" : "পাসপোর্ট নম্বর"}
                    </Label>
                    <Input
                      id="doc-number"
                      value={number}
                      onChange={(event) => setNumber(event.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={documentType === "nid" ? "যেমন: 199274512340" : "যেমন: AB1234567"}
                      disabled={busy}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      {documentType === "nid"
                        ? "১০, ১৩ অথবা ১৭ সংখ্যার পরিচয়পত্র নম্বর দিন।"
                        : "১-২ অক্ষর এবং ৭-৯ সংখ্যার পাসপোর্ট নম্বর দিন, যেমন AB1234567।"}
                    </p>
                  </div>
                  <Button type="submit" disabled={busy || number.trim().length === 0}>
                    {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <BadgeCheck aria-hidden="true" />}
                    যাচাই করুন
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="photo">
                <div className="flex flex-col gap-4">
                  <IdCapture
                    documentType={documentType}
                    onCapture={setPhoto}
                    disabled={busy}
                  />
                  <Button type="button" onClick={submitPhoto} disabled={busy || !photo}>
                    {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ScanLine aria-hidden="true" />}
                    ছবি যাচাই করুন
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            {stageLabel ? (
              <Alert variant="info" className="mt-4">
                <Loader2 className="animate-spin" aria-hidden="true" />
                <AlertTitle>প্রক্রিয়া চলছে</AlertTitle>
                <AlertDescription>{stageLabel}</AlertDescription>
              </Alert>
            ) : null}

            {error ? (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle aria-hidden="true" />
                <AlertTitle>যাচাই সম্পন্ন হয়নি</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          {result ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  যাচাইয়ের ফলাফল
                  {result.simulated ? (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                      simulated
                    </span>
                  ) : null}
                </CardTitle>
                <CardDescription>
                  {savedAt
                    ? "আপনি এই ফলাফলটি সংরক্ষণ করেছেন।"
                    : result.status === "verified"
                    ? "নাম মিলেছে — যাচাইকৃত হিসেবে চিহ্নিত করা হয়েছে।"
                    : "নাম মেলেনি — জেলা লিগ্যাল এইড অফিসের পর্যালোচনার জন্য পাঠানো হয়েছে।"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <dl className="grid gap-2 text-sm">
                  {([
                    ["পত্রের ধরন", result.documentType === "nid" ? "জাতীয় পরিচয়পত্র" : "পাসপোর্ট"],
                    [
                      "পত্রের নম্বর",
                      <span key="id" className="inline-flex items-center gap-2">
                        <span className="font-mono tracking-wide">
                          {revealId ? result.documentNumber || result.documentNumberMasked : result.documentNumberMasked}
                        </span>
                        <button
                          type="button"
                          onClick={() => setRevealId((value) => !value)}
                          className="inline-flex items-center gap-1 rounded-md border border-input px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-accent"
                          aria-label={revealId ? "পত্রের নম্বর লুকান" : "পত্রের নম্বর দেখান"}
                        >
                          {revealId ? <EyeOff className="size-3" aria-hidden="true" /> : <Eye className="size-3" aria-hidden="true" />}
                          {revealId ? "লুকান" : "দেখুন"}
                        </button>
                      </span>,
                    ],
                    ["পিতার নাম", result.fatherName || "—"],
                    ["মাতার নাম", result.motherName || "—"],
                    ["নাম (ইংরেজি)", result.nameEn || "—"],
                    ["নাম (বাংলা)", result.nameBn || "—"],
                    ["জন্ম তারিখ", result.dateOfBirth || "—"],
                    ["ঠিকানা", result.address || "—"],
                    ["পদ্ধতি", result.method === "photo" ? "ছবি (OCR)" : "নম্বর"],
                    ["OCR নির্ভরযোগ্যতা", result.ocrConfidence ? `${Math.round(result.ocrConfidence * 100)}%` : "—"],
                  ] as [string, React.ReactNode][]).map(([term, detail]) => (
                    <div key={term} className="flex items-start justify-between gap-3 border-b border-border/60 pb-1.5 last:border-0">
                      <dt className="shrink-0 text-muted-foreground">{term}</dt>
                      <dd className="text-right font-semibold break-words">{detail}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  {savedAt ? (
                    <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                      <BadgeCheck className="size-4" aria-hidden="true" />
                      ফলাফল সংরক্ষিত হয়েছে।
                    </p>
                  ) : (
                    <Button type="button" onClick={saveVerification} disabled={saving}>
                      {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                      ফলাফল সংরক্ষণ করুন
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    সংরক্ষণ করলে এই তথ্যগুলো আপনার প্রোফাইলে যুক্ত হবে। যাচাইকৃত হওয়ার জন্য একজন
                    DLAO কর্মকর্তাকে আসল পরিচয়পত্র যাচাই করতে হবে।
                  </p>
                </div>

                {result.nameMatch === false ? (
                  <Alert variant="warning">
                    <AlertCircle aria-hidden="true" />
                    <AlertTitle>নামের পার্থক্য</AlertTitle>
                    <AlertDescription>
                      {result.nameMismatchDetail ||
                        "প্রোফাইলের নাম পত্রের নামের সাথে মেলেনি।"}
                      <span className="mt-2 block">
                        আপনার নাম স্বয়ংক্রিয়ভাবে পরিচয়পত্র অনুযায়ী পরিবর্তন করা হয়েছে
                        {result.profileName ? `: ${result.profileName}` : ""}
                        {result.nameUpdatedFromDocument ? "" : " (আগের নামের সাথে একই ছিল)"}
                        ।
                      </span>
                    </AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {history.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>আগের যাচাই</CardTitle>
                <CardDescription>সর্বশেষ {history.length} টি প্রচেষ্টা</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {history.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold">
                      {item.documentType === "nid" ? "NID" : "পাসপোর্ট"} · {item.documentNumberMasked}
                    </span>
                    <span
                      className={
                        item.status === "verified"
                          ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
                          : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
                      }
                    >
                      {item.status === "verified" ? "যাচাইকৃত" : "পর্যালোচনা"}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </CitizenShell>
  );
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || "image/jpeg" });
}
