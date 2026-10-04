"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useVoiceSession } from "@/hooks/use-voice-session";
import { ROLE_LABELS } from "@/lib/auth/roles";

const VERIFICATION_LABELS = {
  verified: "যাচাইকৃত",
  pending: "যাচাই প্রক্রিয়াধীন",
  unverified: "যাচাই বাকি",
} as const;

export default function ProfilePage() {
  const router = useRouter();
  const { currentUser } = useVoiceSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      if (response.ok) {
        router.push("/");
        router.refresh();
        return;
      }
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/" className="text-sm font-semibold text-emerald-700 hover:underline">
              ← হোম পেজে ফিরে যান
            </Link>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">আমার প্রোফাইল</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              অ্যাকাউন্ট সক্রিয়
            </span>
            {currentUser ? (
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoggingOut ? "লগআউট হচ্ছে..." : "লগআউট"}
              </button>
            ) : null}
          </div>
        </div>

        {currentUser ? (
          <section className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-800">
                {currentUser.displayName.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold text-slate-950">{currentUser.displayName}</h2>
                <p className="mt-1 text-sm text-slate-600">{ROLE_LABELS[currentUser.role]}</p>
              </div>
            </div>
            <dl className="mt-7 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">ভূমিকা</dt>
                <dd className="mt-1 font-semibold text-slate-900">{ROLE_LABELS[currentUser.role]}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">যাচাইয়ের অবস্থা</dt>
                <dd className="mt-1 font-semibold text-slate-900">{VERIFICATION_LABELS[currentUser.verificationStatus]}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">ব্যবহারকারী আইডি</dt>
                <dd className="mt-1 break-all font-mono text-sm text-slate-700">{currentUser.id}</dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
               <Link href="/citizen" className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800">
                 সাইটেন কেস ড্যাশবোর্ড
               </Link>
               <Link href="/citizen/sms" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
                 সিমুলেটেড এসএমএস ইনবক্স
               </Link>
               <Link href="/" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">

                হোমে ফিরুন
              </Link>
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 sm:p-7">
            এখনও কোনো অ্যাকাউন্ট সেশন পাওয়া যায়নি। ভয়েস ইনটেক সম্পন্ন করলে নাগরিক প্রোফাইল স্বয়ংক্রিয়ভাবে তৈরি হবে।
            <Link href="/login" className="mt-4 inline-flex rounded-xl bg-amber-700 px-4 py-2.5 font-semibold text-white hover:bg-amber-800">
              লগইন / রেজিস্টার
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
