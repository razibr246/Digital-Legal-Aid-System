"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, FlipHorizontal, RefreshCw, Upload } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export type CaptureState = "idle" | "requesting" | "ready" | "denied" | "unsupported" | "error";
export type CaptureVariant = "document" | "face";
export type FacingMode = "environment" | "user";

interface IdCaptureProps {
  documentType: "nid" | "passport";
  onCapture: (dataUrl: string) => void;
  disabled?: boolean;
  className?: string;
  /** "document" keeps the card aspect ratio; "face" frames the head in a circle. */
  variant?: CaptureVariant;
  /** Which camera to open first. Defaults to the rear camera. */
  initialFacing?: FacingMode;
}

const GUIDANCE: Record<"nid" | "passport", { ratio: number; hint: string }> = {
  // ID-1 cards are 85.6 x 54 mm; passport data pages are taller than a card.
  nid: { ratio: 85.6 / 54, hint: "পরিচয়পত্রের চারটি কোণ ও নম্বরটি ফ্রেমের ভেতরে রাখুন।" },
  passport: { ratio: 125 / 88, hint: "পাসপোর্টের তথ্যপাতা সমতলে ধরে চারটি কোণ দেখাচ্ছেন নিশ্চিত করুন।" },
};

/** Best-effort read of which camera a device is. Null when the label is opaque. */
function facingFromLabel(label: string): FacingMode | null {
  if (/front|user|সামনে|前置/i.test(label)) return "user";
  if (/back|rear|environment|পিছনে|后置/i.test(label)) return "environment";
  return null;
}

export function IdCapture({
  documentType,
  onCapture,
  disabled,
  className,
  variant = "document",
  initialFacing = "environment",
}: IdCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CaptureState>("idle");
  const [message, setMessage] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [facing, setFacing] = useState<FacingMode>(initialFacing);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const isFace = variant === "face";

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopStream, [stopStream]);

  // Device labels are only populated after permission is granted, so this is
  // refreshed every time a stream opens rather than once on mount.
  const refreshCameras = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setCameras(all.filter((device) => device.kind === "videoinput"));
    } catch {
      setCameras([]);
    }
  }, []);

  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media?.addEventListener) return;
    // A headset or foldable being plugged in changes the available cameras.
    const onChange = () => void refreshCameras();
    media.addEventListener("devicechange", onChange);
    return () => media.removeEventListener("devicechange", onChange);
  }, [refreshCameras]);

  /**
   * Opens a camera, replacing whatever is streaming now.
   *
   * The previous stream MUST be stopped first: most browsers refuse to open a
   * second capture device while another is live and surface it as
   * NotReadableError ("Could not start video source").
   *
   * Constraints are tried in order of strictness. `facingMode: { ideal }` is
   * only a hint, so the browser may silently hand back the same camera;
   * `exact` makes it commit or fail, and a pinned deviceId is strictest of all.
   */
  const start = useCallback(
    async (target?: { deviceId?: string; facing?: FacingMode }) => {
      setMessage("");
      if (typeof window === "undefined") return;

      if (!navigator.mediaDevices?.getUserMedia) {
        // getUserMedia needs a secure context; the softphone already requires
        // getUserMedia for calls, so this is only reachable on odd browsers.
        setState("unsupported");
        setMessage("এই ব্রাউজারে ক্যামেরা অ্যাক্সেস নেই। নিচে ছবি আপলোড করার অপশনটি ব্যবহার করুন।");
        return;
      }

      const wantedFacing = target?.facing;
      const attempts: MediaTrackConstraints[] = [];
      if (target?.deviceId) attempts.push({ deviceId: { exact: target.deviceId } });
      if (wantedFacing) attempts.push({ facingMode: { exact: wantedFacing } });
      attempts.push({ facingMode: { ideal: wantedFacing ?? "environment" } });
      attempts.push({});

      setState("requesting");
      // Release the camera before asking for a different one.
      stopStream();
      if (videoRef.current) videoRef.current.srcObject = null;
      // Some browsers need a beat to hand the device back.
      await new Promise((resolve) => setTimeout(resolve, 120));

      try {
        let stream: MediaStream | null = null;
        let lastError: unknown = null;
        for (const video of attempts) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { ...video, width: { ideal: 1920 }, height: { ideal: 1080 } },
              audio: false,
            });
            break;
          } catch (error) {
            lastError = error;
          }
        }
        if (!stream) throw lastError;

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }

        const track = stream.getVideoTracks()[0];
        const openedId = track?.getSettings().deviceId ?? null;
        setActiveDeviceId(openedId);
        await refreshCameras();
        setState("ready");
        // Report what actually opened, not what we asked for. Some platforms
        // give opaque labels, so fall back to the intent we passed in.
        setFacing((prev) => {
          if (!openedId) return wantedFacing ?? prev;
          const label = cameras.find((device) => device.deviceId === openedId)?.label ?? "";
          return facingFromLabel(label) ?? wantedFacing ?? prev;
        });
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setState("denied");
          setMessage(
            "ক্যামেরার অনুমতি পাওয়া যায়নি। ব্রাউজারের ঠিকানা বারে ক্যামেরা আইকনে অনুমতি দিন, অথবা নিচে ছবি আপলোড করুন।",
          );
        } else if (name === "NotReadableError" || name === "AbortError") {
          // The camera is held by another app or another stream.
          setState("error");
          setMessage(
            "ক্যামেরাটি এখন ব্যবহারে আছে। অন্য অ্যাপ বন্ধ করে বা কয়েক সেকেন্ড পর আবার চেষ্টা করুন।",
          );
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setState("unsupported");
          setMessage("এই ডিভাইসে ক্যামেরা পাওয়া যায়নি। নিচে ছবি আপলোড করুন।");
        } else {
          setState("error");
          setMessage(`ক্যামেরা চালু করা যায়নি: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    },
    [cameras, refreshCameras, stopStream],
  );

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setShot(dataUrl);
    stopStream();
    onCapture(dataUrl);
  }, [onCapture, stopStream]);

  const retake = useCallback(() => {
    setShot(null);
    onCapture("");
    // Reopen whichever camera is live now, not the original default.
    void start(activeDeviceId ? { deviceId: activeDeviceId } : { facing });
  }, [activeDeviceId, facing, onCapture, start]);

  /**
   * Moves to the other camera. Prefers a concrete device, but falls back to a
   * facingMode flip because iOS reports a single video input even though the
   * front camera is reachable through facingMode alone.
   */
  const switchCamera = useCallback(() => {
    const nextFacing: FacingMode = facing === "environment" ? "user" : "environment";
    const next = cameras.find((device) => device.deviceId !== activeDeviceId);
    setShot(null);
    onCapture("");
    void start(next ? { deviceId: next.deviceId, facing: nextFacing } : { facing: nextFacing });
  }, [activeDeviceId, cameras, facing, onCapture, start]);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        setMessage("শুধুমাত্র JPEG, PNG বা WebP ছবি দিন।");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        setShot(result);
        onCapture(result);
      };
      reader.readAsDataURL(file);
    },
    [onCapture],
  );

  const { ratio, hint } = GUIDANCE[documentType];
  const frameRatio = isFace ? 1 : ratio;
  const frameHint = isFace
    ? "মুখটি বৃত্তের ভেতরে রাখুন, সোজা ক্যামেরার দিকে তাকিয়ে থাকুন এবং আলো সমতল রাখুন।"
    : hint;
  const cameraLabel = facing === "environment" ? "পিছনের ক্যামেরা" : "সামনের ক্যামেরা";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {state === "denied" || state === "unsupported" || state === "error" ? (
        <Alert variant="warning">
          <CameraOff aria-hidden="true" />
          <AlertTitle>ক্যামেরা ব্যবহার করা যাচ্ছে না</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <div
        className={cn(
          "relative w-full overflow-hidden border-2 border-dashed border-border bg-muted",
          isFace ? "mx-auto max-w-[320px] rounded-full" : "rounded-xl",
        )}
        style={{ aspectRatio: String(frameRatio) }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className={cn("h-full w-full object-cover", (state === "ready" && !shot) ? "block" : "hidden")}
        />

        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot} alt="ধারণ করা পরিচয়পত্রের প্রিভিউ" className="h-full w-full object-cover" />
        ) : null}

        {/* Framing guide: the document must sit inside this outline. */}
        {!shot ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className={cn(
                "relative h-full w-full border-2 border-dashed border-primary/80",
                isFace ? "rounded-full" : "rounded-lg",
              )}
              style={{ aspectRatio: String(frameRatio) }}
            >
              {isFace ? (
                // Head-and-shoulders hint inside the ring.
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
                  <div className="size-[38%] rounded-full border-2 border-dashed border-primary/50" />
                  <div className="h-[22%] w-[62%] rounded-t-[999px] border-2 border-b-0 border-dashed border-primary/50" />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {state === "requesting" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-semibold">
            ক্যামেরা চালু হচ্ছে…
          </div>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">{frameHint} ছায়া ও প্রতিফলন এড়িয়ে চলুন।</p>

      <div className="flex flex-wrap gap-2">
        {state !== "ready" || shot ? (
          <Button type="button" onClick={() => void start({ facing })} disabled={disabled} variant="outline">
            <Camera aria-hidden="true" />
            {state === "denied" || state === "unsupported" ? "আবার চেষ্টা করুন" : "ক্যামেরা চালু করুন"}
          </Button>
        ) : (
          <Button type="button" onClick={capture} disabled={disabled}>
            <Camera aria-hidden="true" />
            ছবি ধরুন
          </Button>
        )}

        {shot ? (
          <Button type="button" onClick={retake} disabled={disabled} variant="outline">
            <RefreshCw aria-hidden="true" />
            আবার ধরুন
          </Button>
        ) : null}

        {/* Always offered: a single enumerated camera does not mean a single
            physical lens, since iOS only ever reports the front one. */}
        {state === "ready" && !shot ? (
          <Button
            type="button"
            onClick={switchCamera}
            disabled={disabled}
            variant="outline"
            aria-label={`ক্যামেরা পরিবর্তন করুন (এখন ${cameraLabel})`}
          >
            <FlipHorizontal aria-hidden="true" />
            ক্যামেরা বদলান
            <span className="sr-only">({cameraLabel})</span>
          </Button>
        ) : null}

        <label className="inline-flex">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={disabled}
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-4 text-sm font-semibold shadow-xs hover:bg-accent">
            <Upload aria-hidden="true" className="size-4" />
            ছবি আপলোড করুন
          </span>
        </label>
      </div>
    </div>
  );
}
