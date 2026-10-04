/**
 * The five citizen scenarios from the prototype brief (Part A).
 *
 * These are **mandatory, not alternatives**. The brief is explicit: the prototype must
 * show how the *same* architecture resolves each person's specific barrier. Shared
 * components may be reused, but each person's problem has to be visibly resolved — so
 * every persona carries its own situation, its own unmet requirement, and the evidence
 * a reviewer should be able to see after logging in as them.
 *
 * This module is the ONE definition of that cast. It is pure and dependency-free so it
 * can be imported by the login picker, the citizen dashboard, the API route that
 * issues the session, and the seed migration. If a persona's numbers live in two
 * places they will drift, and a drifting demo is worse than no demo.
 *
 * The three-column shape below (situation / must solve / minimum evidence) is the
 * brief's own vocabulary, not ours. Branch on `id` and `seed.*`, never on prose.
 */

export type PersonaId = "moyuri" | "ripon" | "nabila" | "nuching" | "malek";

/** A case lifecycle value, kept in sync with `CASE_STATUSES` in lib/case/domain.ts. */
export type PersonaStage = "submitted" | "review" | "mediation" | "lawyer" | "court" | "settled" | "unresolved";

/**
 * Everything needed to make one click produce a meaningful dashboard.
 *
 * The ids are stable and shared with `migrations/0030_citizen_persona_demo.sql`. They
 * are fixed strings, never generated, because the seed and the route must converge on
 * the same row rather than racing to create two.
 */
export interface PersonaSeed {
  /** `users.id` — stable, so a re-run is an upsert and not a duplicate account. */
  userId: string;
  /** Login phone. Not a real number and never dialled: the one-click path skips the PIN. */
  phone: string;
  /** Four-digit voice PIN, so a reviewer can also walk the *real* login form. */
  pin: string;
  /** `cases.id`. */
  caseId: string;
  /** `cases.voice_session_id` — UNIQUE, so it doubles as the idempotency key. */
  voiceSessionId: string;
  docketId: string;
  applicationId: string;
  problem: string;
  category: string;
  district: string;
  gender: "male" | "female" | "other";
  hasDisability: 0 | 1;
  disabilityType: string | null;
  /** Source language of the applicant's own words, which is not always Bangla. */
  sourceLanguage: "bn" | "marma" | "chakma";
  stage: PersonaStage;
  /** `cases.status` — the portal-facing status. Deliberately NOT the same as `stage`. */
  status: string;
  urgency: "normal" | "urgent" | "emergency_danger";
  priority: "normal" | "high" | "urgent";
  severityLevel: "standard" | "high" | "emergency" | null;
  severityCategory: string | null;
  /** Days since the case was filed. Drives the SLA story (A5 is the stagnant one). */
  ageDays: number;
  sensitive: 0 | 1;
}

export interface Persona {
  id: PersonaId;
  /** The brief's own numbering, shown on the card so a reviewer can match the spec. */
  code: "A1" | "A2" | "A3" | "A4" | "A5";
  nameEn: string;
  nameBn: string;
  /** Short line under the name: who this person *is* in the system. */
  roleEn: string;
  roleBn: string;
  districtEn: string;
  districtBn: string;
  /** The brief's column 1. */
  situationEn: string;
  situationBn: string;
  /** The brief's column 2 — what the system has to solve, not solve. */
  mustSolveEn: string[];
  mustSolveBn: string[];
  /** The brief's column 3 — what a reviewer must be able to see to believe it. */
  evidenceEn: string[];
  evidenceBn: string[];
  /** Short chips: the barrier in one glance. */
  barriers: { en: string; bn: string }[];
  seed: PersonaSeed;
}

export const PERSONAS: Persona[] = [
  {
    id: "moyuri",
    code: "A1",
    nameEn: "Moyuri Akter",
    nameBn: "মোয়ূরী আক্তার",
    roleEn: "Survivor reporting through a proxy",
    roleBn: "প্রতিনিধির মাধ্যমে জানানো অভিযোগ",
    districtEn: "Joypurhat",
    districtBn: "জয়পুরহাট",
    situationEn:
      "Her husband controls the smartphone; the button phone in the house is checked; her NID is inaccessible; her brother Ripon called 16699 and the office has not heard her own account.",
    situationBn:
      "স্বামীর নিয়ন্ত্রণে থাকেন; বাড়ির বাটন ফোন দেখা হয়; তাঁর এনআইডি কাগজপত্র পাওয়া যায় না; ভাই রিপন ১৬৬৯৯ নম্বরে কল করেছেন, অফিস তাঁর নিজের বক্তব্য পায়নি।",
    mustSolveEn: [
      "Unsafe contact",
      "Incomplete identity",
      "Second-hand information",
    ],
    mustSolveBn: ["অনিরাপদ যোগাযোগ", "অসম্পূর্ণ পরিচয়", "দ্বিতীয়-হাত তথ্য"],
    evidenceEn: [
      "Her application progresses safely; Ripon's report is distinct from Moyuri's own account",
      "Safe channel / number / time rules are enforced",
      "Moyuri can get an order without ever taking a call on the unsafe number",
      "Failure test: an unsafe contact never receives a message",
    ],
    evidenceBn: [
      "তাঁর আবেদন নিরাপদে এগিয়ে যায়; রিপনের রিপোর্ট মোয়ূরীর নিজের সাক্ষাৎকরণ থেকে আলাদা থাকে",
      "সেফ চ্যানেল/সংখ্যা/সময়ের নিয়ম কার্যকর থাকে",
      "অনিরাপদ নম্বরে তিনি কখনও কল না পেয়েও তালাক বা অধিকার জারি পান",
      "অতীত পরীক্ষা: ঝুঁকিপূর্ণ নম্বরে কোনো বার্তা পৌঁছায় না",
    ],
    barriers: [
      { en: "Unsafe contact", bn: "অনিরাপদ যোগাযোগ" },
      { en: "No NID", bn: "এনআইডি নেই" },
      { en: "Reported by proxy", bn: "প্রতিনিধির মাধ্যমে" },
    ],
    seed: {
      userId: "DEMO-CIT-A1",
      phone: "01911000101",
      pin: "1001",
      caseId: "DEMO-CASE-A1",
      voiceSessionId: "VS-DEMO-A1",
      docketId: "DLAS-2025-JYP-0141",
      applicationId: "APP-DEMO-A1",
      problem:
        "আমার স্বামী আমাকে নিয়মিত মারধর করেন এবং বাড়ি থেকে বের করে দিয়েছেন। আমি একটি নিরাপদ জায়গায় আছি। আমার পরিচয়পত্র এখন আমার কাছে নেই।",
      category: "family",
      district: "জয়পুরহাট",
      gender: "female",
      hasDisability: 0,
      disabilityType: null,
      sourceLanguage: "bn",
      stage: "review",
      status: "submitted",
      urgency: "emergency_danger",
      priority: "urgent",
      severityLevel: "emergency",
      severityCategory: "safety",
      ageDays: 12,
      sensitive: 1,
    },
  },

  {
    id: "ripon",
    code: "A2",
    nameEn: "Ripon",
    nameBn: "রিপন",
    roleEn: "Authorised representative (visually impaired)",
    roleBn: "অনুমোদিত প্রতিনিধি (দৃষ্টিহীন)",
    districtEn: "Moyuri's district",
    districtBn: "মোয়ূরীর জেলা",
    situationEn:
      "Ripon is blind and can use calls and voice, but cannot independently use visual forms, PDF, CAPTCHA or a visual OTP.",
    situationBn:
      "রিপন দৃষ্টিহীন; তিনি কল ও ভয়েস ব্যবহার করতে পারেন, কিন্তু ভিজ্যুয়াল ফর্ম, পিডিএফ, ক্যাপচা বা ভিজ্যুয়াল ওটিপি নিজে ব্যবহার করতে পারেন না।",
    mustSolveEn: ["Blind access", "Authority", "Non-visual status"],
    mustSolveBn: ["ব্লাইন্ড অ্যাক্সেস", "প্রতিনিধিত্বের ক্ষমতা", "ভিজ্যুয়াল-মুক্ত অবস্থা"],
    evidenceEn: [
      "Ripon completes one meaningful Bangla task independently",
      "Scope of authority is visible; the record shows what Moyuri has and has not confirmed",
      "Accessibility test: complete without a sighted helper",
    ],
    evidenceBn: [
      "রিপন একটি অর্থবহ বাংলা কাজ স্বাধীনভাবে সম্পন্ন করেন",
      "অনুমতির পরিধি দৃশ্যমান; নথিতে মোয়ূরী কী কী নিশ্চিত করেছেন আর কী করেননি তা আলাদা",
      "অ্যাক্সেসিবিলিটি পরীক্ষা: দৃষ্টিসম্পন্দ কোনো সহায়ক ছাড়াই সম্পূর্ণ",
    ],
    barriers: [
      { en: "Blind", bn: "দৃষ্টিহীন" },
      { en: "No CAPTCHA/visual OTP", bn: "ক্যাপচা/ভিজ্যুয়াল ওটিপি নেই" },
      { en: "Acts for another", bn: "অন্যের পক্ষে কাজ" },
    ],
    seed: {
      userId: "DEMO-CIT-A2",
      phone: "01911000102",
      pin: "1002",
      caseId: "DEMO-CASE-A2",
      voiceSessionId: "VS-DEMO-A2",
      docketId: "DLAS-2025-JYP-0142",
      applicationId: "APP-DEMO-A2",
      problem:
        "আমি দৃষ্টিহীন। আমার পিতার রেখে যাওয়া জমি নিয়ে ভাই আমাকে ঠকাতে চাইছেন। ফরম বা পিডিএফ আমি পড়তে পারি না, তাই ভয়েস ও কলের মাধ্যমে আবেদন করতে চাই।",
      category: "land",
      district: "জয়পুরহাট",
      gender: "male",
      hasDisability: 1,
      disabilityType: "দৃষ্টিহীন",
      sourceLanguage: "bn",
      stage: "submitted",
      status: "submitted",
      urgency: "normal",
      priority: "normal",
      severityLevel: "standard",
      severityCategory: null,
      ageDays: 4,
      sensitive: 0,
    },
  },

  {
    id: "nabila",
    code: "A3",
    nameEn: "Nabila",
    nameBn: "নাবিলা",
    roleEn: "Defamation / image abuse victim",
    roleBn: "ভয়েজর মর্যাদাহানির শিকার",
    districtEn: "Jhenaidah",
    districtBn: "ঝিনাইদহ",
    situationEn:
      "A former classmate is using fake and altered images and sending them with threats; some responses need another competent authority.",
    situationBn:
      "একজন পুরোনো সহপাঠী ভুয়া ও পরিবর্তিত ছবি ছড়িয়ে দিচ্ছেন এবং ভয় দেখাচ্ছেন; কিছু প্রতিক্রিয়ার জন্য অন্য সংশ্লিষ্ট কর্তৃপক্ষ প্রয়োজন।",
    mustSolveEn: ["Urgency", "Highly sensitive evidence", "Role-restricted access", "Referral"],
    mustSolveBn: ["জরুরি", "অত্যন্ত সংবেদনশীল প্রমাণ", "ভূমিকাভিত্তিক প্রবেশাধিকার", "রেফারেল"],
    evidenceEn: [
      "Urgency is surfaced for human review",
      "Sensitive material is restricted; referral includes the question, documents, acknowledgement, deadline and escalation",
      "Failure test: receiving authority does not acknowledge",
    ],
    evidenceBn: [
      "জরুরিতা মানব পর্যালোচনার জন্য সামনে আসে",
      "সংবেদনশীল উপকরণ সীমিত থাকে; রেফারেলে প্রশ্ন/ডকুমেন্ট/স্বীকৃতি, সময়সীমা ও এসকেলেশন অন্তর্ভুক্ত",
      "অতীত পরীক্ষা: অনুমতিপ্রাপ্ত কর্তৃপক্ষ স্বীকৃতি দেয় না",
    ],
    barriers: [
      { en: "Emergency", bn: "জরুরি" },
      { en: "Sensitive evidence", bn: "সংবেদনশীল প্রমাণ" },
      { en: "Needs referral", bn: "রেফারেল প্রয়োজন" },
    ],
    seed: {
      userId: "DEMO-CIT-A3",
      phone: "01911000103",
      pin: "1003",
      caseId: "DEMO-CASE-A3",
      voiceSessionId: "VS-DEMO-A3",
      docketId: "DLAS-2025-JHI-0088",
      applicationId: "APP-DEMO-A3",
      problem:
        "আমার একজন পুরোনো সহপাঠী আমার ছবি বদলে সাজিয়ে অশ্লীল মেসেজ পাঠাচ্ছেন এবং ভয় দিচ্ছেন। আমার ফোন নম্বর ও ছবি অন্যদের কাছে ছড়িয়ে দেওয়া হচ্ছে। আমি খুব ভয় পাচ্ছি।",
      category: "cyber_crime",
      district: "ঝিনাইদহ",
      gender: "female",
      hasDisability: 0,
      disabilityType: null,
      sourceLanguage: "bn",
      stage: "submitted",
      status: "submitted",
      urgency: "emergency_danger",
      priority: "urgent",
      severityLevel: "emergency",
      severityCategory: "safety",
      ageDays: 2,
      sensitive: 1,
    },
  },

  {
    id: "nuching",
    code: "A4",
    nameEn: "Nuching Marma",
    nameBn: "নুচিং মারমা",
    roleEn: "Indigenous-language applicant, low connectivity",
    roleBn: "আদিবাসিক ভাষায় আবেদনকারী, দুর্বল যোগাযোগ",
    districtEn: "Khagrachhari",
    districtBn: "খাগড়াছড়ি",
    situationEn:
      "Nuching cannot read, speaks Marma and limited Bangla; a UDC entrepreneur types and photographs for her; she has no number of her own and connectivity is unreliable.",
    situationBn:
      "নুচিং পড়তে পারেন না; তিনি মারমা বলেন ও সীমিত বাংলা জানেন; একজন ইউডিসি উদ্যোক্তা তাঁর হয়ে টাইপ করেন ও ছবি তোলেন; তাঁর নিজের নম্বর নেই এবং সংযোগ অনির্ভরযোগ্য।",
    mustSolveEn: [
      "Assisted access",
      "Translation / provenance",
      "Document quality",
      "Offline resilience",
    ],
    mustSolveBn: ["সহায়তাকারী প্রবেশ", "অনুবাদ ও প্রমাণ", "নথির মান", "অফলাইন সহনশীলতা"],
    evidenceEn: [
      "The record distinguishes what Nuching said from what was translated and typed",
      "Assistance and consent are recorded; UDC access is bounded; document problems are visible; work survives network loss",
      "Failure test: the network drops halfway through submission",
    ],
    evidenceBn: [
      "রেকর্ডে নুচিং কী বলেছেন আর কী অনুবাদ/টাইপ করা হয়েছে তা আলাদা",
      "সহায়তা ও সতর্কতা রেকর্ড করা; ইউডিসির প্রবেশ সীমিত; নথির সমস্যা দৃশ্যমান; কাজ নেটওয়ার্ক লপ ছাড়াই সারভাইভ করে",
      "অতীত পরীক্ষা: সাবমিশনের মাঝপথে নেটওয়ার্ক পড়ে যায়",
    ],
    barriers: [
      { en: "Cannot read", bn: "পড়তে পারেন না" },
      { en: "Speaks Marma", bn: "মারমা ভাষা" },
      { en: "No own number", bn: "নিজের নম্বর নেই" },
    ],
    seed: {
      userId: "DEMO-CIT-A4",
      phone: "01911000104",
      pin: "1004",
      caseId: "DEMO-CASE-A4",
      voiceSessionId: "VS-DEMO-A4",
      docketId: "DLAS-2025-KHG-0231",
      applicationId: "APP-DEMO-A4",
      problem:
        "আমার বাসার জমি আমার মা উইল্ট করে গেছেন। আমার ভাই আমাকে জমি থেকে বের করার চেষ্টা করছেন। আমি পড়তে পারি না, মারমায় কথা বলি।",
      category: "land",
      district: "খাগড়াছড়ি",
      gender: "female",
      // Deliberately 0. "Cannot read" is a real access barrier but it is not the
      // disability field, and over-claiming it here would misrepresent the applicant.
      // The literacy barrier is carried as a case_facts row with provenance instead.
      hasDisability: 0,
      disabilityType: null,
      sourceLanguage: "marma",
      stage: "review",
      status: "submitted",
      urgency: "normal",
      priority: "high",
      severityLevel: "high",
      severityCategory: "vulnerability",
      ageDays: 9,
      sensitive: 0,
    },
  },

  {
    id: "malek",
    code: "A5",
    nameEn: "Abdul Malek",
    nameBn: "আব্দুল মালেক",
    roleEn: "Stagnant case, unstable contact",
    roleBn: "স্থিতিহীন মামলা, অস্থির যোগাযোগ",
    districtEn: "Barguna",
    districtBn: "বরগুনা",
    situationEn:
      "His case is seven months old; the papers live at the shop's phone; travel costs wages; panel-lawyer updates are missing.",
    situationBn:
      "তাঁর মামলা সাত মাসের পুরোনো; নথি দোকানের ফোনে থাকে; যাতায়াতের খরচ মজুরি; প্যানেল আইনির কোনো আপডেট নেই।",
    mustSolveEn: [
      "Long-running case",
      "Unstable contact",
      "Low bandwidth",
      "Lawyer accountability",
    ],
    mustSolveBn: ["দীর্ঘমেয়াদি মামলা", "অস্থির যোগাযোগ", "কম ব্যান্ডউইথ", "আইনি দায়বদ্ধতা"],
    evidenceEn: [
      "Status and next step without a smartphone or reading",
      "Failed contact attempts are logged, overdue lawyer updates surface before he travels",
      "Failure test: the panel lawyer misses an update",
    ],
    evidenceBn: [
      "স্মার্টফোন বা পড়ার কাজ ছাড়াই অবস্থা ও পরবর্তী ধাপ",
      "ব্যর্থ যোগাযোগের চেষ্টা লগড হয়; যাতায়াতের আগেই বিলম্বিত আইনি আপডেট সামনে আসে",
      "অতীত পরীক্ষা: প্যানেল আইনি একটি আপডেট বাদ পড়ে",
    ],
    barriers: [
      { en: "No smartphone", bn: "স্মার্টফোন নেই" },
      { en: "7 months stale", bn: "৭ মাস আটকে" },
      { en: "Lawyer inactive", bn: "আইনি নিষ্ক্রিয়" },
    ],
    seed: {
      userId: "DEMO-CIT-A5",
      phone: "01911000105",
      pin: "1005",
      caseId: "DEMO-CASE-A5",
      voiceSessionId: "VS-DEMO-A5",
      // The docket the softphone demo scenario already uses for Barguna, so the
      // voice walkthrough and this dashboard refer to the same case.
      docketId: "DLAS-2025-0992",
      applicationId: "APP-DEMO-A5",
      problem:
        "দোকান থেকে ভাড়ায় দেওয়া টাকা পাওনা যায়নি। আমি সাত মাস ধরে মামলা করেছি, কিন্তু কোনো খবর পাইনি। দোকানের ফোনে নথি থাকে, ঘুরে আসতে মজুরি লাগে।",
      category: "labour",
      district: "বরগুনা",
      gender: "male",
      hasDisability: 0,
      disabilityType: null,
      sourceLanguage: "bn",
      stage: "lawyer",
      status: "under_review",
      urgency: "normal",
      priority: "normal",
      severityLevel: "standard",
      severityCategory: null,
      ageDays: 213,
      sensitive: 0,
    },
  },
];

const PERSONA_BY_ID = new Map<string, Persona>(PERSONAS.map((persona) => [persona.id, persona]));

export function getPersona(id: string | null | undefined): Persona | null {
  if (!id) return null;
  return PERSONA_BY_ID.get(id) ?? null;
}

/**
 * Which persona is this session?
 *
 * Matched on the seeded `users.id` rather than on a session flag, because the session
 * is created by the server and there is nowhere to put a persona id that would survive
 * being carried across a login. The ids are fixed strings in this same file, so the
 * mapping cannot drift from the seed.
 *
 * Returns null for a real applicant, which is what the dashboard uses to decide whether
 * to show the demo banner at all. A real citizen must never see "you are scenario A1".
 */
export function personaForUserId(userId: string | null | undefined): Persona | null {
  if (!userId) return null;
  const match = PERSONAS.find((persona) => persona.seed.userId === userId);
  return match ?? null;
}

export function isPersonaId(value: unknown): value is PersonaId {
  return typeof value === "string" && PERSONA_BY_ID.has(value);
}

/**
 * How the login panel groups the cast.
 *
 * A1 and A2 are deliberately ONE entry, not two. Moyuri is the survivor and Ripon is the
 * brother who calls on her behalf — but the brief spends two rows on them because they
 * are one situation, and offering them as two independent login buttons invites a judge to
 * read them as two unrelated demos. The brief is explicit that the personas are MANDATORY
 * and not alternatives; merging the pair is the same idea applied to the UI.
 *
 * A group with a `startUrl` NAVIGATES rather than logging in, because that is what the
 * pair actually is: a scripted call to watch. A group without one logs in as its single
 * persona, which is the right affordance for a case that has a dashboard of its own.
 *
 * This lives beside the personas rather than in the component, so the login panel, the
 * simulation picker and the spec page cannot disagree about who is grouped with whom.
 */
export interface DemoGroup {
  id: string;
  labelBn: string;
  labelEn: string;
  personas: PersonaId[];
  /** Present means: open the simulation instead of signing in. */
  startUrl?: string;
  /** The one line that says what pressing it does. */
  hintBn: string;
}

export const DEMO_GROUPS: DemoGroup[] = [
  {
    id: "moyuri-ripon",
    labelBn: "মোয়ূরী ও রিপন",
    labelEn: "Moyuri & Ripon",
    personas: ["moyuri", "ripon"],
    startUrl: "/demo/simulation?scenario=moyuri-ripon",
    hintBn: "ভাই প্রতিনিধি হয়ে কল — সিমুলেশন দেখুন",
  },
  {
    id: "nabila",
    labelBn: "নাবিলা",
    labelEn: "Nabila",
    personas: ["nabila"],
    startUrl: "/demo/simulation?scenario=nabila",
    hintBn: "ভুয়া ছবি ও জরুরি শ্রেণি — সিমুলেশন",
  },
  {
    id: "nuching",
    labelBn: "নুচিং মারমা",
    labelEn: "Nuching Marma",
    personas: ["nuching"],
    startUrl: "/demo/simulation?scenario=nuching",
    hintBn: "মারমা ভাষা ও সহায়তাকারী — সিমুলেশন",
  },
  {
    id: "malek",
    labelBn: "আব্দুল মালেক",
    labelEn: "Abdul Malek",
    personas: ["malek"],
    startUrl: "/demo/simulation?scenario=malek",
    hintBn: "সাত মাসের নিষ্ক্রিয় মামলা — সিমুলেশন",
  },
];
