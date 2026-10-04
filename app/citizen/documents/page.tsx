"use client";

import { CitizenShell } from "@/lib/ui/shell/CitizenShell";
import { EmptyState } from "@/lib/ui/components/EmptyState";
import { Button } from "@/lib/ui/components/Button";

export default function CitizenDocuments() {
  return (
    <CitizenShell>
      <div style={{ marginBottom: "var(--space-2xl)" }}>
        <h1 style={{ fontFamily: "var(--font-bn)", fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-xs)" }}>
          প্রয়োজনীয় কাগজপত্র
        </h1>
        <p style={{ fontFamily: "var(--font-bn)", fontSize: "1rem", color: "var(--portal-text-secondary)" }}>
          আপনার আবেদনের স্বপক্ষে প্রয়োজনীয় কাগজপত্র এখানে জমা দিন।
        </p>
      </div>

      <div style={{ backgroundColor: "var(--portal-bg-subtle)", padding: "var(--space-xl)", borderRadius: "var(--radius-lg)", border: "2px dashed var(--portal-border)", textAlign: "center", marginBottom: "var(--space-xl)" }}>
        <div style={{ fontSize: "2rem", marginBottom: "var(--space-sm)" }}>📄</div>
        <h3 style={{ fontFamily: "var(--font-bn)", fontSize: "1.125rem", fontWeight: 600, color: "var(--portal-text)", marginBottom: "var(--space-xs)" }}>নতুন ডকুমেন্ট আপলোড করুন</h3>
        <p style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", color: "var(--portal-text-secondary)", marginBottom: "var(--space-lg)" }}>
          জাতীয় পরিচয়পত্র, এফআইআর কপি, অথবা অন্যান্য প্রমাণপত্র আপলোড করুন। (সর্বোচ্চ ৫ মেগাবাইট)
        </p>
        <Button variant="secondary" onClick={() => alert("Hackathon Demo: Document upload is simulated.")}>
          ফাইল নির্বাচন করুন
        </Button>
      </div>

      <h2 style={{ fontFamily: "var(--font-bn)", fontSize: "1.25rem", fontWeight: 700, color: "var(--portal-text)", marginBottom: "var(--space-lg)" }}>
        জমা দেওয়া কাগজপত্র
      </h2>
      
      <EmptyState 
        title="কোনো কাগজপত্র নেই" 
        description="আপনি এখনো কোনো কাগজপত্র জমা দেননি।" 
      />
    </CitizenShell>
  );
}
