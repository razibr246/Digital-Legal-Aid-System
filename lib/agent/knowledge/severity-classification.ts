export type SeverityLevel = "emergency" | "high" | "priority" | "standard";

export interface SeverityClassification {
  severity: SeverityLevel;
  category: string;
  categoryBn: string;
  matchedTags: string[];
  matchedTagsBn: string[];
  factors: string[];
  legalBasis: string[];
  caseReference: string | null;
  needsApplicationConfirmation: boolean;
  acknowledgmentBn: string;
}

type SeverityRule = {
  tag: string;
  tagBn: string;
  category: string;
  categoryBn: string;
  severity: Exclude<SeverityLevel, "standard">;
  keywords: string[];
  factors: string[];
  legalBasis: string[];
  caseReference: string | null;
};

/**
 * Additional surface forms per rule, so a caller is recognised by what they MEAN and not
 * by whether they happened to use one of the exact phrases the spec was written in.
 *
 * Why this exists, concretely: the keyword lists held phrases like "ফোন ধরা যায় না" and
 * "আমার হয়ে আবেদন". A real brother phrased it as "স্বামী ফোন দেখেন" and "তার হয়ে ফোন
 * করেছি" — neither matched, so a domestic-violence report from a blind proxy caller was
 * filed as "General Inquiry". The classifier was not weak, it was literal.
 *
 * This is a lexicon, not a hardcode: a concept (restricted contact, proxy reporting,
 * altered images) lists many real ways of saying it, and the rule that already owns the
 * concept still owns the severity, the factors and the legal basis. Nothing here decides
 * an outcome on its own — it only widens what counts as speaking about that concept.
 *
 * Additive by design. Every original keyword still matches exactly as before, so widening
 * the vocabulary cannot make a case LESS severe, only stop a case being missed.
 */
const SEVERITY_SYNONYMS: Record<string, string[]> = {
  Physical_Abuse: [
    "মারধর করেন", "মারধর করে", "মারধর করছে", "মারধর করছেন", "মারতে", "পেটাতে",
    "মেরে", "মারা হয়েছে", "আঘাত করেন", "আঘাত করছে", "প্রহার", "চড় মারে", "থাপাড়",
    "শারীরিক ক্ষতি", "শারীরিক নির্যাতন", "স্বামী মারে", "স্বামী আমাকে মারে",
    "মারধর করার", "নির্যাতন করছে", "নির্যাতন করছেন", "বাড়ি থেকে বের করে",
    "বাড়ি থেকে বের করে দিয়েছে", "বের করে দিয়েছে", "গালাগালি", "মারপাট",
  ],
  Restricted_Contact: [
    "ফোন দেখে", "ফোন দেখেন", "ফোন চেক করে", "ফোন নজরে", "ফোন নজরদারি",
    "ফোন ধরা যায় না", "ফোনে কথা বলতে পারে না", "ফোনে কথা বলতে পারি না",
    "স্বামী নজরে", "ফোন নেওয়া হয়", "নিরাপদে কথা বলা যায় না", "নিরাপদ সময়",
    "নিরাপদ সময়ে", "গোপন রাখতে হবে", "গোপন রাখতে হবে", "সতর্ক করবেন না",
    "চুপচাপ", "গোপনে", "না দেখিয়ে", "পাশে না থেকে", "একা না থেকে",
    "বাড়ির ফোন", "বাটন ফোন", "ফোন খরচ", "ফোন নেই", "সংকেতে যোগাযোগ",
  ],
  Incomplete_NID: [
    "জাতীয় পরিচয়পত্র", "জাতীয় পরিচয়পত্র নেই", "পরিচয়পত্র নেই", "পরিচয়পত্র হারিয়ে",
    "পরিচয়পত্র হারানো", "এনআইডি", "এনআইডি নেই", "এনআইডি কার্ড", "এনআইডি কার্ড পাইনি",
    "এনআইডি হারিয়েছে", "পরিচয়পত্র অপ্রাপ্য", "পরিচয়পত্রের ফটো", "আধার কার্ড নেই",
    "পরিচয়পত্র আছে না", "কাগজপত্র পাইনি", "কাগজপত্র নেই",
  ],
  Proxy_Applicant: [
    "তার হয়ে", "তার হয়ে ফোন", "তার হয়ে আবেদন", "আমার বোনের হয়ে", "আমার বোনের পক্ষে",
    "আমার মেয়ের হয়ে", "আমার মায়ের হয়ে", "আমার স্ত্রীর হয়ে", "তাঁর হয়ে",
    "আমার পক্ষে", "পরিবারের সদস্য হিসেবে", "প্রতিনিধি", "প্রতিনিধির মাধ্যমে",
    "অন্য কেউ আমার হয়ে", "নিজে ফোন করতে পারে না", "নিজে বলতে পারছে না",
    "তার পক্ষে", "আমি এসেছি তার জন্য",
  ],
  Immediate_Safety_Concern: [
    "নিরাপদ না", "নিরাপত্তা নেই", "সবচেয়ে বেশি ঝুঁকি", "ঝুঁকির মধ্যে",
    "এখনই সাহায্য", "অতিরিক্ত", "শারীরিকভাবে", "শারীরিক আঘাত",
  ],
  Confinement: [
    "বাইরে যেতে পারে না", "বাইরে যেতে দেয় না", "বন্ধ করে রেখেছে",
    "আটকে রেখেছে", "ঘরে বন্ধ", "পালাতে পারছে না", "লুকিয়ে রেখেছে",
  ],
  Maintenance_Denial: [
    "ভরণপোষণ দিচ্ছে না", "ভরণপোষণ দেয় না", "খরচ দেয় না", "পয়সা দেয় না",
    "টাকা দেয় না", "খরচ দিতে অস্বীকার", "ভরণপোষণ বন্ধ",
  ],
  Dowry_Demand: [
    "দাওয়াত চাইছে", "দাওয়াতের দাবি", "দাওয়াত", "গয়না চাইছে", "টাকা চাইছে বিয়ে",
  ],
  NonConsensual_Imagery: [
    "অশ্লীল মেসেজ", "অশ্লীল ছবি", "অশ্লীল ছবি পাঠাচ্ছে", "ছবি বদলে", "ছবি বদলে সাজিয়ে",
    "ছবি বদলে অশ্লীল", "নগ্ন ছবি", "ছবি ছড়িয়ে", "ছবি ছড়িয়ে দিচ্ছে", "অন্যদের কাছে",
    "অনুমতি ছাড়া", "সম্মতি ছাড়া", "ভয় দিচ্ছে", "ভয় দিয়ে", "ভয় দেখাচ্ছে",
    "হয়রানি করছে", "মেরে ফেলব", "প্রাণের আশঙ্কা", "ছবি পাঠাচ্ছে", "মেসেজ পাঠাচ্ছে",
    "আমাকে ভয়", "ভয় পাচ্ছি", "খুব ভয়",
  ],
  Cyber_Harassment: [
    "ভুয়া ছবি", "ভুয়া ছবি ছড়াচ্ছে", "ছবি ছড়াচ্ছে", "ছবি ছড়িয়ে", "ছবি অপব্যবহার",
    "অশ্লীল মেসেজ", "অশ্লীল ছবি", "ছবি বদলে", "ছবি বদলে সাজিয়ে", "নাচিং করছে",
    "সাইবার", "সাইবার নির্যাতন", "সাইবার বুলিং", "অনলাইনে হয়রানি", "অনলাইনে হয়রাজ",
    "অনলাইনে ভয় দেখাচ্ছে", "অনলাইনে প্রতারণা", "ফেসবুকে হয়রাজ", "ফেসবুকে",
    "ব্ল্যাকমেইল", "হ্যাক", "পাসওয়ার্ড", "ভয় দিচ্ছে", "ভয় দেখাচ্ছে", "হয়রানি করছে",
    "ছবি পাঠাচ্ছে", "মেসেজ পাঠাচ্ছে", "অনলাইনে ছড়িয়ে",
  ],
  Land_Grabbing_Forged_Deed: ["জমি দখল", "দখল করে", "দখল করেছে", "জমি চুরি", "সরকারি জমি", "জমি দখল করেছে"],
  Property_Transfer_Dispute: [
    "জমি নিয়ে", "জমির দলিল", "দলিল নিয়ে", "সম্পত্তি বিরোধ", "সম্পত্তি নিয়ে",
    "জমি সমস্যা", "জমির মালিকানা", "দখলের দলিল", "ভুয়া দলিল",
  ],
  Inheritance_Succession: [
    "উত্তরাধিকার", "উত্তরাধিকার বিরোধ", "উইল্ট", "উইল করে", "মৃত্যুর পর সম্পত্তি",
    "মরা ব্যক্তির সম্পত্তি", "ভাগ করে", "ভাগের দাবি", "ওয়ারিশ",
  ],
  Labour_Dispute: [
    "মজুরি দেয়নি", "বেতন দেয়নি", "বেতন দেয় না", "মজুরি দেয় না", "চাকরি থেকে বের",
    "কাজ থেকে বের করে", "ভাড়ায় দেওয়া টাকা", "ভাড়ার টাকা", "বকেয়া", "কাজের দাবি",
  ],
  Case_Delay_Or_Inactivity: [
    "সাত মাস ধরে", "মাসের পর মাস", "কোনো খবর পাইনি", "খবর পাইনি", "আপডেট পাইনি",
    "আইনি নিষ্ক্রিয়", "অগ্রসর হচ্ছে না", "অপেক্ষমাণ", "দেরিতে", "আটকে আছে",
    "উত্তর পাচ্ছি না", "কোনো ব্যবস্থা হয়নি",
  ],
  Priority_Disability: [
    "প্রতিবন্ধী", "বিশেষ চাহিদা", "সহায়তা চাই", "অসুবিধা", "প্রতিবন্ধকতা",
  ],
  PWD_Visual: [
    "দৃষ্টিহীন", "দৃষ্টি নেই", "চোখে দেখতে পাই না", "অন্ধ", "পড়তে পারি না",
    "পড়তে পারি না", "ফরম পড়তে পারি না", "পিডিএফ", "স্ক্রিনরিডার", "ক্যাপচা",
    "ভিজ্যুয়াল ওটিপি", "দেখে লিখতে", "দেখতে না পেয়ে", "অন্ধত্ব", "বধির",
  ],
  Case_Access_Barrier: [
    "আছে না", "পাওয়া যায় না", "নেই বলে", "করতে পারছে না", "সমস্যা হচ্ছে",
    "সুবিধা নেই", "বাধা", "অসুবিধা হচ্ছে", "পারছে না", "পারে না",
  ],
  Civil_Injunction: ["নিষেধাজ্ঞা", "স্থায়ী আদেশ", "থামতে বলা", "আদেশ দিতে"],
  Cheque_Dishonour: ["চেক", "চেক bounce", "চেক ফেরত", "বাউন্স", "চেক ডিসকান্ট"],
  Child_Custody: ["সন্তানের অভিভাবকত্ব", "সন্তান দেখতে দেয় না", "সন্তান দেখাচ্ছে না", "হেফাজাত"],
  Divorce_Muslim_Law: ["তালাক", "ডিভোর্স", "বিচ্ছেদ"],
  Trafficking_Risk: ["পাচার", "বেচাই", "ক্রাড", "বাস্তবিক সন্তানা"],
};

/**
 * Every surface form a rule answers to: its own spec keywords plus the lexicon above.
 * Unrecognised tags simply contribute nothing, so a new rule works without a lexicon entry.
 */
function surfaceForms(rule: SeverityRule): string[] {
  return [...rule.keywords, ...(SEVERITY_SYNONYMS[rule.tag] ?? [])];
}

// Exported so the rules can be inspected by a test without reaching into the module's
// internals. Reading the keyword lists is the only way to tell "the text is wrong" apart
// from "the rule is missing a phrase", which are very different bugs to fix.
export const SEVERITY_RULES: SeverityRule[] = [
  {
    tag: "Immediate_Safety_Concern",
    tagBn: "তাৎক্ষণিক নিরাপত্তা উদ্বেগ",
    category: "Immediate Crisis & Safety",
    categoryBn: "তাৎক্ষণিক নিরাপত্তা ঝুঁকি",
    severity: "emergency",
    keywords: ["নিরাপদ নেই", "নিরাপদ থাকতে পারছি না", "ঝুঁকিতে আছি", "ঝুঁকিতে আছে", "জরুরি সাহায্য দরকার", "এখনই সাহায্য দরকার", "প্রাণের ঝুঁকি", "আমাকে পিছু করছে"],
    factors: ["Immediate Physical Safety Risk"],
    legalBasis: ["Immediate safety and emergency escalation protocol"],
    caseReference: "Moyuri",
  },
  {
    tag: "Physical_Abuse",
    tagBn: "শারীরিক নির্যাতন",
    category: "Immediate Crisis & Safety",
    categoryBn: "তাৎক্ষণিক নিরাপত্তা ঝুঁকি",
    severity: "emergency",
    keywords: ["শারীরিক নির্যাতন", "মারধর", "মেরেছে", "মারছে", "আঘাত করেছে", "হুমকি দিয়েছে", "আঘাত"],
    factors: ["Immediate Physical Safety Risk", "Communication Constraints"],
    legalBasis: ["Domestic Violence (Prevention and Protection) Act, 2010"],
    caseReference: "Moyuri",
  },
  {
    tag: "Severe_Violence_NariOShishu",
    tagBn: "নারী বা শিশুর গুরুতর সহিংসতা",
    category: "Immediate Crisis & Safety",
    categoryBn: "তাৎক্ষণিক নিরাপত্তা ঝুঁকি",
    severity: "emergency",
    keywords: ["শিশু নির্যাতন", "শিশুকে নির্যাতন", "নারীর উপর নির্যাতন", "ধর্ষণ", "অপহরণ", "ধুয়ে নিয়ে", "গণড়ে", "যৌনভাবে হয়রানি", "যৌন হয়রানি", "অশ্লীল বার্তা", "অশ্লীল ছবি", "অশ্লীল ভিডিও", "অনুমতি ছাড়া", "যৌন নির্যাতন", "সাইবার পর্দা"],
    factors: ["Immediate Physical Safety Risk", "Applicant Vulnerability & Isolation"],
    legalBasis: ["Nari O Shishu Nirjatan Daman Act, 2000"],
    caseReference: "Moyuri",
  },
  {
    tag: "Trafficking_Risk",
    tagBn: "মানব পাচারের ঝুঁকি",
    category: "Immediate Crisis & Safety",
    categoryBn: "তাৎক্ষণিক নিরাপত্তা ঝুঁকি",
    severity: "emergency",
    keywords: ["মানব পাচার", "পাচারের ঝুঁকি", "পাচার করা", "বাচ্চা পাচার", "ট্রাফিকিং"],
    factors: ["Immediate Physical Safety Risk", "Applicant Vulnerability & Isolation"],
    legalBasis: ["Human Trafficking Deterrence and Suppression Act, 2012"],
    caseReference: "Nabila",
  },
  {
    tag: "Confinement",
    tagBn: "জোর করে আটকে রাখা",
    category: "Immediate Crisis & Safety",
    categoryBn: "তাৎক্ষণিক নিরাপত্তা ঝুঁকি",
    severity: "emergency",
    keywords: ["আটকে রেখেছে", "আটকে রাখা", "বন্দী করে রেখেছে", "জোর করে রেখেছে", "কাটিয়ে রেখেছে", "আমাকে আটকে"],
    factors: ["Immediate Physical Safety Risk", "Communication Constraints"],
    legalBasis: ["Police or Magistrate Court escalation protocol"],
    caseReference: "Moyuri",
  },
  {
    tag: "Maintenance_Denial",
    tagBn: "ভরণপোষণ প্রত্যাখ্যান",
    category: "Family, Marriage & Financial Coercion",
    categoryBn: "পারিবারিক ও আর্থিক চাপ",
    severity: "high",
    keywords: ["ভরণপোষণ দিচ্ছে না", "ভরণপোষণ দেয় না", "ভরণপোষণ বন্ধ", "সন্তানের খরচ দিচ্ছে না", "ভরণপোষণের অভিযোগ"],
    factors: ["Applicant Vulnerability & Isolation", "Legal Merit & Time Sensitivity"],
    legalBasis: ["Section 21B of the Legal Aid Services Act", "Family Courts Act, 2023"],
    caseReference: "Moyuri",
  },
  {
    tag: "Dowry_Demand",
    tagBn: "দেনমোহার দাবি বা চাপ",
    category: "Family, Marriage & Financial Coercion",
    categoryBn: "পারিবারিক ও আর্থিক চাপ",
    severity: "high",
    keywords: ["দেনমোহর চাই", "দেনমোহার চাপ", "যৌতুকের জন্য চাপ", "যৌতুক দিতে বলছে", "দেনমোহর দিতে বলছে"],
    factors: ["Applicant Vulnerability & Isolation", "Legal Merit & Time Sensitivity"],
    legalBasis: ["Dowry Prohibition Act, 2018"],
    caseReference: "Moyuri",
  },
  {
    tag: "Child_Custody",
    tagBn: "সন্তানের হেফাজত বা custody",
    category: "Family, Marriage & Financial Coercion",
    categoryBn: "পারিবারিক ও আর্থিক চাপ",
    severity: "high",
    keywords: ["সন্তানের হেফাজত", "সন্তান নিয়ে বিবাদ", "সন্তান কার কাছে থাকবে", "custody", "হেফাজত নিয়ে"],
    factors: ["Applicant Vulnerability & Isolation", "Legal Merit & Time Sensitivity"],
    legalBasis: ["Guardians and Wards Act, 1890"],
    caseReference: null,
  },
  {
    tag: "Divorce_Muslim_Law",
    tagBn: "মুসলিম বিবাহ বিচ্ছেদ",
    category: "Family, Marriage & Financial Coercion",
    categoryBn: "পারিবারিক ও আর্থিক চাপ",
    severity: "high",
    keywords: ["বিবাহ বিচ্ছেদ", "তালাক", "বিচ্ছেদ করতে", "সংসার ভেঙে", "স্বামীর সাথে আর থাকতে চাই না"],
    factors: ["Legal Merit & Time Sensitivity"],
    legalBasis: ["Muslim Family Laws Ordinance, 1961", "Dissolution of Muslim Marriages Act, 1939"],
    caseReference: null,
  },
  {
    tag: "Land_Grabbing_Forged_Deed",
    tagBn: "জমি দখল বা জাল দলিল",
    category: "Property, Land & Civil Disputes",
    categoryBn: "সম্পত্তি, ভূমি ও দেওয়ানি বিরোধ",
    severity: "high",
    keywords: ["জমি দখল", "জোর করে জমি", "জাল দলিল", "ভুয়া দলিল", "জমি কেড়ে", "সীমানা লঙ্ঘন"],
    factors: ["Legal Merit & Time Sensitivity"],
    legalBasis: ["Land Crime Prevention and Redress Act, 2023"],
    caseReference: "Abdul Malek",
  },
  {
    tag: "Civil_Injunction",
    tagBn: "সম্পত্তি বা দখল আইনে বাধা",
    category: "Property, Land & Civil Disputes",
    categoryBn: "সম্পত্তি, ভূমি ও দেওয়ানি বিরোধ",
    severity: "high",
    keywords: ["দখল ফেরত", "সম্পত্তি ফেরত", "ইনজাঙ্কশন", "সম্পত্তিতে হস্তক্ষেপ", "বাড়িতে ঢুকতে দিচ্ছে না"],
    factors: ["Legal Merit & Time Sensitivity"],
    legalBasis: ["Specific Relief Act, 1877"],
    caseReference: null,
  },
  {
    tag: "Property_Transfer_Dispute",
    tagBn: "সম্পত্তি হস্তান্তর বিরোধ",
    category: "Property, Land & Civil Disputes",
    categoryBn: "সম্পত্তি, ভূমি ও দেওয়ানি বিরোধ",
    severity: "high",
    keywords: ["জমি বিক্রি", "জমি হস্তান্তর", "জমি ধার", "জমি দান", "বাড়ি বিক্রি নিয়ে", "সম্পত্তি বিক্রি নিয়ে"],
    factors: ["Legal Merit & Time Sensitivity"],
    legalBasis: ["Transfer of Property Act, 1882"],
    caseReference: null,
  },
  {
    tag: "Inheritance_Succession",
    tagBn: "উত্তরাধিকার বা ওয়াসিয়ত বিরোধ",
    category: "Property, Land & Civil Disputes",
    categoryBn: "সম্পত্তি, ভূমি ও দেওয়ানি বিরোধ",
    severity: "high",
    keywords: ["উত্তরাধিকার", "ওয়াসিয়ত", "মৃত ব্যক্তির সম্পত্তি", "সম্পত্তির ভাগ", "উত্তরাধিকার বিরোধ"],
    factors: ["Legal Merit & Time Sensitivity"],
    legalBasis: ["Succession Act, 1925", "Partition Act, 1893"],
    caseReference: null,
  },
  {
    tag: "Labour_Dispute",
    tagBn: "শ্রম বা বেতন বিরোধ",
    category: "Labor, Cyber & Specialized Rights",
    categoryBn: "শ্রম, সাইবার ও বিশেষ অধিকার",
    severity: "high",
    keywords: ["বেতন পাইনি", "বেতন দিচ্ছে না", "বকেয়া বেতন", "কাজ থেকে চাকরিচ্যুত", "শ্রমিকের অধিকার", "কর্মঘাত", "ওভারটাইমের বেতন"],
    factors: ["Applicant Vulnerability & Isolation", "Legal Merit & Time Sensitivity"],
    legalBasis: ["Bangladesh Labour Act, 2006, Section 33", "Labour Court"],
    caseReference: "Abdul Malek",
  },
  {
    tag: "Cyber_Harassment",
    tagBn: "সাইবার ব্ল্যাকমেইল বা অনলাইন নির্যাতন",
    category: "Labor, Cyber & Specialized Rights",
    categoryBn: "শ্রম, সাইবার ও বিশেষ অধিকার",
    // Deliberately "high", NOT emergency. Cyber is Category D in the spec, and
    // test-case-rules asserts that y2/y3/y5/y8 stay Category D and are not sensitive.
    // Raising this rule to emergency broke exactly that. The genuinely urgent part of
    // cyber — non-consensual imagery and threats — is `NonConsensual_Imagery` below, and
    // the taxonomy route for y1/y4 already went to Severe_Violence_NariOShishu.
    severity: "high",
    keywords: ["ব্ল্যাকমেইল", "ফেসবুকে হয়রাজ", "ভুয়া ছবি", "ছবি ছড়াচ্ছে", "অনলাইনে ভয় দেখাচ্ছে", "সাইবার নির্যাতন", "ছবি অপব্যবহার", "সাইবার বুলিং", "সাইবার", "অনলাইনে হয়রানি", "অনলাইনে ব্ল্যাকমেইল", "ভুয়া প্রোফাইল", "হ্যাক", "মোবাইল ব্যাংকিং", "সাইবার নিরাপত্তা", "অনলাইনে প্রতারণা"],
    factors: ["Immediate Physical Safety Risk", "Legal Merit & Time Sensitivity"],
    legalBasis: ["Cyber Security Frameworks", "Cross-agency referral protocol"],
    caseReference: "Nabila",
  },
  {
    // The urgent slice of cyber, split out so raising it does not drag all of Category D
    // up with it. Non-consensual imagery plus a threat is an ongoing, spreading harm, which
    // the spec treats as Category A and which must be role-restricted — and brief A3
    // requires the urgency to be surfaced rather than filed as routine. A caller
    // describing it in words previously landed on Cyber_Harassment ("high", not
    // sensitive), so the evidence stayed visible to staff who must not see it.
    tag: "NonConsensual_Imagery",
    tagBn: "সম্মতিহীন ছবি বা অনলাইন ভয়",
    category: "Immediate Crisis & Safety",
    categoryBn: "তাৎক্ষণিক নিরাপত্তা ঝুঁকি",
    severity: "emergency",
    keywords: [
      "অশ্লীল ছবি", "অশ্লীল মেসেজ", "নগ্ন ছবি", "ছবি বদলে", "ছবি বদলে সাজিয়ে",
      "অনুমতি ছাড়া ছবি", "সম্মতি ছাড়া", "ভয় দিয়ে", "ভয় দিচ্ছে", "হয়রানি করছে",
      "মেরে ফেলব", "প্রাণের আশঙ্কা", "ছবি ছড়িয়ে", "অন্যদের কাছে",
    ],
    factors: ["Immediate Physical Safety Risk", "Applicant Vulnerability & Isolation"],
    legalBasis: ["Digital Security Act, 2018", "Cross-agency referral protocol"],
    caseReference: "Nabila",
  },
  {
    tag: "Cheque_Dishonour",
    tagBn: "চেক অনাদায়",
    category: "Labor, Cyber & Specialized Rights",
    categoryBn: "শ্রম, সাইবার ও বিশেষ অধিকার",
    severity: "high",
    keywords: ["চেক অনাদায়", "চেক ফেরত দেয়নি", "চেক bounce", "চেক দেন্ডার"],
    factors: ["Legal Merit & Time Sensitivity"],
    legalBasis: ["Negotiable Instruments Act, 1881, Section 138"],
    caseReference: null,
  },
  {
    tag: "Priority_Disability",
    tagBn: "প্রতিবন্ধিতা",
    category: "Procedural Vulnerability & Accessibility",
    categoryBn: "প্রক্রিয়াগত দুর্বলতা ও অ্যাক্সেসিবিলিটি",
    severity: "priority",
    keywords: ["প্রতিবন্ধী", "বিশেষ চাহিদা সম্পন্ন", "প্রতিবন্ধকতা রয়েছে", "শারীরিক প্রতিবন্ধকতা"],
    factors: ["Applicant Vulnerability & Isolation"],
    legalBasis: ["Rights and Protection of Persons with Disabilities Act, 2013"],
    caseReference: "Ripon",
  },
  {
    tag: "PWD_Visual",
    tagBn: "দৃষ্টিহীনতা",
    category: "Procedural Vulnerability & Accessibility",
    categoryBn: "প্রক্রিয়াগত দুর্বলতা ও অ্যাক্সেসিবিলিটি",
    severity: "priority",
    keywords: ["দৃষ্টিহীন", "দৃষ্টিশক্তি নেই", "অন্ধ", "দেখতে পাই না", "voice only"],
    factors: ["Applicant Vulnerability & Isolation"],
    legalBasis: ["Rights and Protection of Persons with Disabilities Act, 2013"],
    caseReference: "Ripon",
  },
  {
    tag: "Restricted_Contact",
    tagBn: "সীমিত যোগাযোগের সুযোগ",
    category: "Procedural Vulnerability & Accessibility",
    categoryBn: "প্রক্রিয়াগত দুর্বলতা ও অ্যাক্সেসিবিলিটি",
    severity: "priority",
    keywords: ["শুধু শুক্রবার", "নিরাপদ সময়ে", "গোপন রাখতে হবে", "সতর্ক করবেন না", "ফোন ধরা যায় না", "সংকেতে যোগাযোগ"],
    factors: ["Communication Constraints", "Applicant Vulnerability & Isolation"],
    legalBasis: ["Zero-Outbound SMS lock and discreet callback protocol"],
    caseReference: "Moyuri",
  },
  {
    tag: "Proxy_Applicant",
    tagBn: "প্রতিনিধির মাধ্যমে আবেদন",
    category: "Procedural Vulnerability & Accessibility",
    categoryBn: "প্রক্রিয়াগত দুর্বলতা ও অ্যাক্সেসিবিলিটি",
    severity: "priority",
    keywords: ["আমার হয়ে আবেদন", "প্রতিনিধির মাধ্যমে", "আমার মেয়ের হয়ে", "অন্য কেউ আমার হয়ে", "proxy applicant"],
    factors: ["Applicant Vulnerability & Isolation"],
    legalBasis: ["Proxy representation and subsequent direct verification protocol"],
    caseReference: "Ripon",
  },
  {
    tag: "Incomplete_NID",
    tagBn: "পরিচয়পত্র অসম্পূর্ণ",
    category: "Procedural Vulnerability & Accessibility",
    categoryBn: "প্রক্রিয়াগত দুর্বলতা ও অ্যাক্সেসিবিলিটি",
    severity: "priority",
    keywords: ["এনআইডি নেই", "পরিচয়পত্র নেই", "এনআইডি হারিয়েছে", "NID missing", "পরিচয়পত্র অপ্রাপ্য"],
    factors: ["Applicant Vulnerability & Isolation"],
    legalBasis: ["Defer strict identity requirements for vulnerable citizens"],
    caseReference: "Moyuri",
  },
  {
    tag: "Case_Access_Barrier",
    tagBn: "ভাষা বা সংযোগের বাধা",
    category: "Procedural Vulnerability & Accessibility",
    categoryBn: "প্রক্রিয়াগত দুর্বলতা ও অ্যাক্সেসিবিলিটি",
    severity: "priority",
    keywords: ["মারমা ভাষা", "ভাষা বোঝা যায় না", "ইন্টারনেট সংযোগ নেই", "ইন্টারনেট কাজ করছে না", "অফলাইন আছি", "কম ইন্টারনেট", "যোগাযোগ কঠিন"],
    factors: ["Applicant Vulnerability & Isolation", "Communication Constraints"],
    legalBasis: ["Offline-first and provenance-aware intake protocol"],
    caseReference: "Nuching Marma",
  },
  {
    tag: "Case_Delay_Or_Inactivity",
    tagBn: "কেসের দেরি বা আইনজীবীর নিষ্ক্রিয়তা",
    category: "Procedural Vulnerability & Accessibility",
    categoryBn: "প্রক্রিয়াগত দুর্বলতা ও অ্যাক্সেসিবিলিটি",
    severity: "high",
    keywords: ["সাত মাস ধরে", "শুনানির আপডেট নেই", "উকিল ফোন ধরে না", "আইনজীবী ফোন ধরে না", "মামলার কোনো আপডেট নেই", "দীর্ঘদিন অপেক্ষায়"],
    factors: ["Legal Merit & Time Sensitivity", "Communication Constraints"],
    legalBasis: ["Low-bandwidth case status and lawyer-change escalation protocol"],
    caseReference: "Abdul Malek",
  },
];

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  standard: 0,
  priority: 1,
  high: 2,
  emergency: 3,
};

/**
 * Category A of the spec: "Immediate Crisis & Safety (High Severity) ... bypass
 * standard workflows, block automated SMS notifications ... and escalate the case
 * for immediate human intervention."
 *
 * A Category A case is `sensitive`, and sensitive cases are visible only to the
 * DLAO and the Chief DLAO. That is derived from the classification rather than
 * stored in a new column, so it cannot drift out of sync with severity.
 */
export const IMMEDIATE_CRISIS_CATEGORY = "Immediate Crisis & Safety";

export function isSensitiveClassification(result: {
  severity: SeverityLevel;
  category: string;
}): boolean {
  return result.severity === "emergency" || result.category === IMMEDIATE_CRISIS_CATEGORY;
}

/**
 * Maps a taxonomy pick onto the spec's tag names.
 *
 * This exists because keyword matching alone is not reliable enough here. The
 * stored problem statement is the category-derived Bangla question, so its wording
 * is a fixed string we control — the honest signal is the selection itself. An
 * online sexual-harassment report was being filed as "General Inquiry" because
 * the Cyber_Harassment keyword list was written from the old prototype's phrasing
 * and never matched the taxonomy's own sub-category text.
 *
 * Sub-category overrides win over the category default, because one category can
 * span two spec categories: cyber bullying is Category D, but sexual harassment
 * or child exploitation inside that same category is Category A.
 */
const CATEGORY_TAG: Record<string, string | null> = {
  cyber: "Cyber_Harassment",
  dowry_violence: "Severe_Violence_NariOShishu",
  dowry: "Dowry_Demand",
  maintenance: "Maintenance_Denial",
  agri_land: "Land_Grabbing_Forged_Deed",
  non_agri_land: "Property_Transfer_Dispute",
  inheritance: "Inheritance_Succession",
  cheque: "Cheque_Dishonour",
  rent: "Civil_Injunction",
};

const SUBCATEGORY_TAG: Record<string, string> = {
  // Non-consensual sexual imagery, and any child online, are Category A.
  "cyber/y1": "Severe_Violence_NariOShishu",
  "cyber/y4": "Severe_Violence_NariOShishu",
  "cyber/y10": "Severe_Violence_NariOShishu",
  "family/f4": "Child_Custody",
  "family/f2": "Divorce_Muslim_Law",
  "family/f10": "Divorce_Muslim_Law",
};

/**
 * Returns the spec tag for a taxonomy pick, or null when the choice carries no
 * spec meaning of its own — the per-category "other" escape hatch, for instance,
 * must be judged from the words the caller typed, not from the category label.
 */
export function tagForSelection(
  categoryId: string | null | undefined,
  subcategoryId: string | null | undefined,
): string | null {
  if (subcategoryId && subcategoryId !== "other") {
    const exact = SUBCATEGORY_TAG[`${categoryId}/${subcategoryId}`];
    if (exact) return exact;
  }
  if (subcategoryId === "other" || !subcategoryId) return null;
  return categoryId ? (CATEGORY_TAG[categoryId] ?? null) : null;
}

const FACTOR_DEFINITIONS: Record<string, string> = {
  "Immediate Physical Safety Risk":
    "চলমান সহিংসতা, হুমকি, সন্তান বা অন্য কারও তাৎক্ষণিক ঝুঁকি।",
  "Applicant Vulnerability & Isolation":
    "প্রতিনিধির মাধ্যমে আবেদন, শারীরিক বা মানসিক প্রতিবন্ধিতা, আর্থিক বা সামাজিক বিচ্ছিন্নতা।",
  "Communication Constraints":
    "পরিবার বা নিরাপত্তা পরিস্থিতির কারণে নির্দিষ্ট সময়ে যোগাযোগের সুযোগ।",
  "Legal Merit & Time Sensitivity":
    "সময়সীমা, শুনানি, সীমা মেয়াদ, সাক্ষ্য বা অধিকার সুরক্ষার সময়-সংবেদনশীল বিষয়।",
};

const CASE_KNOWLEDGE = [
  "Moyuri: ongoing physical safety risk, restricted contact, inaccessible NID, and a proxy report require discreet handling and zero-outbound alerts.",
  "Ripon: visually impaired proxy representation requires voice-based accessible intake and clear authority boundaries.",
  "Nabila: rapidly spreading fake images and sensitive digital evidence require role-restricted access and tracked cross-agency referral.",
  "Nuching Marma: language barriers and unreliable connectivity require offline-first, provenance-aware intake and later synchronization.",
  "Abdul Malek: a stagnant case, financial travel burden, unstable contact, and lawyer inactivity require a low-bandwidth status route and lawyer-change alert.",
];

function normalizeText(input: string): string {
  return input.toLocaleLowerCase("bn-BD").replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function hasPersonalProblemContext(text: string): boolean {
  return (
    /(আমার|আমাকে|আমাদের|আমি\s+(দৃষ্টিহীন|প্রতিবন্ধী|মারমা|ভাষা|কাছে|থাকা|করছে|হয়েছে|চাই|চাইছি))/.test(text) ||
    /(হয়েছে|হচ্ছে|ঘটেছে|ঘটে|সমস্যা|অভিযোগ|বিপদে|চাপে|কাছে|আটকে|মারছে|মেরেছে|পাইনি|দিচ্ছে না|দেয় না|নেই|চাই|চাইছে|চায়|শুধু|নিরাপদ|গোপন|সংকেত|ভাষা|ইন্টারনেট|আপডেট)/.test(text)
  );
}

function hasCrisisContext(text: string): boolean {
  return /(এখন|এখনই|জরুরি|বিপদে|আটকে|মারছে|মেরেছে|হুমকি|প্রাণ|অপহরণ|নির্যাতন|চাপ দিচ্ছে)/.test(text);
}

function highestSeverity(rules: SeverityRule[]): SeverityLevel {
  return rules.reduce<SeverityLevel>(
    (current, rule) => (SEVERITY_RANK[rule.severity] > SEVERITY_RANK[current] ? rule.severity : current),
    "standard",
  );
}

function buildAcknowledgment(severity: SeverityLevel, categoryBn: string, tagsBn: string[]): string {
  const tagText = tagsBn.slice(0, 2).join(" এবং ");
  const safetyText =
    severity === "emergency"
      ? "আপনার নিরাপত্তা সবার আগে; প্রয়োজনে ৯৯৯, ১০৯ বা ১৬৬৯৯ নম্বরে কল করুন।"
      : "আইনি সহায়তার জন্য আপনার অভিযোগটি নথিভুক্ত করলে যাচাই ও পরবর্তী পদক্ষেপ নেওয়া যাবে।";
  return `আপনার বর্ণনায় ${tagText} শনাক্ত হয়েছে। এটি ${categoryBn} হিসেবে উচ্চ অগ্রাধিকারের বিষয়; ${safetyText} আপনি কি এই সমস্যার জন্য আইনি সহায়তা আবেদন ও অভিযোগ নথিভুক্ত করতে চান? হ্যাঁ অথবা না বলুন।`;
}

export interface SeveritySelection {
  categoryId?: string | null;
  subcategoryId?: string | null;
}

export function classifySeverity(
  input: string,
  selection?: SeveritySelection,
): SeverityClassification {
  const text = normalizeText(input);
  const byKeyword = SEVERITY_RULES.filter((rule) =>
    surfaceForms(rule).some((keyword) => text.includes(normalizeText(keyword))),
  );
  const personalContext = hasPersonalProblemContext(text);
  const crisisContext = hasCrisisContext(text);

  const relevant = byKeyword.filter((rule) => {
    // The literal crisis word is no longer required for an emergency. A keyword
    // like "ধর্ষণ" or "যৌনভাবে হয়রানি" already *is* the crisis signal; demanding
    // the caller also say "জরুরি" meant a rape report could be filed as a routine
    // general inquiry. Personal context is still required, so a caller merely
    // asking what the law says about these topics is not auto-escalated.
    if (rule.severity === "emergency") return personalContext;
    return personalContext;
  });

  // A taxonomy pick is authoritative, so it contributes its rule even when the
  // derived question text happens to contain none of the keywords.
  const selectedTag = tagForSelection(selection?.categoryId, selection?.subcategoryId);
  if (selectedTag) {
    const byTag = SEVERITY_RULES.find((rule) => rule.tag === selectedTag);
    if (byTag && !relevant.includes(byTag)) relevant.push(byTag);
  }

  if (relevant.length === 0) {
    return {
      severity: "standard",
      category: "General Inquiry",
      categoryBn: "সাধারণ তথ্য",
      matchedTags: [],
      matchedTagsBn: [],
      factors: [],
      legalBasis: [],
      caseReference: null,
      needsApplicationConfirmation: false,
      acknowledgmentBn: "",
    };
  }

  const severity = highestSeverity(relevant);
  const matchedTags = relevant.map((rule) => rule.tag);
  const matchedTagsBn = relevant.map((rule) => rule.tagBn);
  // Report the most severe rule's category, not merely the first match. A cyber
  // report that is also a Category A sexual-violence matter must be filed as
  // Immediate Crisis, otherwise the sensitive-case handling is never applied.
  const dominant = relevant.reduce((a, b) => (SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a));
  const category = dominant.category;
  const categoryBn = dominant.categoryBn;
  const factors = Array.from(new Set(relevant.flatMap((rule) => rule.factors)));
  if (crisisContext && !factors.includes("Immediate Physical Safety Risk")) {
    factors.push("Immediate Physical Safety Risk");
  }
  const legalBasis = Array.from(new Set(relevant.flatMap((rule) => rule.legalBasis)));
  const caseReference = relevant.find((rule) => rule.caseReference)?.caseReference ?? null;

  return {
    severity,
    category,
    categoryBn,
    matchedTags,
    matchedTagsBn,
    factors,
    legalBasis,
    caseReference,
    needsApplicationConfirmation: true,
    acknowledgmentBn: buildAcknowledgment(severity, categoryBn, matchedTagsBn),
  };
}

export function getSeverityClassificationKnowledgeBlock(): string {
  const taxonomy = SEVERITY_RULES.map(
    (rule) =>
      `${rule.tag}: ${rule.tagBn}; category=${rule.category}; screening_level=${rule.severity}; factors=${rule.factors.join(", ")}; legal_basis=${rule.legalBasis.join(", ")}`,
  ).join("\n");
  const factors = Object.entries(FACTOR_DEFINITIONS)
    .map(([name, meaning]) => `${name}: ${meaning}`)
    .join("\n");
  return `[Severity Screening Knowledge Base]
The following taxonomy is a screening aid, not a final legal or eligibility decision. A human DLAO must confirm the facts.
${taxonomy}
[Priority factors]
${factors}
[Case-informed operating principles]
${CASE_KNOWLEDGE.join("\n")}
[Application routing]
When a caller describes a personal matter matching a non-standard severity tag, acknowledge the matching category and relevant factors, then ask whether the caller wants to proceed with a legal-aid problem application. If the caller says yes, move to the problem intake phase. If no, acknowledge the choice and invite another general question. Never auto-file, auto-reject, invent facts, or expose internal tag names to the caller.`;
}

export function getSeverityFactorsMeaning(): Record<string, string> {
  return { ...FACTOR_DEFINITIONS };
}

/**
 * The urgency/priority vocabulary stored on an application.
 *
 * These live beside the classifier rather than in the route because a backfill has
 * to reproduce them exactly. `urgency` deliberately keeps `emergency_danger` as a
 * distinct value: flattening it to `urgent` would lose the difference between "in
 * immediate danger" and "needs attention soon", which is the distinction the DLAO
 * triages on.
 */
export function urgencyForSeverity(severity: SeverityLevel): string {
  if (severity === "emergency") return "emergency_danger";
  if (severity === "high" || severity === "priority") return "urgent";
  return "normal";
}

export function priorityForSeverity(severity: SeverityLevel): string {
  if (severity === "emergency") return "urgent";
  if (severity === "standard") return "normal";
  return "high";
}
