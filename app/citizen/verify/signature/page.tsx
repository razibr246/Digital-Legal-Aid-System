"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Save, Trash2 } from "lucide-react";

import { CitizenShell } from "@/lib/ui/shell/CitizenShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SignaturePad } from "@/components/identity/signature-pad";
import { VerificationProgressBar } from "@/components/identity/verification-progress";

interface SavedSignature {
  id: string;
  byte_size: number;
  signed_name: string;
  document_type: string | null;
  document_number_masked: string | null;
  created_at: string;
}

/** Task 3 of the journey: draw and save an e-signature. */
export default function SignaturePage() {
  const router = useRouter();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [signedName, setSignedName] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedSignature | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/portal/signature", { credentials: "include" });
    if (!response.ok) return;
    const payload = (await response.json()) as { signature?: SavedSignature | null };
    if (payload.signature) {
      setSaved(payload.signature);
      setSignedName(payload.signature.signed_name || "");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/signature", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { signature?: SavedSignature | null } | null) => {
        if (cancelled || !payload?.signature) return;
        setSaved(payload.signature);
        setSignedName(payload.signature.signed_name || "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const onPadChange = (next: string | null, nextSize: { width: number; height: number } | null) => {
    setDataUrl(next);
    setSize(nextSize);
  };

  async function save() {
    if (!dataUrl) {
      setError("প্রথমে স্বাক্ষর আঁকুন।");
      return;
    }
    if (!consent) {
      setError("ই-স্বাক্ষর সংরক্ষণের সম্মতি দিন।");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/portal/signature/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          dataUrl,
          consent,
          signedName: signedName.trim() || undefined,
          width: size?.width,
          height: size?.height,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.error || "স্বাক্ষর সংরক্ষণ করা যায়নি");
        return;
      }
      setSaved(null);
      await load();
      window.dispatchEvent(new Event("verification-progress-updated"));
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function clearSaved() {
    setSaving(true);
    try {
      await fetch("/api/portal/signature", { method: "DELETE", credentials: "include" });
      setSaved(null);
      setDataUrl(null);
      setError("");
      window.dispatchEvent(new Event("verification-progress-updated"));
      router.refresh();
    } finally {
      setSaving(false);
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
        <h1 className="text-2xl font-bold text-foreground">ই-স্বাক্ষর</h1>
        <p className="mt-1 text-muted-foreground">
          ধাপ ৩ — কাগজে স্বাক্ষর করার বদলে ডিজিটাল স্বাক্ষর দিন।
        </p>
      </div>

      <VerificationProgressBar className="mb-5" />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <SignaturePad
            onChange={onPadChange}
            disabled={saving}
            caption={signedName ? `${signedName} — স্বাক্ষর` : "স্বাক্ষার জায়গা"}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="signed-name">স্বাক্ষরকারীর নাম</Label>
            <Input
              id="signed-name"
              value={signedName}
              onChange={(event) => setSignedName(event.target.value)}
              placeholder="যে নামে স্বাক্ষর দিচ্ছেন"
              disabled={saving}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {saved ? (
            <Alert variant="success">
              <CheckCircle2 aria-hidden="true" />
              <AlertTitle>স্বাক্ষর সংরক্ষিত আছে</AlertTitle>
              <AlertDescription>
                <span className="block">নাম: {saved.signed_name || "—"}</span>
                <span className="block">আকার: {Math.round((saved.byte_size || 0) / 1024)} KB</span>
                {saved.document_number_masked ? (
                  <span className="block">
                    সংযুক্ত পরিচয়পত্র: {saved.document_number_masked}
                  </span>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <input
              id="sig-consent"
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <Label htmlFor="sig-consent" className="font-normal leading-snug">
              আমি সম্মতি দিচ্ছি যে এই ডিজিটাল স্বাক্ষরটি আমার আবেদনের জন্য ব্যবহার করা হবে।
            </Label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save} disabled={saving || !dataUrl || !consent}>
              {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
              স্বাক্ষর সংরক্ষণ করুন
            </Button>
            {saved ? (
              <Button type="button" variant="outline" onClick={clearSaved} disabled={saving}>
                <Trash2 aria-hidden="true" />
                স্বাক্ষর মুছে ফেলুন
              </Button>
            ) : null}
          </div>

          {error ? (
            <Alert variant="destructive">
              <Trash2 aria-hidden="true" />
              <AlertTitle>সংরক্ষণ হয়নি</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>
    </CitizenShell>
  );
}
