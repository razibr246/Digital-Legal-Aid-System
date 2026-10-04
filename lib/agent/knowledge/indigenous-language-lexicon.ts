export type IndigenousLanguage = "bn" | "marma" | "chakma";

export type IndigenousLegalIntent =
  | "family_law"
  | "rent_control"
  | "land_partition"
  | "agricultural_preemption"
  | "non_agricultural_preemption"
  | "parental_maintenance"
  | "cheque_dishonour"
  | "dowry"
  | "violence_dowry";

export interface IndigenousTerm {
  term: string;
  variants: string[];
  senses: string[];
  glossEn: string;
  glossBn: string;
}

export interface IndigenousScenario {
  id: string;
  language: Exclude<IndigenousLanguage, "bn">;
  scenarioNumber: number;
  titleBn: string;
  legalIntent: IndigenousLegalIntent;
  legalIntentBn: string;
  legalIntentEn: string;
  statute: string;
  section: string;
  terms: IndigenousTerm[];
  examples: string[];
  reviewStatus: "seed" | "approved";
}

export const INDIGENOUS_SCENARIOS: IndigenousScenario[] = [
  {
    id: "marma-family-law",
    language: "marma",
    scenarioNumber: 1,
    titleBn: "পারিবারিক আদালত আইন, ২০২৩ এর ধারা ৫",
    legalIntent: "family_law",
    legalIntentBn: "বিয়ে, তালাক, দেনমোহর, সন্তানের অভিভাবকত্ব ও পারিবারিক বিরোধ",
    legalIntentEn: "Disputes regarding marriage, divorce, restitution of conjugal rights, dower, and child guardianship.",
    statute: "পারিবারিক আদালত আইন, ২০২৩",
    section: "ধারা ৫",
    terms: [
      { term: "মিয়াং", variants: ["মিয়ং", "ম্যাং"], senses: ["বিবাহিত নারী", "স্ত্রী"], glossEn: "Wife / Woman", glossBn: "স্ত্রী" },
      { term: "মাচাং", variants: [], senses: ["পুরুষ", "স্বামী"], glossEn: "Husband / Man", glossBn: "স্বামী" },
      { term: "খ্রো", variants: ["খ্যং", "খরং", "খ্রোং"], senses: ["তালাক", "বিচ্ছেদ"], glossEn: "Divorce / Separation", glossBn: "তালাক" },
      { term: "ছা", variants: [], senses: ["সন্তান", "শিশু"], glossEn: "Child", glossBn: "সন্তান" },
    ],
    examples: [
      "আমা মিয়াং-মাচাং এর মাঝে অনেকদিন ধরে পারিবারিক বিরোধ চলছে।",
      "স্বামী খ্রো (ডিভোর্স) দিতে চায়, কিন্তু মোহরানা দিচ্ছে না।",
      "ছা (বাচ্চা) এর কাস্টডি নিয়ে পারিবারিক আদালতে মামলা করতে চাই।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "marma-rent-control",
    language: "marma",
    scenarioNumber: 2,
    titleBn: "বাড়ি ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১",
    legalIntent: "rent_control",
    legalIntentBn: "বাড়ি ভাড়া বকেয়া, অবৈধ বাড়ি খালি করা ও অনিয়মিত ভাড়া বৃদ্ধি",
    legalIntentEn: "Conflicts over house rent arrears, eviction without notice, and arbitrary rent increments.",
    statute: "বাড়ি ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১",
    section: "",
    terms: [
      { term: "ইম", variants: ["ইং", "ইম্ম"], senses: ["বাড়ি", "গৃহ"], glossEn: "House / Home", glossBn: "বাড়ি" },
      { term: "ঙা", variants: ["ঙাইং", "ঙাই"], senses: ["ভাড়া", "ধার"], glossEn: "Rent / Borrowing", glossBn: "ভাড়া" },
      { term: "লুই", variants: [], senses: ["উচ্ছেদ", "অপসারণ"], glossEn: "Eviction / Taken away", glossBn: "উচ্ছেদ" },
    ],
    examples: [
      "ভাড়াটিয়া তিন মাস ধরে ইম ঙা (বাড়ি ভাড়া) দিচ্ছে না।",
      "মালিক আমাকে জোর করে ইম থেকে লুই (উচ্ছেদ) করতে চাইছে।",
      "বাড়ি ভাড়া নিয়ন্ত্রণ আইনে ইম ঙা বৃদ্ধির বিরুদ্ধে অভিযোগ আছে।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "marma-land-partition",
    language: "marma",
    scenarioNumber: 3,
    titleBn: "সিভিল জজ আদালতের এখতিয়ারভুক্ত বণ্টন",
    legalIntent: "land_partition",
    legalIntentBn: "উত্তরাধিকার বা ভাগাভাগি করা সম্পত্তির বণ্টন, পরিমাপ ও সীমানা বিরোধ",
    legalIntentEn: "Disagreements over the partition, measurement, and boundary demarcation of inherited or shared property/land.",
    statute: "সিভিল জজ আদালত আইন",
    section: "",
    terms: [
      { term: "ম্রে", variants: ["ম্রাই", "ম্রেয়"], senses: ["জমি", "মাটি"], glossEn: "Land / Earth", glossBn: "জমি" },
      { term: "অং", variants: ["অংহ", "অংশ"], senses: ["অংশ", "ভাগ"], glossEn: "Share / Portion", glossBn: "অংশ" },
      { term: "চাক্", variants: [], senses: ["সীমানা", "সীমান্ত"], glossEn: "Boundary / Border", glossBn: "সীমানা" },
    ],
    examples: [
      "বাবার রেখে যাওয়া ম্রে (জমি) বণ্টন নিয়ে ভাইদের সাথে বিরোধ।",
      "আমার অং (অংশ) আমাকে বুঝিয়ে দিচ্ছে না।",
      "জমির চাক্ (সীমানা) নিয়ে সিভিল জজ আদালতে মামলা চলছে।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "marma-agricultural-preemption",
    language: "marma",
    scenarioNumber: 4,
    titleBn: "State Acquisition & Tenancy Act, 1950 এর ধারা ৯৬",
    legalIntent: "agricultural_preemption",
    legalIntentBn: "কৃষি জমি কেনার আগে অগ্রক্রয় বা অগ্রক্রম অধিকারের বিরোধ",
    legalIntentEn: "Disputes regarding the right of pre-emption (first right of refusal) for agricultural land.",
    statute: "State Acquisition & Tenancy Act, 1950",
    section: "ধারা ৯৬",
    terms: [
      { term: "ম্রে", variants: ["ম্রাই", "ম্রেয়"], senses: ["জমি", "কৃষি জমি"], glossEn: "Land / Earth", glossBn: "জমি" },
      { term: "উয়াই", variants: ["ওয়ে", "ওয়াই"], senses: ["কেনা", "ক্রয়"], glossEn: "Buy / Purchase", glossBn: "কেনা" },
      { term: "লকহ্", variants: ["লোক", "লৌ"], senses: ["কৃষি জমি", "মাঠ"], glossEn: "Agricultural field", glossBn: "কৃষি জমি" },
    ],
    examples: [
      "আমার পাশের ম্রে (জমি) অন্যকে বিক্রি করেছে, আমি অগ্রক্রয় বা উয়াই (কেনার) অধিকার চাই।",
      "কৃষি লকহ্ (জমি) এর অগ্রক্রয় নিয়ে State Acquisition & Tenancy Act এ মামলা করব।",
      "শরিক হিসেবে ম্রে উয়াই করার অগ্রাধিকার আমার আছে।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "marma-non-agricultural-preemption",
    language: "marma",
    scenarioNumber: 5,
    titleBn: "Non-Agricultural Tenancy Act, 1949 এর ধারা ২৪",
    legalIntent: "non_agricultural_preemption",
    legalIntentBn: "অকৃষি বা বাণিজ্যিক জমি কেনার আগে অগ্রক্রয় অধিকারের বিরোধ",
    legalIntentEn: "Disputes regarding the right of pre-emption for non-agricultural or commercial land.",
    statute: "Non-Agricultural Tenancy Act, 1949",
    section: "ধারা ২৪",
    terms: [
      { term: "জাই", variants: ["জেই", "যাই"], senses: ["বাণিজ্যিক জায়গা", "বাজার"], glossEn: "Market / Commercial space", glossBn: "বাণিজ্যিক জায়গা" },
      { term: "ইম-ম্রে", variants: ["ইং-ম্রে", "ইমম্রে"], senses: ["অকৃষি জমি", "বসতভিটা"], glossEn: "Homestead / Non-agricultural land", glossBn: "অকৃষি জমি" },
    ],
    examples: [
      "দোকানের জন্য জাই (বাণিজ্যিক) জমির অগ্রক্রয় অধিকার দাবি করছি।",
      "Non-Agricultural Tenancy Act অনুযায়ী ইম-ম্রে (অকৃষি জমি) উয়াই (কেনার) মামলা করেছি।",
      "আমার ইম-ম্রে এর পাশের জায়গা অন্য কাউকে বিক্রি করা হয়েছে।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "marma-parental-maintenance",
    language: "marma",
    scenarioNumber: 6,
    titleBn: "পিতামাতার ভরণপোষণ আইন, ২০১৩ এর ধারা ৮",
    legalIntent: "parental_maintenance",
    legalIntentBn: "সন্তান কর্তৃক পিতামাতার আর্থিক সহায়তা, খাবার ও শারীরিক যত্ন প্রদান",
    legalIntentEn: "Disputes where children refuse to provide financial support, food, and physical maintenance to their parents.",
    statute: "পিতামাতার ভরণপোষণ আইন, ২০১৩",
    section: "ধারা ৮",
    terms: [
      { term: "আফা", variants: ["আবা", "ফা"], senses: ["পিতা", "বাবা"], glossEn: "Father", glossBn: "পিতা" },
      { term: "আমা", variants: [], senses: ["মাতা", "মা"], glossEn: "Mother", glossBn: "মাতা" },
      { term: "চা", variants: [], senses: ["খাবার", "খাওয়া"], glossEn: "Food / Eat", glossBn: "খাবার" },
      { term: "উংথো", variants: ["উংত", "উনথো"], senses: ["যত্ন", "দেখাশুনা"], glossEn: "Care / Look after", glossBn: "যত্ন" },
    ],
    examples: [
      "ছেলে তার আফা-আমা (পিতা-মাতা) এর ভরণপোষণ দিচ্ছে না।",
      "আমাদের চা (খাবার) এবং চিকিৎসার খরচ দেয় না।",
      "পিতামাতার ভরণপোষণ আইনে উংথো (যত্ন) না করার জন্য অভিযোগ করেছি।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "marma-cheque-dishonour",
    language: "marma",
    scenarioNumber: 7,
    titleBn: "Negotiable Instruments Act, 1881 এর ধারা ১৩৮",
    legalIntent: "cheque_dishonour",
    legalIntentBn: "অপর্যাপ্ত ব্যালেন্স বা অন্য কারণে চেক ফেরত বা ডিসঅনার হওয়ার অভিযোগ",
    legalIntentEn: "Complaints regarding bounced or dishonored cheques due to insufficient funds.",
    statute: "Negotiable Instruments Act, 1881",
    section: "ধারা ১৩৮",
    terms: [
      { term: "ঙোয়ে", variants: ["ঙৈ", "ঙোয়ে"], senses: ["টাকা", "অর্থ"], glossEn: "Money / Taka", glossBn: "টাকা" },
      { term: "লু", variants: [], senses: ["ধার", "পরদায়"], glossEn: "Debt / Borrow", glossBn: "ধার" },
      { term: "পিয়ান", variants: ["প্যান", "পিয়ান"], senses: ["ফেরত", "চেক ডিজঅনার"], glossEn: "Return / Bounce", glossBn: "চেক ফেরত" },
    ],
    examples: [
      "সে আমাকে তিন লক্ষ টাকার চেক দিয়েছিল, কিন্তু ব্যাংকে ঙোয়ে (টাকা) নাই বলে চেক পিয়ান (ডিজঅনার/ফেরত) হয়েছে।",
      "আমার পাওনা ঙোয়ে (টাকা) না দিয়ে সে চেক ডিজঅনার করেছে।",
      "লু (ধার) নেওয়া টাকার চেক বাউন্স হওয়ায় Negotiable Instruments Act এ মামলা করেছি।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "marma-dowry",
    language: "marma",
    scenarioNumber: 8,
    titleBn: "যৌতুক নিরোধ আইন, ২০১৮ এর ধারা ৩ ও ৪ক",
    legalIntent: "dowry",
    legalIntentBn: "বিয়ের সময় বা পরে যৌতুক চাওয়া, দেওয়া বা নেওয়ার অভিযোগ",
    legalIntentEn: "Complaints regarding the demanding, giving, or taking of dowry during or after marriage.",
    statute: "যৌতুক নিরোধ আইন, ২০১৮",
    section: "ধারা ৩ ও ৪ক",
    terms: [
      { term: "লাকঠাপ", variants: ["লাকথাপ", "লাগঠাপ"], senses: ["বিয়ে", "বিবাহ"], glossEn: "Marriage / Wedding", glossBn: "বিয়ে" },
      { term: "তং", variants: ["তংহ", "তউং"], senses: ["দাবি", "চাওয়া"], glossEn: "Demand / Ask for", glossBn: "দাবি" },
      { term: "শোয়ে", variants: ["শ্যৈ", "সোয়ে"], senses: ["স্বর্ণ", "গহনা"], glossEn: "Gold / Jewelry", glossBn: "গহনা" },
    ],
    examples: [
      "লাকঠাপ (বিয়ে) এর সময় তারা অনেক যৌতুক এবং শোয়ে (স্বর্ণ) তং (দাবি) করেছে।",
      "যৌতুক নিরোধ আইন অনুযায়ী ঙোয়ে (টাকা) তং (দাবি) করার জন্য অভিযোগ করেছি।",
      "শ্বশুরবাড়ির লোকজন যৌতুক হিসেবে অনেক কিছু তং (দাবি) করছে।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "marma-violence-dowry",
    language: "marma",
    scenarioNumber: 9,
    titleBn: "নারী ও শিশু নির্যাতন দমন আইন, ২০০০ এর ধারা ১১(গ)",
    legalIntent: "violence_dowry",
    legalIntentBn: "যৌতুকের জন্য নারীর উপর শারীরিক বা মানসিক নির্যাতন ও সহিংসতা",
    legalIntentEn: "Complaints involving physical or mental abuse, torture, or violence inflicted on a woman for dowry demands.",
    statute: "নারী ও শিশু নির্যাতন দমন আইন, ২০০০",
    section: "ধারা ১১(গ)",
    terms: [
      { term: "নাইং", variants: ["নাইন", "নাই"], senses: ["নির্যাতন", "অত্যাচার"], glossEn: "Torture / Oppress", glossBn: "নির্যাতন" },
      { term: "থোয়াইং", variants: ["থোইং", "তোয়াইং"], senses: ["মারা", "মারধর"], glossEn: "Beat / Hit", glossBn: "মারধর" },
      { term: "না", variants: [], senses: ["কষ্ট", "ব্যথা"], glossEn: "Pain / Hurt", glossBn: "কষ্ট" },
    ],
    examples: [
      "যৌতুকের টাকার জন্য স্বামী আমাকে নাইং (নির্যাতন) করেছে।",
      "টাকা না দেওয়ায় সে আমাকে অনেক থোয়াইং (মারধর) করেছে এবং না (কষ্ট) দিয়েছে।",
      "নারী ও শিশু নির্যাতন দমন আইনে যৌতুকের জন্য নাইং (নির্যাতন) এর মামলা করতে চাই।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "chakma-family-law",
    language: "chakma",
    scenarioNumber: 1,
    titleBn: "পারিবারিক আদালত আইন, ২০২৩ এর ধারা ৫",
    legalIntent: "family_law",
    legalIntentBn: "বিয়ে, তালাক, দেনমোহর, সন্তানের অভিভাবকত্ব ও পারিবারিক বিরোধ",
    legalIntentEn: "Disputes regarding marriage, divorce, restitution of conjugal rights, dower, and child guardianship.",
    statute: "পারিবারিক আদালত আইন, ২০২৩",
    section: "ধারা ৫",
    terms: [
      { term: "মাঘী", variants: ["মাগী", "মেলা"], senses: ["স্ত্রী", "নারী"], glossEn: "Wife / Woman", glossBn: "স্ত্রী" },
      { term: "জামেই", variants: [], senses: ["স্বামী", "পুরুষ"], glossEn: "Husband", glossBn: "স্বামী" },
      { term: "ছারাছারি", variants: ["চারাচারি", "ছাড়াছাড়ি"], senses: ["তালাক", "বিচ্ছেদ"], glossEn: "Divorce / Separation", glossBn: "তালাক" },
      { term: "গুরো", variants: ["গুড়ো", "গুরোং"], senses: ["সন্তান", "শিশু"], glossEn: "Child", glossBn: "সন্তান" },
    ],
    examples: [
      "আমার মাঘী (স্ত্রী) এর সাথে অনেকদিন ধরে পারিবারিক বিরোধ চলছে।",
      "জামেই ছারাছারি (ডিভোর্স) দিতে চায়, কিন্তু মোহরানা দিচ্ছে না।",
      "আমার গুরো (বাচ্চা) এর কাস্টডি নিয়ে পারিবারিক আদালতে মামলা করতে চাই।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "chakma-rent-control",
    language: "chakma",
    scenarioNumber: 2,
    titleBn: "বাড়ি ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১",
    legalIntent: "rent_control",
    legalIntentBn: "বাড়ি ভাড়া বকেয়া, অবৈধ বাড়ি খালি করা ও অনিয়মিত ভাড়া বৃদ্ধি",
    legalIntentEn: "Conflicts over house rent arrears, eviction without notice, and arbitrary rent increments.",
    statute: "বাড়ি ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১",
    section: "",
    terms: [
      { term: "ঘর", variants: ["ভিদে"], senses: ["বাড়ি", "গৃহ"], glossEn: "House / Home", glossBn: "বাড়ি" },
      { term: "বাড়া", variants: ["বারা", "ভাড়া"], senses: ["ভাড়া"], glossEn: "Rent", glossBn: "ভাড়া" },
      { term: "খেদেই দানা", variants: ["খেদায়", "খেদি"], senses: ["উচ্ছেদ", "বের করে দেওয়া"], glossEn: "Eviction / Drive away", glossBn: "উচ্ছেদ" },
    ],
    examples: [
      "ভাড়াটিয়া তিন মাস ধরে ঘর বাড়া (বাড়ি ভাড়া) দিচ্ছে না।",
      "মালিক আমাকে জোর করে ঘর থেকে খেদেই দানা (উচ্ছেদ করতে) চাইছে।",
      "বাড়ি ভাড়া নিয়ন্ত্রণ আইনে বাড়া (ভাড়া) বৃদ্ধির বিরুদ্ধে অভিযোগ আছে।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "chakma-land-partition",
    language: "chakma",
    scenarioNumber: 3,
    titleBn: "সিভিল জজ আদালতের এখতিয়ারভুক্ত বণ্টন",
    legalIntent: "land_partition",
    legalIntentBn: "উত্তরাধিকার বা ভাগাভাগি করা সম্পত্তির বণ্টন, পরিমাপ ও সীমানা বিরোধ",
    legalIntentEn: "Disagreements over the partition, measurement, and boundary demarcation of inherited or shared property/land.",
    statute: "সিভিল জজ আদালত আইন",
    section: "",
    terms: [
      { term: "জুম", variants: ["জাদি"], senses: ["জমি", "সম্পত্তি"], glossEn: "Land / Estate", glossBn: "জমি" },
      { term: "বাঘ", variants: ["বাগ", "ভাগ"], senses: ["অংশ", "ভাগ"], glossEn: "Share / Portion", glossBn: "অংশ" },
      { term: "আড়া", variants: ["আরা", "আড়াং"], senses: ["সীমানা", "সীমান্ত"], glossEn: "Boundary / Border", glossBn: "সীমানা" },
    ],
    examples: [
      "বাবার রেখে যাওয়া জুম (জমি) বণ্টন নিয়ে ভাইদের সাথে বিরোধ।",
      "আমার সম্পত্তির বাঘ (অংশ) আমাকে বুঝিয়ে দিচ্ছে না।",
      "জমির আড়া (সীমানা) নিয়ে সিভিল জজ আদালতে মামলা চলছে।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "chakma-agricultural-preemption",
    language: "chakma",
    scenarioNumber: 4,
    titleBn: "State Acquisition & Tenancy Act, 1950 এর ধারা ৯৬",
    legalIntent: "agricultural_preemption",
    legalIntentBn: "কৃষি জমি কেনার আগে অগ্রক্রয় বা অগ্রক্রম অধিকারের বিরোধ",
    legalIntentEn: "Disputes regarding the right of pre-emption (first right of refusal) for agricultural land.",
    statute: "State Acquisition & Tenancy Act, 1950",
    section: "ধারা ৯৬",
    terms: [
      { term: "ভূঁই", variants: ["ভুই", "বুঁই"], senses: ["জমি", "কৃষি জমি"], glossEn: "Land / Agricultural field", glossBn: "জমি" },
      { term: "ঘিনানা", variants: ["গিনানা", "ঘিনা"], senses: ["কেনা", "ক্রয়"], glossEn: "To buy / Purchase", glossBn: "কেনা" },
      { term: "আগর", variants: [], senses: ["আগে", "অগ্রক্রম"], glossEn: "Prior / First", glossBn: "অগ্রক্রয়" },
    ],
    examples: [
      "আমার পাশের ভূঁই (জমি) অন্যকে বিক্রি করেছে, আমি আগর ঘিনানা (অগ্রক্রয়) অধিকার চাই।",
      "কৃষি জুম (জমি) এর অগ্রক্রয় নিয়ে State Acquisition & Tenancy Act এ মামলা করব।",
      "শরিক হিসেবে ভূঁই ঘিনিবার (কেনার) অগ্রাধিকার আমার আছে।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "chakma-non-agricultural-preemption",
    language: "chakma",
    scenarioNumber: 5,
    titleBn: "Non-Agricultural Tenancy Act, 1949 এর ধারা ২৪",
    legalIntent: "non_agricultural_preemption",
    legalIntentBn: "অকৃষি বা বাণিজ্যিক জমি কেনার আগে অগ্রক্রয় অধিকারের বিরোধ",
    legalIntentEn: "Disputes regarding the right of pre-emption for non-agricultural or commercial land.",
    statute: "Non-Agricultural Tenancy Act, 1949",
    section: "ধারা ২৪",
    terms: [
      { term: "ভিদে", variants: ["ভিটে", "বিদে"], senses: ["বসতভিটা", "অকৃষি জমি"], glossEn: "Homestead land", glossBn: "বসতভিটা" },
      { term: "দোগান", variants: ["দগান", "দোকান"], senses: ["দোকান", "বাণিজ্যিক জায়গা"], glossEn: "Shop / Commercial space", glossBn: "দোকান" },
    ],
    examples: [
      "দোগান (দোকান) এর জন্য বাণিজ্যিক জমির অগ্রক্রয় অধিকার দাবি করছি।",
      "Non-Agricultural Tenancy Act অনুযায়ী ভিদে (বসতভিটা) ঘিনানা (কেনার) মামলা করেছি।",
      "আমার ভিদে এর পাশের জায়গা অন্য কাউকে বিক্রি করা হয়েছে।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "chakma-parental-maintenance",
    language: "chakma",
    scenarioNumber: 6,
    titleBn: "পিতামাতার ভরণপোষণ আইন, ২০১৩ এর ধারা ৮",
    legalIntent: "parental_maintenance",
    legalIntentBn: "সন্তান কর্তৃক পিতামাতার আর্থিক সহায়তা, খাবার ও শারীরিক যত্ন প্রদান",
    legalIntentEn: "Disputes where children refuse to provide financial support, food, and physical maintenance to their parents.",
    statute: "পিতামাতার ভরণপোষণ আইন, ২০১৩",
    section: "ধারা ৮",
    terms: [
      { term: "বাজী", variants: ["বাজি", "বাচি"], senses: ["পিতা", "বাবা"], glossEn: "Father", glossBn: "পিতা" },
      { term: "মা", variants: ["আম্মা"], senses: ["মাতা", "মা"], glossEn: "Mother", glossBn: "মাতা" },
      { term: "খেইবার দানা", variants: ["খাইবার", "খেইবার"], senses: ["খাওয়ানো", "খাবার দেওয়া"], glossEn: "To feed / Provide food", glossBn: "খাওয়ানো" },
      { term: "পালানা", variants: ["পালনা", "ফালানা"], senses: ["যত্ন", "দেখাশুনা"], glossEn: "To care / Look after", glossBn: "যত্ন" },
    ],
    examples: [
      "ছেলে তার বাজী-মা (পিতা-মাতা) এর ভরণপোষণ দিচ্ছে না।",
      "আমাদের খেইবার দানা (খাবার) এবং চিকিৎসার খরচ দেয় না।",
      "পিতামাতার ভরণপোষণ আইনে পালানা (যত্ন) না করার জন্য অভিযোগ করেছি।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "chakma-cheque-dishonour",
    language: "chakma",
    scenarioNumber: 7,
    titleBn: "Negotiable Instruments Act, 1881 এর ধারা ১৩৮",
    legalIntent: "cheque_dishonour",
    legalIntentBn: "অপর্যাপ্ত ব্যালেন্স বা অন্য কারণে চেক ফেরত বা ডিজঅনার হওয়ার অভিযোগ",
    legalIntentEn: "Complaints regarding bounced or dishonored cheques due to insufficient funds.",
    statute: "Negotiable Instruments Act, 1881",
    section: "ধারা ১৩৮",
    terms: [
      { term: "টিয়া", variants: ["টেয়া", "টীয়া"], senses: ["টাকা", "অর্থ"], glossEn: "Money / Taka", glossBn: "টাকা" },
      { term: "ধার", variants: ["দার"], senses: ["ধার", "পরদায়"], glossEn: "Debt / Borrow", glossBn: "ধার" },
      { term: "ফুরি আহানা", variants: ["ফুরিহানা", "ফুরি"], senses: ["ফেরত", "চেক ডিজঅনার"], glossEn: "Return / Bounce", glossBn: "চেক ফেরত" },
    ],
    examples: [
      "সে আমাকে তিন লক্ষ টাকার চেক দিয়েছিল, কিন্তু ব্যাংকে টিয়া (টাকা) নাই বলে চেক ফুরি আহানা (ফেরত/ডিজঅনার) হয়েছে।",
      "আমার পাওনা টিয়া (টাকা) না দিয়ে সে চেক ডিজঅনার করেছে।",
      "দার (ধার) নেওয়া টাকার চেক বাউন্স হওয়ায় Negotiable Instruments Act এ মামলা করেছি।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "chakma-dowry",
    language: "chakma",
    scenarioNumber: 8,
    titleBn: "যৌতুক নিরোধ আইন, ২০১৮ এর ধারা ৩ ও ৪ক",
    legalIntent: "dowry",
    legalIntentBn: "বিয়ের সময় বা পরে যৌতুক চাওয়া, দেওয়া বা নেওয়ার অভিযোগ",
    legalIntentEn: "Complaints regarding the demanding, giving, or taking of dowry during or after marriage.",
    statute: "যৌতুক নিরোধ আইন, ২০১৮",
    section: "ধারা ৩ ও ৪ক",
    terms: [
      { term: "বিয়া", variants: [], senses: ["বিয়ে", "বিবাহ"], glossEn: "Marriage / Wedding", glossBn: "বিয়ে" },
      { term: "খুজানা", variants: ["খুজনা", "কুজানা", "দাভি"], senses: ["দাবি", "চাওয়া"], glossEn: "Demand / Ask for", glossBn: "দাবি" },
      { term: "সোনাদানা", variants: [], senses: ["স্বর্ণ", "গহনা"], glossEn: "Gold / Jewelry", glossBn: "গহনা" },
    ],
    examples: [
      "বিয়া (বিয়ে) এর সময় তারা অনেক যৌতুক এবং সোনাদানা খুজানা (দাবি) করেছে।",
      "যৌতুক নিরোধ আইন অনুযায়ী টিয়া (টাকা) খুজানা (দাবি) করার জন্য অভিযোগ করেছি।",
      "শ্বশুরবাড়ির লোকজন যৌতুক হিসেবে অনেক কিছু দাভি (দাবি) করছে।",
    ],
    reviewStatus: "seed",
  },
  {
    id: "chakma-violence-dowry",
    language: "chakma",
    scenarioNumber: 9,
    titleBn: "নারী ও শিশু নির্যাতন দমন আইন, ২০০০ এর ধারা ১১(গ)",
    legalIntent: "violence_dowry",
    legalIntentBn: "যৌতুকের জন্য নারীর উপর শারীরিক বা মানসিক নির্যাতন ও সহিংসতা",
    legalIntentEn: "Complaints involving physical or mental abuse, torture, or violence inflicted on a woman for dowry demands.",
    statute: "নারী ও শিশু নির্যাতন দমন আইন, ২০০০",
    section: "ধারা ১১(গ)",
    terms: [
      { term: "দুক দানা", variants: ["দুগ দানা", "দুকদানা"], senses: ["নির্যাতন", "অত্যাচার"], glossEn: "Torture / Oppress / Give pain", glossBn: "নির্যাতন" },
      { term: "পিডানা", variants: ["পিডনা", "পিটানা"], senses: ["মারা", "মারধর"], glossEn: "Beat / Hit", glossBn: "মারধর" },
    ],
    examples: [
      "যৌতুকের টাকার জন্য স্বামী আমাকে দুক দানা (নির্যাতন) করেছে।",
      "টাকা না দেওয়ায় সে আমাকে অনেক পিডানা (মারধর) করেছে।",
      "নারী ও শিশু নির্যাতন দমন আইনে যৌতুকের জন্য দুক দানা (নির্যাতন) এর মামলা করতে চাই।",
    ],
    reviewStatus: "seed",
  },
];

export function getScenariosForLanguage(language: IndigenousLanguage): IndigenousScenario[] {
  if (language === "bn") return [];
  return INDIGENOUS_SCENARIOS.filter((scenario) => scenario.language === language);
}
