"use client";

import { type ReactNode } from "react";
import { SoftphoneModal } from "@/components/softphone-modal";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { useCaseDocket } from "@/hooks/use-case-docket";
import { useState } from "react";

/**
 * Floating action button that embeds the SoftphoneModal.
 * This can be dropped into any portal shell without changing the global `page.tsx` state.
 */
export function AgentFab() {
  const [isSoftphoneOpen, setIsSoftphoneOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

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

  const handleOpenSoftphone = async () => {
    setIsSoftphoneOpen(true);
    if (!isCallActive && phase === "idle") {
      setIsConnecting(true);
      try {
        await start();
      } catch (err) {
        console.error("Auto-start call error:", err);
      } finally {
        setIsConnecting(false);
      }
    }
  };

  return (
    <>
      <button
        onClick={handleOpenSoftphone}
        style={{
          position: "fixed",
          bottom: "var(--space-xl)",
          right: "var(--space-xl)",
          zIndex: 40,
          display: "flex",
          alignItems: "center",
          gap: "var(--space-sm)",
          padding: "var(--space-md) var(--space-xl)",
          backgroundColor: isCallActive ? "#10b981" : "var(--portal-accent)",
          color: "var(--portal-text-on-accent)",
          fontFamily: "var(--font-bn)",
          fontWeight: 700,
          fontSize: "1rem",
          borderRadius: "var(--radius-full)",
          boxShadow: "var(--shadow-lg)",
          border: "none",
          cursor: "pointer",
          transition: "transform var(--transition-fast), background var(--transition-normal)",
          transform: isSoftphoneOpen ? "scale(0) opacity-0" : "scale(1) opacity-100",
        }}
        aria-label="১৬৬৯৯ কল করুন"
      >
        <span style={{ fontSize: "1.25rem" }}>{isCallActive ? "🎙️" : "📞"}</span>
        {isCallActive ? "কল চলছে..." : "সাহায্য চান? ১৬৬৯৯"}
      </button>

      <SoftphoneModal
        isOpen={isSoftphoneOpen}
        onClose={() => setIsSoftphoneOpen(false)}
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
    </>
  );
}
