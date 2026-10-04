import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";
import "./portal.css";
import "@/lib/ui/theme/tokens.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Noto Sans Bengali — the best Bangla font for government websites.
 * - Full Unicode coverage for all Bengali characters
 * - Highly readable at all sizes
 * - Standard font used by many official Bangladesh govt websites
 * - Excellent rendering on all devices
 */
const notoSansBengali = Noto_Sans_Bengali({
  variable: "--font-noto-bengali",
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DLAS · ডিজিটাল লিগ্যাল এইড সিস্টেম",
  description: "ডিজিটাল লিগ্যাল এইড সিস্টেম • Digital Legal Aid System",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="bn"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansBengali.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
