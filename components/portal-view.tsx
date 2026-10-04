"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { type SessionUser } from "@/lib/auth/roles";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ApplyWizard, type ApplyWizardResult } from "@/components/apply-wizard";
import { Menu } from "lucide-react";

type Language = "bn" | "en";
type ModalKind = "nlaso" | "recruit" | "notice" | "apply" | null;
type NoticeCategory = "all" | "recruitment" | "order" | "mediation" | "general";

type Notice = {
  id: string;
  date: string;
  category: Exclude<NoticeCategory, "all">;
  categoryLabel: string;
  title: string;
  meta: string;
  body: string;
};

type DistrictOffice = {
  name: string;
  english: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
};

const NOTICES: Notice[] = [
  {
    id: "pl26",
    date: "২২.০৯.২৬",
    category: "recruitment",
    categoryLabel: "নিয়োগ",
    title: "প্যানেল আইনজীবী অন্তর্ভুক্তি বিজ্ঞপ্তি ২০২৬",
    meta: "আবেদনের শেষ তারিখ: ১৫ অক্টোবর ২০২৬ · বার কাউন্সিল সনদধারী আইনজীবী",
    body: "জেলা লিগ্যাল এইড কমিটিগুলোতে বার কাউন্সিল সনদধারী যোগ্য আইনজীবীদের জন্য প্যানেল সদস্য হিসেবে আবেদন আহ্বান করা হয়েছে। আবেদনের বিস্তারিত নির্দেশিকা পেলে জানা যাবে।",
  },
  {
    id: "udc26",
    date: "২০.০৯.২৬",
    category: "recruitment",
    categoryLabel: "নিয়োগ",
    title: "UDC ভিত্তিক লিগ্যাল এইড প্যারালেগাল তালিকাভুক্তি",
    meta: "ইউনিয়ন পর্যায়ে কমিউনিটি প্যারালেগাল",
    body: "ইউনিয়ন ডিজিটাল সেন্টারে সেবার্থী নাগরিকদের জন্য কমিউনিটি প্যারালেগাল তালিকাভুক্তির নির্দেশিকা প্রকাশিত হয়েছে।",
  },
  {
    id: "dlas",
    date: "১৮.০৯.২৬",
    category: "order",
    categoryLabel: "পরিপত্র",
    title: "ডিজিটাল লিগ্যাল এইড সিস্টেম (DLAS) পাইলট চালুকরণ পরিপত্র",
    meta: "পাইলট জেলা: বরগুনা, জয়পুরহাট, নেত্রকোনা, রাজবাড়ী",
    body: "ডিজিটাল লিগ্যাল এইড সিস্টেমের পাইলট কার্যক্রম পরিপত্রটি প্রকাশিত হয়েছে। ভয়েস, অনলাইন এবং সহায়তা কেন্দ্রের মাধ্যমে একই কেস রেকর্ড ব্যবহারের লক্ষ্য রাখা হয়েছে।",
  },
  {
    id: "adr",
    date: "১০.০৯.২৬",
    category: "mediation",
    categoryLabel: "ADR",
    title: "মামলাপূর্ব বাধ্যতামূলক মধ্যস্থতা কার্যপ্রণালী",
    meta: "দেওয়ানি ও পারিবারিক মোকদ্দমার ক্ষেত্রে প্রযোজ্য",
    body: "আদালতের বাইরে নিরপেক্ষ মধ্যস্থতার মাধ্যমে বিরোধী পক্ষের মধ্যে সমঝোতা করার নির্দেশিকা।",
  },
  {
    id: "fraud",
    date: "৩০.০৮.২৬",
    category: "general",
    categoryLabel: "সতর্কতা",
    title: "লিগ্যাল এইড সেবায় প্রতারক চক্র সম্পর্কে সতর্কীকরণ",
    meta: "সরকারি আইনি সহায়তা সম্পূর্ণ বিনামূল্যে",
    body: "সরকারি আইনি সহায়তা সম্পূর্ণ বিনামূল্যে। অর্থ বা ব্যক্তিগত তথ্যের বিনিময়ে কেউ টাকা চাইলে সরাসরি ১৬৬৯৯-এ অভিযোগ করুন।",
  },
];

const DISTRICT_OFFICES: DistrictOffice[] = [
  { name: "জয়পুরহাট", english: "Joypurhat", address: "জয়পুরহাট সদর", phone: "0581-66001", lat: 25.807, lng: 89.629 },
  { name: "বরগুনা", english: "Barguna", address: "বরগুনা সদর", phone: "0946-55001", lat: 22.701, lng: 90.534 },
  { name: "রাজবাড়ী", english: "Rajbari", address: "রাজবাড়ী সদর", phone: "01712-22001", lat: 23.744, lng: 89.569 },
  { name: "নেত্রকোনা", english: "Netrokona", address: "নেত্রকোনা সদর", phone: "0948-22001", lat: 24.871, lng: 90.727 },
  { name: "ঢাকা", english: "Dhaka", address: "ঢাকা জেলা জজ আদালত ভবন", phone: "02-9661000", lat: 23.81, lng: 90.412 },
  { name: "চট্টগ্রাম", english: "Chattogram", address: "চট্টগ্রাম জেলা জজ আদালত ভবন", phone: "031-2500000", lat: 22.356, lng: 91.783 },
  { name: "রাজশাহী", english: "Rajshahi", address: "রাজশাহী সদর", phone: "0721-770001", lat: 24.374, lng: 88.604 },
  { name: "খুলনা", english: "Khulna", address: "খুলনা সদর", phone: "041-760001", lat: 22.846, lng: 89.54 },
  { name: "সিলেট", english: "Sylhet", address: "সিলেট সদর", phone: "0821-710001", lat: 24.894, lng: 91.868 },
  { name: "বরিশাল", english: "Barishal", address: "বরিশাল সদর", phone: "0431-220001", lat: 22.701, lng: 90.353 },
  { name: "রংপুর", english: "Rangpur", address: "রংপুর সদর", phone: "0521-65001", lat: 25.744, lng: 89.2 },
  { name: "ময়মনসিংহ", english: "Mymensingh", address: "ময়মনসিংহ সদর", phone: "091-65001", lat: 24.747, lng: 90.407 },
];

const FAQS = [
  ["এই সেবা কি সত্যিই বিনামূল্যে?", "হ্যাঁ। আবেদন, আইনি পরামর্শ, মধ্যস্থতা ও প্যানেল আইনজীবী নিয়োগের সম্পূর্ণ খরচ সরকার বহন করে। কেউ অর্থ দাবি করলে ১৬৬৯৯-এ অভিযোগ করুন।"],
  ["কারা সরকারি খরচে আইনি সহায়তা পান?", "অসচ্ছল নাগরিক, বিধবা বা স্বামী নিগৃহীতা নারী, সহিংসতার শিকার নারী ও শিশু, শারীরিক প্রতিবন্ধী, প্রবীণ ও দরিদ্র ব্যক্তিরা অগ্রাধিকার পান।"],
  ["NID বা কাগজপত্র ছাড়া কি আবেদন করা যায়?", "অবশ্যই। কাগজপত্রের অভাব প্রাথমিক আবেদনের বাধা নয়। পরবর্তীতে স্থানীয়ভাবে পরিচয় যাচাই করা হয়।"],
  ["মামলাপূর্ব মধ্যস্থতা কী?", "আদালতের বাইরে উভয় পক্ষকে নিয়ে নিরপেক্ষ সমঝোতা। অনেক ক্ষেত্রে এটি আদালতে মামলার চেয়ে দ্রুত ও সাশ্রয়ী।"],
  ["পারিবারিক সহিংসতায় নিরাপত্তা কীভাবে নিশ্চিত হয়?", "সংবেদনশীল কেসে বাদীর নির্ধারিত নিরাপদ সময়ে যোগাযোগ করা হয়। অনুমতি ছাড়া কোনো বহির্গামী যোগাযোগ করা হয় না।"],
  ["প্যানেল আইনজীবী হিসেবে কীভাবে আবেদন করবেন?", "বার কাউন্সিলের সনদপ্রাপ্ত আইনজীবীরা জেলা লিগ্যাল এইড কমিটির বার্ষিক বিজ্ঞপ্তি অনুযায়ী আবেদন করতে পারেন।"],
];

const EN_FAQS = [
  ["Is this service really free?", "Yes. The government bears the full cost of applications, legal advice, mediation, and panel lawyer appointment. Report any demand for money to 16699."],
  ["Who qualifies for government-funded legal aid?", "Financially disadvantaged citizens, widows or women confined by husbands, women and children affected by violence, persons with disabilities, elderly people, and poor households receive priority."],
  ["Can I apply without an NID or documents?", "Yes. Missing documents do not block an initial application. Identity verification is completed locally at a later stage."],
  ["What is pre-litigation mediation?", "It is a neutral settlement between both parties outside court. In many cases, it is faster and more affordable than litigation."],
  ["How is safety protected in domestic violence cases?", "Contact is made only during the survivor's designated safe window. No outgoing contact is made without permission."],
  ["How can a lawyer apply to the panel?", "Bar Council-certified lawyers may apply according to the annual notice of the district legal aid committee."],
];

const EN_NOTICES: Record<string, { date: string; categoryLabel: string; title: string; meta: string; body: string }> = {
  pl26: { date: "22.09.26", categoryLabel: "Recruitment", title: "Panel Lawyer Inclusion Notice 2026", meta: "Deadline: 15 October 2026 · Bar Council-certified lawyers", body: "Applications are invited from eligible Bar Council-certified lawyers for panel membership in district legal aid committees." },
  udc26: { date: "20.09.26", categoryLabel: "Recruitment", title: "UDC Legal Aid Paralegal Registration", meta: "Community paralegal at union level", body: "Guidelines for registering community paralegals to support citizens at Union Digital Centers have been published." },
  dlas: { date: "18.09.26", categoryLabel: "Circular", title: "Digital Legal Aid System Pilot Launch Circular", meta: "Pilot districts: Barguna, Joypurhat, Netrokona, Rajbari", body: "The pilot circular for the Digital Legal Aid System has been published to support one shared case record across voice, online, and assisted channels." },
  adr: { date: "10.09.26", categoryLabel: "ADR", title: "Pre-litigation Mediation Procedure", meta: "Applicable to civil and family disputes", body: "Guidelines for resolving disputes through neutral mediation outside court." },
  fraud: { date: "30.08.26", categoryLabel: "Advisory", title: "Warning About Fraud in Legal Aid Services", meta: "Government legal aid is completely free", body: "Government legal aid is completely free. Report anyone demanding money or personal information directly to 16699." },
};

interface PortalViewProps {
  onOpenSoftphone: () => void;
  isCallActive: boolean;
  currentUser: SessionUser | null;
}

function distanceBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const radius = 6371;
  const latDelta = ((bLat - aLat) * Math.PI) / 180;
  const lngDelta = ((bLng - aLng) * Math.PI) / 180;
  const value = Math.sin(latDelta / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(lngDelta / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

const MOBILE_NAV_ITEMS = [
  { key: "home", href: "#home", label: "মূল পাতা" },
  { key: "notices", href: "#notices", label: "নোটিশ বোর্ড" },
  { key: "doors", href: "#doors", label: "প্রবেশদ্বার" },
  { key: "offices", href: "#offices", label: "জেলা অফিস" },
  { key: "faq", href: "#faq", label: "প্রশ্নোত্তর" },
  { key: "udc", href: "#doors", label: "UDC" },
  { key: "track", href: "#track", label: "কেস ট্র্যাকিং", highlight: true },
];

export function PortalView({ onOpenSoftphone, isCallActive, currentUser }: PortalViewProps) {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("bn");
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [readableLines, setReadableLines] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [highlightLinks, setHighlightLinks] = useState(false);
  const isEnglish = language === "en";
  const t = (bangla: string, english: string) => (isEnglish ? english : bangla);
  const [fontScale, setFontScale] = useState(100);
  const [noticeFilter, setNoticeFilter] = useState<NoticeCategory>("all");
  const [modal, setModal] = useState<ModalKind>(null);
  const [activeNotice, setActiveNotice] = useState<Notice | null>(null);
  const [districtQuery, setDistrictQuery] = useState("");
  const [officeMessage, setOfficeMessage] = useState("জেলার নাম লিখে অফিস খুঁজুন।");
  const [officeResults, setOfficeResults] = useState<DistrictOffice[]>(DISTRICT_OFFICES.slice(0, 6));
  const [toast, setToast] = useState("");
  const [applicationSent, setApplicationSent] = useState(false);
  const [applicationReceipt, setApplicationReceipt] = useState<ApplyWizardResult | null>(null);

  useEffect(() => {
    document.documentElement.lang = isEnglish ? "en" : "bn";
  }, [isEnglish]);

  useEffect(() => {
    if (!accessibilityOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccessibilityOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [accessibilityOpen]);

  const isCitizen = currentUser?.role === "citizen";
  const accountHref = currentUser ? "/profile" : "/login?tab=citizen";
  const visibleNotices = useMemo(() => noticeFilter === "all" ? NOTICES : NOTICES.filter((notice) => notice.category === noticeFilter), [noticeFilter]);
  const getNoticeText = (notice: Notice) => isEnglish ? EN_NOTICES[notice.id] : notice;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };

  const openNotice = (notice: Notice) => {
    setActiveNotice(notice);
    setModal("notice");
  };

  const searchOffices = () => {
    const query = districtQuery.trim().toLowerCase();
    const results = query
      ? DISTRICT_OFFICES.filter((office) => `${office.name} ${office.english}`.toLowerCase().includes(query))
      : DISTRICT_OFFICES.slice(0, 6);
    setOfficeResults(results);
    setOfficeMessage(results.length ? t(`${results.length}টি অফিস পাওয়া গেছে।`, `${results.length} office(s) found.`) : t("কোনো অফিস পাওয়া যায়নি। অন্য নাম লিখে দেখুন।", "No office found. Try another name."));
  };

  const findNearbyOffice = () => {
    if (!navigator.geolocation) {
      setOfficeMessage(t("এই ব্রাউজারে লোকেশন সুবিধা নেই। জেলার নাম লিখে খুঁজুন।", "Location is unavailable in this browser. Search by district name instead."));
      return;
    }
    setOfficeMessage(t("আপনার লোকেশন খোঁজা হচ্ছে...", "Finding your location..."));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nearby = DISTRICT_OFFICES.map((office) => ({ ...office, distance: distanceBetween(position.coords.latitude, position.coords.longitude, office.lat, office.lng) }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 4);
        setOfficeResults(nearby);
        setOfficeMessage(t("আপনার কাছাকাছি অফিসগুলো দেখানো হয়েছে।", "Nearby offices are shown below."));
      },
      () => setOfficeMessage(t("লোকেশন অনুমতি পাওয়া যায়নি। জেলার নাম লিখে খুঁজুন।", "Location permission was denied. Search by district name instead.")),
      { timeout: 8000 },
    );
  };

  const submitTrack = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get("track-id") || "").trim();
    if (!id) return;
    if (!currentUser) {
      router.push("/login?tab=citizen");
      return;
    }
    router.push(isCitizen ? `/citizen/track?id=${encodeURIComponent(id)}` : "/");
  };

  // The API route sets the session cookie, so the citizen is already signed in by
  // the time this runs; the receipt is only shown so the docket and voice PIN,
  // which would otherwise arrive by SMS, are not lost.
  const handleApplicationDone = (result: ApplyWizardResult) => {
    setApplicationReceipt(result);
    setApplicationSent(true);
    // The receipt carries the docket and the voice PIN, so it is left on screen for a
    // beat rather than replaced instantly. After that the applicant is moved to their
    // dashboard, where the DLAO callback opens on its own — the brief is that the call
    // follows the application immediately, and leaving a manual "continue" click in
    // between meant the consultation never actually started by itself.
    window.setTimeout(() => {
      setModal(null);
      router.push("/citizen");
    }, 4500);
  };

  const goToCitizenDashboard = () => {
    setModal(null);
    router.push("/citizen");
  };

  const modalRef = useRef<HTMLDivElement | null>(null);
  const a11yPanelRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const closeModal = () => {
    setModal(null);
    setActiveNotice(null);
    setApplicationSent(false);
    setApplicationReceipt(null);
  };

  // Dialog accessibility: move focus in, trap Tab, close on Escape, restore focus.
  useEffect(() => {
    if (!modal) return;
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    const node = modalRef.current;
    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.offsetParent !== null);

    focusables()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      lastFocusedRef.current?.focus?.();
    };
  }, [modal]);

  // The accessibility panel is a dialog too: send focus to it when opened.
  useEffect(() => {
    if (accessibilityOpen) a11yPanelRef.current?.focus();
  }, [accessibilityOpen]);

  return (
    <div className={`portal-root ref-root ${highContrast ? "ref-high-contrast" : ""} ${readableLines ? "ref-readable-lines" : ""} ${focusMode ? "ref-focus-mode" : ""} ${highlightLinks ? "ref-highlight-links" : ""}`} style={{ "--ref-font-scale": fontScale / 100 } as React.CSSProperties}>
      <a className="ref-skip-link" href="#ref-main">{t("মূল বিষয়বস্তুতে যান", "Skip to main content")}</a>
      <div className="ref-gov-bar">
        <div className="ref-container">
          <span>{t("গণপ্রজাতন্ত্রী বাংলাদেশ সরকার · আইন ও বিচার বিভাগ", "Government of the People’s Republic of Bangladesh · Ministry of Law and Justice")}</span>
          <div className="ref-gov-actions">
            <div className="ref-language-switch" role="group" aria-label={t("ভাষা নির্বাচন", "Choose language")}>
              <button type="button" className={!isEnglish ? "is-active" : ""} onClick={() => { setLanguage("bn"); setOfficeMessage("জেলার নাম লিখে অফিস খুঁজুন।"); }}>বাংলা</button>
              <button type="button" className={isEnglish ? "is-active" : ""} onClick={() => { setLanguage("en"); setOfficeMessage("Enter a district name to find an office."); }}>EN</button>
            </div>
            <button type="button" className="ref-accessibility-trigger" aria-expanded={accessibilityOpen} aria-controls="ref-accessibility-panel" aria-label={t("অ্যাক্সেসিবিলিটি", "Accessibility options")} onClick={() => setAccessibilityOpen((value) => !value)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4" r="2" /><path d="M5 8h14M12 7v6m0 0-4 8m4-8 4 8" /></svg></button>
          </div>
        </div>
      </div>

      {accessibilityOpen ? <div id="ref-accessibility-panel" className="ref-accessibility-panel" role="dialog" aria-labelledby="ref-accessibility-title" ref={a11yPanelRef} tabIndex={-1}><div className="ref-accessibility-head"><h2 id="ref-accessibility-title">{t("অ্যাক্সেসিবিলিটি", "Accessibility")}</h2><button type="button" onClick={() => setAccessibilityOpen(false)} aria-label={t("বন্ধ করুন", "Close")}>✕</button></div><div className="ref-accessibility-list"><div className="ref-accessibility-row"><span>◐ {t("উচ্চ কনট্রাস্ট", "High contrast")}</span><button type="button" className={`ref-accessibility-toggle ${highContrast ? "is-on" : ""}`} aria-pressed={highContrast} onClick={() => setHighContrast((value) => !value)}>{highContrast ? t("চালু", "On") : t("বন্ধ", "Off")}</button></div><div className="ref-accessibility-row"><span>Aa {t("লেখার আকার", "Text size")}</span><div className="ref-accessibility-stepper"><button type="button" onClick={() => setFontScale((value) => Math.max(80, value - 10))} aria-label={t("লেখা ছোট করুন", "Decrease text size")}>−</button><strong>{fontScale}%</strong><button type="button" onClick={() => setFontScale((value) => Math.min(130, value + 10))} aria-label={t("লেখা বড় করুন", "Increase text size")}>+</button></div></div><div className="ref-accessibility-row"><span>↕ {t("লাইন উচ্চতা", "Readable line height")}</span><button type="button" className={`ref-accessibility-toggle ${readableLines ? "is-on" : ""}`} aria-pressed={readableLines} onClick={() => setReadableLines((value) => !value)}>{readableLines ? t("চালু", "On") : t("বন্ধ", "Off")}</button></div><div className="ref-accessibility-row"><span>⌖ {t("ফোকাস মোড", "Focus mode")}</span><button type="button" className={`ref-accessibility-toggle ${focusMode ? "is-on" : ""}`} aria-pressed={focusMode} onClick={() => setFocusMode((value) => !value)}>{focusMode ? t("চালু", "On") : t("বন্ধ", "Off")}</button></div><div className="ref-accessibility-row"><span>🔗 {t("লিংক হাইলাইট", "Highlight links")}</span><button type="button" className={`ref-accessibility-toggle ${highlightLinks ? "is-on" : ""}`} aria-pressed={highlightLinks} onClick={() => setHighlightLinks((value) => !value)}>{highlightLinks ? t("চালু", "On") : t("বন্ধ", "Off")}</button></div></div><button type="button" className="ref-accessibility-reset" onClick={() => { setHighContrast(false); setReadableLines(false); setFocusMode(false); setHighlightLinks(false); setFontScale(100); }}>{t("সব রিসেট করুন", "Reset all settings")}</button></div> : null}

      <header className="ref-site-header">
        <div className="ref-container ref-header-inner">
          <div className="ref-site-id">
            <Image className="ref-logo-mark" src="/assets/logo/logo-mark-reference.png" alt="" width={58} height={58} />
            <div>
              <h1>DLAS</h1>
              <p>{t("ডিজিটাল লিগ্যাল এইড সিস্টেম", "Digital Legal Aid System")}</p>
            </div>
          </div>
          <div className="ref-header-helpline">
            <div>{t("টোল-ফ্রি হেল্পলাইন (২৪/৭)", "Toll-free helpline (24/7)")}</div>
            <button type="button" onClick={onOpenSoftphone}>১৬৬৯৯</button>
            <span>{t("জরুরি সেবা: ৯৯৯", "Emergency service: 999")}</span>
          </div>
          <div className="ref-header-account">
            {currentUser ? (
              <>
                <Link href={accountHref}>{currentUser.displayName}</Link>
                {isCitizen ? <Link href="/citizen/sms">{t("SMS ইনবক্স", "SMS inbox")}</Link> : null}
              </>
            ) : (
              <Link href="/login?tab=citizen">{t("লগইন", "Login")}</Link>
            )}
          </div>
        </div>
      </header>

      <nav className="ref-main-nav" aria-label="প্রধান নেভিগেশন">
        <div className="ref-container ref-nav-inner">
          {/* Mobile: shadcn Sheet owns the disclosure behaviour. */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                className="ref-mobile-toggle min-h-11 gap-2 border-white/45 bg-white/10 font-bold text-white hover:bg-white/20 hover:text-white"
              >
                <Menu aria-hidden="true" />
                <span>{t("মেনু", "Menu")}</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="top"
              className="max-h-[calc(100dvh-3rem)] gap-0 border-0 bg-white p-0 shadow-xl"
              aria-label={t("প্রধান নেভিগেশন", "Main navigation")}
            >
              <SheetTitle className="sr-only">{t("প্রধান নেভিগেশন", "Main navigation")}</SheetTitle>
              <ul className="ref-nav-list is-open">
                {MOBILE_NAV_ITEMS.map((item) => (
                  <li key={item.key} className={item.highlight ? "ref-nav-highlight" : undefined}>
                    <SheetClose asChild>
                    <a href={item.href}>
                      {item.key === "home" ? t("মূল পাতা", "Home")
                        : item.key === "notices" ? t("নোটিশ বোর্ড", "Notice board")
                        : item.key === "doors" ? t("প্রবেশদ্বার", "Access channels")
                        : item.key === "offices" ? t("জেলা অফিস", "District office")
                        : item.key === "faq" ? t("প্রশ্নোত্তর", "FAQ")
                        : item.key === "track" ? t("কেস ট্র্যাকিং", "Case tracking")
                        : item.label}
                    </a>
                    </SheetClose>
                  </li>
                ))}
                <li className="ref-nav-dropdown">
                  <details>
                    <summary>{t("সংস্থার পটভূমি", "About the organisation")} ▾</summary>
                    <div>
                      <button type="button" onClick={() => setModal("nlaso")}>{t("আইনগত সহায়তা আইন, ২০০০", "Legal Aid Services Act, 2000")}</button>
                      <button type="button" onClick={() => setModal("nlaso")}>{t("৬৪ জেলা কমিটি", "64 district committees")}</button>
                    </div>
                  </details>
                </li>
                <li className="ref-nav-dropdown">
                  <details>
                    <summary>{t("নিয়োগ বিজ্ঞপ্তি", "Recruitment notices")} ▾</summary>
                    <div>
                      <button type="button" onClick={() => { setNoticeFilter("recruitment"); document.getElementById("notices")?.scrollIntoView({ behavior: "smooth" }); }}>{t("প্যানেল আইনজীবী অন্তর্ভুক্তি", "Panel lawyer inclusion")}</button>
                      <button type="button" onClick={() => { setNoticeFilter("recruitment"); document.getElementById("notices")?.scrollIntoView({ behavior: "smooth" }); }}>UDC Paralegal</button>
                      <button type="button" onClick={() => setModal("recruit")}>{t("আবেদন নির্দেশিকা", "Application guidelines")}</button>
                    </div>
                  </details>
                </li>
              </ul>
            </SheetContent>
          </Sheet>

          {/* Desktop: the reference nav row, hidden on mobile by CSS. */}
          <ul className="ref-nav-list">
            <li><a href="#home">{t("মূল পাতা", "Home")}</a></li>
            <li className="ref-nav-dropdown"><details><summary>NLASO ▾</summary><div><Link href="#home" onClick={() => setModal("nlaso")}>{t("সংস্থার পটভূমি", "About the organisation")}</Link><button type="button" onClick={() => setModal("nlaso")}>{t("আইনগত সহায়তা আইন, ২০০০", "Legal Aid Services Act, 2000")}</button><button type="button" onClick={() => setModal("nlaso")}>{t("৬৪ জেলা কমিটি", "64 district committees")}</button></div></details></li>
            <li className="ref-nav-dropdown"><details><summary>{t("নিয়োগ বিজ্ঞপ্তি", "Recruitment notices")} ▾</summary><div><button type="button" onClick={() => { setNoticeFilter("recruitment"); document.getElementById("notices")?.scrollIntoView({ behavior: "smooth" }); }}>{t("প্যানেল আইনজীবী অন্তর্ভুক্তি", "Panel lawyer inclusion")}</button><button type="button" onClick={() => { setNoticeFilter("recruitment"); document.getElementById("notices")?.scrollIntoView({ behavior: "smooth" }); }}>UDC Paralegal</button><button type="button" onClick={() => setModal("recruit")}>{t("আবেদন নির্দেশিকা", "Application guidelines")}</button></div></details></li>
            <li><a href="#notices">{t("নোটিশ বোর্ড", "Notice board")}</a></li>
            <li><a href="#doors">{t("প্রবেশদ্বার", "Access channels")}</a></li>
            <li><a href="#offices">{t("জেলা অফিস", "District office")}</a></li>
            <li><a href="#faq">{t("প্রশ্নোত্তর", "FAQ")}</a></li>
            <li><a href="#doors">UDC</a></li>
            <li><a href="#track" className="ref-nav-highlight">{t("কেস ট্র্যাকিং", "Case tracking")}</a></li>
            {isCitizen ? <li><Link href="/citizen/sms">{t("SMS ইনবক্স", "SMS inbox")}</Link></li> : null}
          </ul>
        </div>
      </nav>

      <main id="ref-main" tabIndex={-1}>
        <section className="ref-hero" id="home">
          <div className="ref-container ref-hero-grid">
            <div>
              <h2>{t("আপনার অধিকার রক্ষায় রাষ্ট্র আপনার পাশে — সম্পূর্ণ বিনামূল্যে", "The state is by your side to protect your rights — completely free")}</h2>
              <p>{t("আর্থিকভাবে অসচ্ছল, অসহায় কিংবা নির্যাতনের শিকার নাগরিকদের জন্য সরকার দিচ্ছে বিনামূল্যে মামলা পরিচালনা, আইনজীবী নিয়োগ ও বিরোধ নিষ্পত্তির সেবা।", "The government provides free case management, lawyer appointment, and dispute resolution for financially disadvantaged, vulnerable, or violence-affected citizens.")}</p>
              <div className="ref-hero-actions">
                <button type="button" className="ref-btn ref-btn-white" onClick={() => setModal("apply")}>{t("নতুন আবেদন করুন", "Start a new application")}</button>
                <a href="#track" className="ref-btn ref-btn-outline-white">{t("মামলার অগ্রগতি", "Track a case")}</a>
                <button type="button" className="ref-btn ref-btn-outline-white" onClick={onOpenSoftphone}>{t("১৬৬৯৯ কল করুন", "Call 16699")}</button>
              </div>
              <p className="ref-hero-safety">{t("গোপনীয়তার নিশ্চয়তা — সংবেদনশীল অভিযোগে বাদীর অনুমতি ছাড়া কোনো বহির্গামী যোগাযোগ করা হয় না।", "Privacy assured — no outgoing contact is made for sensitive complaints without the complainant’s permission.")}</p>
            </div>
            <div className="ref-tracker-card" id="track">
              <h3>{t("আবেদন ট্র্যাক করুন", "Track an application")}</h3>
              <p>{t("Application ID বা Case ID দিয়ে অগ্রগতি দেখুন", "Use an Application ID or Case ID to see progress")}</p>
              <form onSubmit={submitTrack}>
                <label htmlFor="ref-track-id">{t("ট্র্যাকিং আইডি", "Tracking ID")}</label>
                <input id="ref-track-id" name="track-id" placeholder={t("যেমন: DLAS-2026-00417", "Example: DLAS-2026-00417")} required />
                <label htmlFor="ref-track-pin">{t("৪ ডিজিট PIN", "4-digit PIN")}</label>
                <input id="ref-track-pin" name="track-pin" type="password" inputMode="numeric" placeholder="PIN" required />
                <button type="submit" className="ref-btn ref-btn-green">{t("অনুসন্ধান", "Search")}</button>
              </form>
              <small>{t("ভয়েস ইনটেক শেষে আপনার ডকেট আইডি ও PIN এখানে ব্যবহার করুন।", "Use the docket ID and PIN generated after voice intake.")}</small>
            </div>
          </div>
        </section>

        <section className="ref-section ref-notices" id="notices">
          <div className="ref-container">
            <div className="ref-section-head"><div><h2>{t("নোটিশ বোর্ড", "Notice board")}</h2><p>{t("আদেশ, সার্কুলার ও নিয়োগ বিজ্ঞপ্তি", "Orders, circulars, and recruitment notices")}</p></div><a href="https://nlaso.gov.bd" target="_blank" rel="noreferrer">NLASO {t("কেন্দ্রীয় গেজেট", "central gazette")} →</a></div>
            <div className="ref-filters">{(["all", "recruitment", "order", "mediation", "general"] as NoticeCategory[]).map((filter) => <button type="button" key={filter} aria-pressed={noticeFilter === filter} className={noticeFilter === filter ? "is-active" : ""} onClick={() => setNoticeFilter(filter)}>{filter === "all" ? t("সকল", "All") : filter === "recruitment" ? t("নিয়োগ", "Recruitment") : filter === "order" ? t("আদেশ ও পরিপত্র", "Orders and circulars") : filter === "mediation" ? t("মধ্যস্থতা", "Mediation") : t("সাধারণ", "General")}</button>)}</div>
            <div className="ref-notice-layout">
              <div className="ref-table-wrap"><table className="ref-notice-table"><caption className="sr-only">{t("নোটিশ তালিকা", "List of notices")}</caption><thead><tr><th>{t("তারিখ", "Date")}</th><th>{t("বিভাগ", "Category")}</th><th>{t("বিষয়", "Subject")}</th><th>{t("ফাইল", "File")}</th></tr></thead><tbody>{visibleNotices.map((notice) => { const copy = getNoticeText(notice); return <tr key={notice.id}><td>{copy.date}</td><td><span className={`ref-category ref-category-${notice.category}`}>{copy.categoryLabel}</span></td><td><button type="button" className="ref-notice-title" onClick={() => openNotice(notice)}>{copy.title}</button><small>{copy.meta}</small></td><td><button type="button" className="ref-download" onClick={() => showToast(t("নমুনা ডকুমেন্ট ডাউনলোড শুরু হয়েছে।", "Sample document download started."))}>PDF</button></td></tr>; })}</tbody></table></div>
              <aside className="ref-notice-sidebar"><div className="ref-side-box red"><strong>{t("প্যানেল আইনজীবী নিয়োগ ২০২৬", "Panel lawyer recruitment 2026")}</strong><p>{t("৬৪ জেলায় অসহায় মানুষের পক্ষে আদালতে মামলা পরিচালনার জন্য সরকার প্যানেল আইনজীবী নিয়োগ দিচ্ছে।", "The government is recruiting panel lawyers to represent disadvantaged people in courts across 64 districts.")}</p><button type="button" onClick={() => setModal("recruit")}>{t("আবেদন নির্দেশিকা", "Application guidelines")} →</button></div><div className="ref-side-box"><strong>{t("ফরম ও গেজেট", "Forms and gazette")}</strong><button type="button" onClick={() => showToast(t("নমুনা ডকুমেন্ট ডাউনলোড শুরু হয়েছে।", "Sample document download started."))}>{t("আইনি সহায়তা আবেদন ফরম", "Legal aid application form")} <span>PDF</span></button><button type="button" onClick={() => showToast(t("নমুনা ডকুমেন্ট ডাউনলোড শুরু হয়েছে।", "Sample document download started."))}>{t("প্যানেল আইনজীবী আবেদন ফরম", "Panel lawyer application form")} <span>PDF</span></button><button type="button" onClick={() => showToast(t("নমুনা ডকুমেন্ট ডাউনলোড শুরু হয়েছে।", "Sample document download started."))}>{t("আইনগত সহায়তা আইন, ২০০০", "Legal Aid Services Act, 2000")} <span>PDF</span></button></div></aside>
            </div>
          </div>
        </section>

        <section className="ref-section ref-alt" id="doors"><div className="ref-container"><h2 className="ref-title-center">{t("সেবা পাওয়ার মাধ্যম", "Ways to access services")}</h2><p className="ref-desc-center">{t("স্মার্টফোন বা ইন্টারনেট না থাকলেও যেকোনো প্রান্ত থেকে আইনি সহায়তা পাওয়া যায়।", "Legal aid is available from any location, even without a smartphone or internet.")}</p><div className="ref-door-grid"><article><h3>{t("টোল-ফ্রি হেল্পলাইন", "Toll-free helpline")}</h3><p>{t("যেকোনো ফোন থেকে বিনামূল্যে ১৬৬৯৯ ডায়াল করুন। ২৪ ঘণ্টা সেবা।", "Dial 16699 free from any phone. Service is available 24/7.")}</p><button type="button" onClick={onOpenSoftphone}>{t("১৬৬৯৯ কল করুন", "Call 16699")} →</button></article><article><h3>{t("ইউনিয়ন ডিজিটাল সেন্টার", "Union Digital Centre")}</h3><p>{t("নিকটস্থ UDC উদ্যোক্তার কাছে যান। ইন্টারনেট ছাড়াও অফলাইনে আবেদন গৃহীত হয়।", "Visit a nearby UDC entrepreneur. Applications can be received offline.")}</p><a href="#offices">{t("নিকটস্থ কেন্দ্র", "Find a centre")} →</a></article><article><h3>{t("অনলাইন আবেদন", "Online application")}</h3><p>{t("ঘরে বসে মোবাইল বা কম্পিউটারে আবেদনের তথ্য দিন এবং পরিচয় যাচাই করুন।", "Provide application details online and verify your identity.")}</p><button type="button" onClick={() => setModal("apply")}>{t("আবেদন শুরু করুন", "Start application")} →</button></article><article><h3>USSD</h3><p>{isEnglish ? <>From any button phone, dial <strong>*16430#</strong> without internet to check progress.</> : <>যেকোনো বাটন ফোন থেকে ইন্টারনেট ছাড়া <strong>*১৬৪৩০#</strong> ডায়াল করে অগ্রগতি জানুন।</>}</p><span className="ref-static-action">*16430#</span></article></div></div></section>

        <section className="ref-section" id="offices"><div className="ref-container"><h2 className="ref-title-center">{t("জেলা লিগ্যাল এইড অফিস", "District Legal Aid Office")}</h2><p className="ref-desc-center">{t("প্রতিটি জেলায় DLAO কর্মকর্তা নাগরিকদের আইনি সহায়তা ও তথ্য প্রদান করেন।", "DLAO officers provide legal aid and information to citizens in every district.")}</p><div className="ref-finder"><div className="ref-finder-row"><label className="sr-only" htmlFor="ref-district">{t("জেলার নাম", "District name")}</label><input id="ref-district" value={districtQuery} onChange={(event) => { setDistrictQuery(event.target.value); searchOffices(); }} placeholder={t("জেলার নাম লিখুন...", "Enter a district name...")} /><button type="button" className="ref-btn ref-btn-green" onClick={findNearbyOffice}>{t("নিকটস্থ অফিস", "Find nearby office")}</button></div><p role="status" aria-live="polite">{officeMessage}</p><div className="ref-office-grid">{officeResults.map((office) => <article key={office.name}><h3>{isEnglish ? `${office.english} Legal Aid Office` : `${office.name} জেলা অফিস`}</h3><p>{office.address}</p><a href={`tel:${office.phone}`}>{office.phone}</a><a href={`https://www.openstreetmap.org/?mlat=${office.lat}&mlon=${office.lng}#map=12/${office.lat}/${office.lng}`} target="_blank" rel="noreferrer">{t("মানচিত্র", "Map")} →</a></article>)}</div></div></div></section>

        <section className="ref-section ref-alt" id="faq"><div className="ref-container"><h2 className="ref-title-center">{t("সচরাচর জিজ্ঞাসা", "Frequently asked questions")}</h2><p className="ref-desc-center">{t("আইনি সহায়তা প্রক্রিয়া ও যোগ্যতা সম্পর্কে।", "About the legal aid process and eligibility.")}</p><div className="ref-faq-list">{(isEnglish ? EN_FAQS : FAQS).map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}</summary><p>{answer}</p></details>)}</div></div></section>
      </main>

      <footer className="ref-footer"><div className="ref-container"><div className="ref-footer-grid"><div><h3>{t("জেলা লিগ্যাল এইড অফিস", "District Legal Aid Office")}</h3><p>{t("আইন ও বিচার বিভাগের অধীন জাতীয় আইনগত সহায়তা প্রদান সংস্থা (NLASO) কর্তৃক পরিচালিত।", "Operated by the National Legal Aid Services Organisation under the Ministry of Law and Justice.")}</p></div><div><h3>{t("দ্রুত লিংক", "Quick links")}</h3><a href="#notices">{t("নোটিশ বোর্ড", "Notice board")}</a><a href="#doors">{t("প্রবেশদ্বার", "Access channels")}</a><a href="#offices">{t("জেলা অফিস", "District office")}</a><a href="#faq">{t("প্রশ্নোত্তর", "FAQ")}</a></div><div><h3>{t("আইন ও গেজেট", "Laws and gazette")}</h3><a href="https://nlaso.gov.bd" target="_blank" rel="noreferrer">NLASO {t("পোর্টাল", "portal")}</a><a href="https://lawjusticediv.gov.bd" target="_blank" rel="noreferrer">{t("আইন ও বিচার বিভাগ", "Ministry of Law and Justice")}</a></div><div><h3>{t("জরুরি যোগাযোগ", "Emergency contacts")}</h3><p>{t("হেল্পলাইন", "Helpline")}: <strong>১৬৬৯৯</strong></p><p>{t("জরুরি সেবা", "Emergency service")}: <strong>৯৯৯</strong></p><p>{t("নারী ও শিশু নির্যাতন", "Women and children violence")}: <strong>১০৯</strong></p><p>{t("সরকারি তথ্য সেবা", "Government information")}: <strong>৩৩৩</strong></p></div></div><div className="ref-footer-bottom"><span>© ২০২৬ {t("জেলা লিগ্যাল এইড অফিস ও NLASO। সর্বস্বত্ব সংরক্ষিত।", "District Legal Aid Office and NLASO. All rights reserved.")}</span><span>{t("আইন ও বিচার বিভাগ", "Ministry of Law and Justice")} · ADLASB</span></div></div></footer>

      <button type="button" className="ref-floating-call" onClick={onOpenSoftphone} aria-label={t("১৬৬৯৯ ভয়েস কল করুন", "Call 16699 by voice")}><span>{isCallActive ? "●" : "☎"}</span>{isCallActive ? t("কল চলছে", "Call in progress") : t("১৬৬৯৯ কল করুন", "Call 16699")}</button>

      {toast ? <div className="ref-toast" role="status">{toast}</div> : null}

      {modal ? <div className="ref-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}><div className="ref-modal" role="dialog" aria-modal="true" aria-labelledby="ref-modal-title" ref={modalRef}><div className="ref-modal-head"><h2 id="ref-modal-title">{modal === "nlaso" ? t("জাতীয় আইনগত সহায়তা প্রদান সংস্থা", "National Legal Aid Services Organisation") : modal === "recruit" ? t("প্যানেল আইনজীবী নিয়োগ নির্দেশিকা", "Panel lawyer recruitment guidelines") : modal === "notice" ? (isEnglish ? EN_NOTICES[activeNotice?.id || ""]?.title : activeNotice?.title) : t("আইনি সহায়তার আবেদন", "Legal aid application")}</h2><button type="button" onClick={closeModal} aria-label={t("মডাল বন্ধ করুন", "Close dialog")}>✕</button></div><div className="ref-modal-body">{modal === "nlaso" ? <><p>{t("গণপ্রজাতন্ত্রী বাংলাদেশ সরকারের আইন ও বিচার বিভাগের অধীনস্থ বিধিবদ্ধ প্রতিষ্ঠান। “আইনগত সহায়তা প্রদান আইন, ২০০০”-এর মাধ্যমে প্রতিষ্ঠিত।", "A statutory organisation under the Ministry of Law and Justice of the Government of Bangladesh, established under the Legal Aid Services Act, 2000.")}</p><h3>{t("সাংবিধানিক ভিত্তি", "Constitutional basis")}</h3><p>{t("সংবিধানের অনুচ্ছেদ ২৭ ও ৩১ অনুযায়ী আইনের দৃষ্টিতে সকল নাগরিকের সমতা ও আইনের আশ্রয়লাভের অধিকার নিশ্চিত।", "Articles 27 and 31 of the Constitution guarantee equality before the law and equal protection of the law for every citizen.")}</p><h3>{t("মূল সেবা", "Core services")}</h3><ul><li>{t("সরকারি খরচে প্যানেল আইনজীবী নিয়োগ", "Government-funded panel lawyer appointment")}</li><li>{t("বিকল্প বিরোধ নিষ্পত্তি ও মধ্যস্থতা", "Alternative dispute resolution and mediation")}</li><li>{t("২৪/৭ টোল-ফ্রি ১৬৬৯৯ হেল্পলাইন", "24/7 toll-free 16699 helpline")}</li><li>{t("জেলা লিগ্যাল এইড কমিটি পরিচালনা", "District legal aid committee administration")}</li></ul></> : modal === "recruit" ? <><p>{t("জেলা লিগ্যাল এইড কমিটিতে প্রতি বছর নতুন প্যানেল আইনজীবী তালিকাভুক্ত করা হয়।", "New panel lawyers are included in district legal aid committees each year.")}</p><h3>{t("যোগ্যতা", "Eligibility")}</h3><ol><li>{t("বাংলাদেশ বার কাউন্সিলের সনদপ্রাপ্ত আইনজীবী", "A lawyer certified by the Bangladesh Bar Council")}</li><li>{t("সংশ্লিষ্ট জেলা বার অ্যাসোসিয়েশনের সদস্য", "A member of the relevant district bar association")}</li><li>{t("ন্যূনতম তিন বছরের আদালত অভিজ্ঞতা", "At least three years of court experience")}</li></ol><p>{t("আবেদনের শেষ তারিখ: ", "Application deadline: ")}<strong>{t("১৫ অক্টোবর ২০২৬", "15 October 2026")}</strong></p></> : modal === "notice" ? <><p>{(isEnglish ? EN_NOTICES[activeNotice?.id || ""]?.body : activeNotice?.body)}</p><button type="button" className="ref-btn ref-btn-green" onClick={() => showToast("নমুনা ডকুমেন্ট ডাউনলোড শুরু হয়েছে।")}>নমুনা PDF ডাউনলোড</button></> : applicationSent
? <div className="ref-modal-success">
    <strong>{t("আবেদন গ্রহণ করা হয়েছে", "Application received")}</strong>
    <p>{t("আপনি স্বয়ংক্রিয়ভাবে লগইন হয়েছেন। এখন পরিচয় যাচাইয়ের ৩টি ধাপ সম্পন্ন করুন।", "You are signed in. Now complete the 3 identity verification steps.")}</p>
    <p className="ref-modal-receipt">
      <span>{t("ডকেট নম্বর", "Docket")}: <strong>{applicationReceipt?.docketId}</strong></span>
      {applicationReceipt?.voicePin ? <span>{t("১৬৬৯৯ ভয়েস লগইন পিন", "16699 voice login PIN")}: <strong>{applicationReceipt.voicePin}</strong> ({t("৩০ দিন", "30 days")})</span> : null}
    </p>
    <button type="button" className="ref-btn ref-btn-green" onClick={goToCitizenDashboard}>{t("আমার ড্যাশবোর্ডে যান", "Go to my dashboard")}</button>
  </div>
: <ApplyWizard isEnglish={isEnglish} onDone={handleApplicationDone} />}</div></div></div> : null}
    </div>
  );
}
