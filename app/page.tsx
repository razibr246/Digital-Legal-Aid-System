"use client";

import { useEffect, useState } from "react";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { useCaseDocket } from "@/hooks/use-case-docket";
import { PortalView } from "@/components/portal-view";
import { SoftphoneModal } from "@/components/softphone-modal";
import { UniversalChatWidget } from "@/components/chat/universal-chat-widget";

export default function Home() {
  const [isSoftphoneOpen, setIsSoftphoneOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  /**
   * Why the call could not start, in plain Bangla, shown in the softphone.
   *
   * This exists because the failure was silent. `start()` could throw -- most often
   * because the browser denied the microphone -- and the error went to `console.error`,
   * which nobody in a demonstration can see. The modal opened, the button did nothing,
   * and the agent looked broken while the server and Soniox were both perfectly fine.
   * A demo that fails must say why, on screen, in the user's language.
   */
  const [callError, setCallError] = useState<string | null>(null);

  const {
     phase,
     sessionId,
     currentUser,
     activeTool,

    intakeStep,
    intakeData,
    transcript,
    interimText,
    metrics,
    start,
    sendMessage,
    stop,
  } = useVoiceSession();

  const docket = useCaseDocket(sessionId);

  const isCallActive =
    phase === "listening" ||
    phase === "speaking" ||
    phase === "dtmf_wait" ||
    phase === "starting" ||
    isConnecting;

  // Track call duration in seconds
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    let resetTimer: NodeJS.Timeout | null = null;
    if (isCallActive) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      resetTimer = setTimeout(() => setCallDuration(0), 0);
    }
    return () => {
      if (timer) clearInterval(timer);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [isCallActive]);

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  /**
   * Checks the microphone *before* dialling, so a blocked mic is a sentence rather than a
   * dead button. Every branch here used to be discovered live, on stage.
   */
  const preflightMic = async (): Promise<string | null> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return "এই ব্রাউজারে মাইক্রোফোন পাওয়া যাচ্ছে না। ক্রোম বা এডজ ব্যবহার করুন।";
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      return "মাইক্রোফোন কেবল নিরাপদ (https) সাইটে কাজ করে।";
    }
    try {
      // A real stream, released immediately. Asking is the only way to learn the truth:
      // a permission that was previously blocked is not visible to any API until asked.
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of probe.getTracks()) track.stop();
      return null;
    } catch (err) {
      const name = (err as { name?: string })?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        return "মাইক্রোফোনের অনুমতি পাওয়া যায়নি। ব্রাউজারের ঠিকানা বারের লক আইকনে গিয়ে মাইক্রোফোন ON করুন, তারপর আবার চাপুন।";
      }
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        return "কোনো মাইক্রোফোন পাওয়া যায়নি। মাইক্রোফোন লাগিয়ে আবার চাপুন।";
      }
      if (name === "NotReadableError") {
        return "মাইক্রোফোনটি অন্য অ্যাপ ব্যবহার করছে। অন্য অ্যাপ বন্ধ করে আবার চাপুন।";
      }
      return "মাইক্রোফোন চালু করা যায়নি। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।";
    }
  };

  const handleOpenSoftphone = async () => {
    setIsSoftphoneOpen(true);
    if (!isCallActive && phase === "idle") {
      setCallError(null);
      setIsConnecting(true);
      try {
        // Preflight first. Dialling with no microphone produces a call that connects,
        // greets the caller, and then cannot hear a word -- the worst possible failure to
        // debug live, because everything looks like it is working.
        const blocked = await preflightMic();
        if (blocked) {
          setCallError(blocked);
          return;
        }
        await start();
        setCallError(null);
      } catch (err) {
        console.error("Auto-start call error:", err);
        setCallError(
          "কল শুরু করা যায়নি। নেটওয়ার্ক পরীক্ষা করে আবার চাপুন। বিস্তারিত ব্রাউজার কনসোলে আছে।",
        );
      } finally {
        setIsConnecting(false);
      }
    }
  };

  return (
    <>
      {/* 1. Main Official Government Portal View */}
      <PortalView
         onOpenSoftphone={handleOpenSoftphone}
         isCallActive={isCallActive}
         currentUser={currentUser}

      />

      {/* 2. Softphone Simulator Popup Modal */}
      <SoftphoneModal
        isOpen={isSoftphoneOpen}
        onClose={() => { setIsSoftphoneOpen(false); setCallError(null); }}
        callError={callError}
        phase={phase}
         sessionId={sessionId}
         currentUser={currentUser}
         activeTool={activeTool}

        intakeStep={intakeStep}
        intakeData={intakeData}
        transcript={transcript}
        interimText={interimText}
        metrics={metrics}
        docket={docket}
        start={start}
        sendMessage={sendMessage}
        stop={stop}
        isConnecting={isConnecting}
        setIsConnecting={setIsConnecting}
      />

      {/* 3. Floating Persistent Active Call Mini-Pill (When Call is Active & Modal is Minimized) */}
      {isCallActive && !isSoftphoneOpen && (
        <div className="active-call-pill">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-bold text-xs tracking-wide text-emerald-300">
              ১৬৬৯৯ কল চলছে ({formatDuration(callDuration)})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSoftphoneOpen(true)}
              className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-full text-xs font-semibold cursor-pointer transition"
            >
              উইন্ডো খুলুন ↗
            </button>
            <button
              onClick={() => {
                stop();
                setIsConnecting(false);
              }}
              className="px-3 py-1 bg-rose-700 hover:bg-rose-600 text-white rounded-full text-xs font-semibold cursor-pointer transition"
            >
              কেটে দিন ✕
            </button>
          </div>
        </div>
      )}

      {/* Universal assistant for visitors. Stacked above the 16699 call button. */}
      <UniversalChatWidget />
    </>
  );
}