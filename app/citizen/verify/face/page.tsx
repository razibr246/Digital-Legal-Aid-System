"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, CameraOff, Loader2, ShieldAlert, Upload } from "lucide-react";

import { CitizenShell } from "@/lib/ui/shell/CitizenShell";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { IdCapture } from "@/components/identity/id-capture";
import { VerificationProgressBar } from "@/components/identity/verification-progress";

interface FaceResult {
  matchScore: number;
  isMatch: boolean;
  liveness: "passed" | "retry";
  threshold: number;
  documentType: string;
  documentNumberMasked: string;
  simulated: boolean;
  imageRetained: boolean;
}

/**
 * Task 2 of the journey: face check.
 *
 * The capture and comparison are a SIMULATION — no face-recognition model runs
 * and the selfie is never stored. The page states this plainly so nobody is
 * misled, and the backend discards the image after deriving a score.
 */
export default function FaceVerificationPage() {
  const router = useRouter();
  const [selfie, setSelfie] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FaceResult | null>(null);
  const [docReady, setDocReady] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/verifications", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { verifications?: unknown[] } | null) => {
        if (!cancelled) setDocReady((payload?.verifications?.length ?? 0) > 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function runMatch() {
    if (!selfie) {
      setError("প্রথমে সেলফি ছবি তুলুন বা আপলোড করুন।");
      return;
    }
    if (!consent) {
      setError("মুখের ছবি যাচাইয়ের সম্মতি দিন।");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const base64 = selfie.split(",")[1] ?? "";
      const mimeType = selfie.slice(5, selfie.indexOf(";"));
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const formData = new FormData();
      formData.append("selfie", new Blob([bytes], { type: mimeType || "image/jpeg" }), "selfie.jpg");
      formData.append("consent", String(consent));

      const response = await fetch("/api/portal/face-match", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const payload = (await response.json()) as { ok: boolean; error?: string; face?: FaceResult };
      if (!response.ok || !payload.ok || !payload.face) {
        setError(payload.error || "মুখ পরীক্ষা সম্পন্ন হয়নি");
        return;
      }
      setResult(payload.face);
      window.dispatchEvent(new Event("verification-progress-updated"));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <CitizenShell>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground">
        <a href="/citizen/verify">
          <ArrowLeft aria-hidden="true" />
          ডকুমেন্ট যাচাইয়ে ফিরুন
        </a>
      </Button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">মুখ পরীক্ষা</h1>
        <p className="mt-1 text-muted-foreground">
          ধাপ ২ — পরিচয়পত্রের ছবির সাথে আপনার মুখ মিলিয়ে দেখা হবে।
        </p>
      </div>

      <VerificationProgressBar className="mb-5" />

      <Alert variant="warning" className="mb-5">
        <ShieldAlert aria-hidden="true" />
        <AlertTitle>এটি একটি সিমুলেশন</AlertTitle>
        <AlertDescription>
          কোনো ফেস-রিকগনিশন মডেল চলে না এবং আপনার সেলফি কোথাও সংরক্ষিত হয় না — ছবিটি যাচাই
          করার পরে বিলগুনই মুছে ফেলা হয়। কেবল একটি নকল (simulated) মিলের হার দেখানো হয়।
        </AlertDescription>
      </Alert>

      {docReady === false ? (
        <Alert variant="destructive" className="mb-5">
          <CameraOff aria-hidden="true" />
          <AlertTitle>প্রথমে পরিচয়পত্র যাচাই করুন</AlertTitle>
          <AlertDescription>
            মুখ মিলিয়ে দেখার জন্য একটি যাচাইকৃত পরিচয়পত্র প্রয়োজন।{" "}
            <a href="/citizen/verify" className="font-semibold underline">
              ডকুমেন্ট যাচাইয়ে যান
            </a>
            ।
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <IdCapture variant="face" documentType="nid" onCapture={setSelfie} disabled={busy} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <input
              id="consent"
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <Label htmlFor="consent" className="font-normal leading-snug">
              আমি সম্মতি দিচ্ছি যে এই যাচাইয়ের জন্য আমার মুখের ছবি ব্যবহার করা হবে। ছবিটি
              সংরক্ষণ করা হবে না।
            </Label>
          </div>

          <Button type="button" onClick={runMatch} disabled={busy || !selfie || !consent}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}
            মুখ পরীক্ষা করুন
          </Button>

          {error ? (
            <Alert variant="destructive">
              <CameraOff aria-hidden="true" />
              <AlertTitle>সম্পন্ন হয়নি</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {result ? (
            <Alert variant={result.isMatch && result.liveness === "passed" ? "success" : "warning"}>
              {result.isMatch && result.liveness === "passed" ? (
                <ShieldAlert aria-hidden="true" />
              ) : (
                <Upload aria-hidden="true" />
              )}
              <AlertTitle>
                {result.isMatch && result.liveness === "passed"
                  ? "মুখ মিলেছে (সিমুলেটেড)"
                  : result.liveness === "retry"
                    ? "আবার চেষ্টা করুন"
                    : "পুরোপুরি মেলেনি"}
              </AlertTitle>
              <AlertDescription>
                <span className="block">
                  মিলের হার: {Math.round(result.matchScore * 100)}% (সীমা{" "}
                  {Math.round(result.threshold * 100)}%)
                </span>
                <span className="block">
                  লাইভনেস: {result.liveness === "passed" ? "পাস" : "আবার নিন"}
                </span>
                <span className="block">
                  তুলনা করা হয়েছে:{" "}
                  {result.documentType === "nid" ? "জাতীয় পরিচয়পত্র" : "পাসপোর্ট"} ·{" "}
                  {result.documentNumberMasked}
                </span>
                <span className="block">আপনার ছবি সংরক্ষণ করা হয়নি।</span>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>
    </CitizenShell>
  );
}
