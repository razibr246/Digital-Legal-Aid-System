"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CitizenShell } from "@/lib/ui/shell/CitizenShell";
import { Card, CardContent } from "@/lib/ui/components/Card";
import { Button } from "@/lib/ui/components/Button";
import { clearSimulatedSms, getSimulatedSms, type SimulatedSms } from "@/lib/sms/inbox";

export default function SmsInboxPage() {
  const [messages, setMessages] = useState<SimulatedSms[]>([]);

  useEffect(() => {
    setMessages(getSimulatedSms());
  }, []);

  return (
    <CitizenShell>
      <div style={{ marginBottom: "var(--space-xl)" }}>
        <Link href="/citizen" style={{ fontFamily: "var(--font-bn)", fontSize: "0.875rem", fontWeight: 600, color: "var(--portal-accent)", textDecoration: "none" }}>
          ← ড্যাশবোর্ডে ফিরে যান
        </Link>
        <h1 style={{ fontFamily: "var(--font-bn)", fontSize: "1.75rem", fontWeight: 700, color: "var(--portal-text)", margin: "var(--space-sm) 0 var(--space-xs)" }}>
          সিমুলেটেড এসএমএস ইনবক্স
        </h1>
        <p style={{ fontFamily: "var(--font-bn)", color: "var(--portal-text-secondary)" }}>
          আপনার ভয়েস লগইন পিন যে নম্বরে পাঠানো হয়েছে, সেটি এখানে দেখা যাবে।
        </p>
      </div>

      {messages.length === 0 ? (
        <Card>
          <CardContent style={{ fontFamily: "var(--font-bn)", color: "var(--portal-text-secondary)" }}>
            এখনও কোনো সিমুলেটেড এসএমএস নেই। ভয়েস ইনটেক সম্পন্ন করলে আপনার পিন এখানে দেখা যাবে।
          </CardContent>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={() => { clearSimulatedSms(); setMessages([]); }}>ইনবক্স খালি করুন</Button>
          </div>
          {messages.map((message) => (
            <Card key={message.id}>
              <CardContent>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", marginBottom: "var(--space-sm)" }}>
                  <strong style={{ fontFamily: "var(--font-bn)", color: "var(--portal-text)" }}>১৬৬৯৯ ভয়েস লগইন</strong>
                  <time style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--portal-text-secondary)" }}>{new Date(message.createdAt).toLocaleString("bn-BD")}</time>
                </div>
                <p style={{ fontFamily: "var(--font-bn)", color: "var(--portal-text)", lineHeight: 1.7, margin: 0 }}>{message.message}</p>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--portal-text-secondary)", marginTop: "var(--space-sm)" }}>প্রাপ্তি নম্বর: {message.to}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </CitizenShell>
  );
}
