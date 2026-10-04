/**
 * Embedded Knowledge Base: Bangladesh Legal Aid Statutes & Statutory Remedies
 *
 * Provides instant, zero-latency retrieval of exact legal acts, procedural remedies,
 * court jurisdictions, and NLASO government aid guidelines.
 */

export interface LegalStatute {
  category: string;
  actTitle: string;
  actTitleBn: string;
  sections: string[];
  remedySummaryBn: string;
  proceduralStepsBn: string[];
  legalAidEligibilityBn: string;
  courtJurisdictionBn: string;
  emergencyContact?: string;
}

export const BANGLADESH_LEGAL_STATUTES: Record<string, LegalStatute> = {
  criminal_bail: {
    category: "criminal_bail",
    actTitle: "Code of Criminal Procedure (CrPC), 1898",
    actTitleBn: "ফৌজদারি কার্যবিধি (CrPC), ১৮৯৮",
    sections: ["Section 496 (Bailable)", "Section 497 (Non-Bailable)", "Section 498 (Anticipatory Bail)"],
    remedySummaryBn:
      "জামিনযোগ্য অপরাধে থানা বা ম্যাজিস্ট্রেট আদালত থেকে জামিন পাওয়া আইনি অধিকার। অজামিনযোগ্য ধারায় নারী, অপ্রাপ্তবয়স্ক, বা অসুস্থ ব্যক্তিদের ক্ষেত্রে বিশেষ বিবেচনায় জামিনের আবেদন করা যায়।",
    proceduralStepsBn: [
      "গ্রেপ্তারের ২৪ ঘণ্টার মধ্যে আদালতে হাজির করতে হবে (ধারা ১৬৭)।",
      "বিজ্ঞ ম্যাজিস্ট্রেট বা দায়রা জজ আদালতে জামিনের আবেদন পেশ করা।",
      "সরকারি আইনগত সহায়তা সংস্থার মাধ্যমে বিনামূল্যে প্যানেল আইনজীবী নিয়োগের আবেদন।"
    ],
    legalAidEligibilityBn: "অসচ্ছল হাজতি বা বিনা বিচারে আটক যে কেউ জাতীয় আইনগত সহায়তা সংস্থার মাধ্যমে ১০০% বিনামূল্যে আইনজীবী পাবেন।",
    courtJurisdictionBn: "চিফ জুডিসিয়াল ম্যাজিস্ট্রেট আদালত / মহানগর দায়রা জজ আদালত",
    emergencyContact: "জাতীয় আইনগত সহায়তা হেল্পলাইন: ১৬৬৯৯",
  },

  domestic_violence: {
    category: "domestic_violence",
    actTitle: "Domestic Violence (Prevention and Protection) Act, 2010 & Nari O Shishu Nirjatan Daman Ain, 2000",
    actTitleBn: "পারিবারিক সহিংসতা (প্রতিরোধ ও সুরক্ষা) আইন, ২০১০ এবং নারী ও শিশু নির্যাতন দমন আইন, ২০০০",
    sections: ["Section 11(ক)/(খ)/(গ) (Dowry Violence)", "Section 14 (Protection Order)", "Section 15 (Residence Order)"],
    remedySummaryBn:
      "শারীরিক, মানসিক বা অর্থনৈতিক নির্যাতনের শিকার নারীরা فوری সুরক্ষা আদেশ, নিরাপদ আশ্রয়ের অধিকার এবং অন্তর্বর্তীকালীন ভরণপোষণের আদেশ চাইতে পারেন।",
    proceduralStepsBn: [
      "থানায় তাৎক্ষণিক জিডি (GD) বা এজাহার দায়ের।",
      "নিকটস্থ উপজেলা নির্বাহী কর্মকর্তা (UNO) বা সুরক্ষা কর্মকর্তার মাধ্যমে আদালতে আবেদন।",
      "মেডিকেল রিপোর্ট সংরক্ষণ এবং ওয়ান-স্টপ ক্রাইসিস সেন্টার (OCC)-এ যোগাযোগ।"
    ],
    legalAidEligibilityBn: "যেকোনো নির্যাতনের শিকার নারী ও শিশু মাসিক আয় নির্বিশেষে ১০০% বিনামূল্যে সরকারি আইনগত সহায়তা পাওয়ার অধিকারী।",
    courtJurisdictionBn: "নারী ও শিশু নির্যাতন দমন ট্রাইব্যুনাল / জুডিসিয়াল ম্যাজিস্ট্রেট আদালত",
    emergencyContact: "নারী ও শিশু নির্যাতন প্রতিরোধ হেল্পলাইন: ১০৯ অথবা জাতীয় জরুরি সেবা: ৯৯৯",
  },

  land_dispute: {
    category: "land_dispute",
    actTitle: "Specific Relief Act, 1877 & Land Crime Prevention and Redress Act, 2023",
    actTitleBn: "সুনির্দিষ্ট প্রতিকার আইন, ১৮৭৭ এবং ভূমি অপরাধ প্রতিরোধ ও প্রতিকার আইন, ২০২৩",
    sections: ["Section 9 (Suit by person dispossessed of immovable property)", "Land Crime Act 2023 Section 4-8"],
    remedySummaryBn:
      "জোরপূর্বক বা বেআইনিভাবে জমি থেকে উচ্ছেদ করা হলে মালিকানার প্রমাণ ছাড়াই ৬ মাসের মধ্যে দখল পুনরুদ্ধারের মামলা করা যায়। ২০২৩ সালের নতুন আইনে জাল দলিল ও জোরপূর্বক দখলের জন্য কারাদণ্ডের বিধান রয়েছে।",
    proceduralStepsBn: [
      "উচ্ছেদের তারিখ থেকে ৬ মাসের মধ্যে দেওয়ানি আদালতে ধারা ৯ মোতাবেক মামলা দায়ের।",
      "জেলা লিগ্যাল এইড অফিসে (DLAO) বিকল্প বিরোধ নিষ্পত্তি (ADR) বা সালিশের জন্য আবেদন।",
      "সহকারী কমিশনার (ভূমি) বা নির্বাহী ম্যাজিস্ট্রেটের কাছে শান্তিশৃঙ্খলা বজায় রাখার আবেদন (ধারা ১৪৫ CrPC)।"
    ],
    legalAidEligibilityBn: "বার্ষিক আয় অনধিক ১,৫০,০০০ টাকা হলে দেওয়ানি মামলার কোর্ট ফি ও আইনজীবী সরকারি খরচে বহন করা হয়।",
    courtJurisdictionBn: "সহকারী জজ আদালত / যুগ্ম জেলা জজ আদালত",
    emergencyContact: "ভূমি সেবা হেল্পলাইন: ১৬১২২",
  },

  labor_wage: {
    category: "labor_wage",
    actTitle: "Bangladesh Labour Act, 2006 (Amended 2018)",
    actTitleBn: "বাংলাদেশ শ্রম আইন, ২০০৬ (সংশোধিত ২০১৮)",
    sections: ["Section 33 (Grievance Procedure)", "Section 120-124 (Payment of Wages)"],
    remedySummaryBn:
      "বকেয়া বেতন, ওভারটাইম, বা অন্যায়ভাবে চাকরিচ্যুত করা হলে মালিকের কাছে লিখিত অভিযোগ দেওয়ার পর শ্রম আদালতে সরাসরি মামলা করা যায়।",
    proceduralStepsBn: [
      "ঘটনার ৩০ দিনের মধ্যে মালিকের কাছে রেজিস্ট্রি ডাকযোগে লিখিত অভিযোগ পেশ।",
      "মালিক সমাধান না দিলে পরবর্তী ৩০ দিনের মধ্যে শ্রম আদালতে আবেদন।",
      "কলকারখানা ও প্রতিষ্ঠান পরিদর্শন অধিদপ্তর (DIFE)-এ অভিযোগ দাখিল।"
    ],
    legalAidEligibilityBn: "শ্রমিক, দিনমজুর বা অপ্রাতিষ্ঠানিক খাতের যেকোনো ব্যক্তি সম্পূর্ণ বিনামূল্যে সরকারি লিগ্যাল এইড পাবেন।",
    courtJurisdictionBn: "শ্রম আদালত (Labour Court)",
    emergencyContact: "শ্রম অধিদপ্তর হেল্পলাইন: ১৬১৯৯",
  },

  family_dower_maintenance: {
    category: "family_dower_maintenance",
    actTitle: "Family Courts Act, 2023 & Muslim Family Laws Ordinance, 1961",
    actTitleBn: "পারিবারিক আদালত আইন, ২০২৩ এবং মুসলিম পারিবারিক আইন অধ্যাদেশ, ১৯৬১",
    sections: ["Section 5 (Jurisdiction)", "Dower (দেনমোহর)", "Maintenance (খোরপোষ)", "Guardianship (সন্তানের হেফাজত)"],
    remedySummaryBn:
      "দেনমোহর এবং সন্তান ও স্ত্রীর খোরপোষ দাবি আইনগত বাধ্যবাধকতা। দেনমোহর তলবমাত্র পরিশোধযোগ্য। সন্তানের বয়সসীমা পর্যন্ত পিতার ভরণপোষণ প্রদান বাধ্যতামূলক।",
    proceduralStepsBn: [
      "পারিবারিক আদালতে দেনমোহর ও ভরণপোষণের মোকদ্দমা দায়ের (কোর্ট ফি মাত্র ৫০ টাকা)।",
      "বিচার শুরুর পূর্বে বাধ্যতামূলক প্রাক-বিচার আপস নিষ্পত্তি (Pre-trial conciliation)।",
      "রায় অমান্য করলে দেওয়ানি আটকাদেশ ও ডিক্রি জারির মাধ্যমে অর্থ আদায়।"
    ],
    legalAidEligibilityBn: "অসহায় নারী, তালাকপ্রাপ্তা স্ত্রী বা বিধবা নারীরা সরকারি খরচে আইনজীবী ও সহায়তা পাবেন।",
    courtJurisdictionBn: "পারিবারিক আদালত (Family Court)",
    emergencyContact: "জাতীয় আইনগত সহায়তা হেল্পলাইন: ১৬৬৯৯",
  },

  cyber_harassment: {
    category: "cyber_harassment",
    actTitle: "Cyber Security Act, 2023 & Penal Code, 1860",
    actTitleBn: "সাইবার নিরাপত্তা আইন, ২০২৩ ও দণ্ডবিধি, ১৮৬০",
    sections: ["Section 24 (Cyber Blackmail)", "Section 26 (Identity Fraud)", "Section 509 (Insulting Modesty of Woman)"],
    remedySummaryBn:
      "ফেসবুক বা ইন্টারনেটে ছবি বিকৃত করা, ভুয়া আইডি তৈরি বা ব্ল্যাকমেইলের শিকার হলে প্রমাণ (স্ক্রিনশট, লিংক) সংরক্ষণ করে দ্রুত সাইবার ক্রাইম তদন্ত উইং বা থানায় এজাহার করতে হয়।",
    proceduralStepsBn: [
      "ডিজিটাল প্রমাণ (চ্যাট হিস্ট্রি, প্রোফাইল লিংক, স্ক্রিনশট) সংরক্ষণ করা।",
      "নিকটস্থ থানায় এজাহার দায়ের অথবা সিআইডি (CID) সাইবার পুলিশ সেন্টারে যোগাযোগ।",
      "জেলা লিগ্যাল এইড অফিসারের জরুরি ডেস্কে অবিলম্বে রেফারেল।"
    ],
    legalAidEligibilityBn: "সাইবার হয়রানির শিকার যে কেউ সম্পূর্ণ বিনামূল্যে আইনগত সহায়তা ও নিরাপত্তা পরামর্শ পাবেন।",
    courtJurisdictionBn: "সাইবার ট্রাইব্যুনাল / ম্যাজিস্ট্রেট আদালত",
    emergencyContact: "জাতীয় জরুরি সেবা: ৯৯৯ অথবা জাতীয় আইনগত সহায়তা হেল্পলাইন: ১৬৬৯৯",
  }
};

/**
 * Fast in-memory legal statute lookup by keyword or category.
 */
export function lookupStatute(categoryOrKeyword: string): LegalStatute | null {
  const query = categoryOrKeyword.toLowerCase().trim();

  // 1. Direct key match
  if (BANGLADESH_LEGAL_STATUTES[query]) {
    return BANGLADESH_LEGAL_STATUTES[query];
  }

  // 2. Semantic keywords mapping
  if (/জামিন|bail|গ্রেপ্তার|arrest|পুলিশ|hajat|faujdari/i.test(query)) {
    return BANGLADESH_LEGAL_STATUTES.criminal_bail;
  }
  if (/যৌতুক.{0,8}দাবি|dowry.{0,8}demand/i.test(query)) {
    return null;
  }
  if (/মারধর|নির্যাতন|যৌতুক|dowry|violence|স্বামীর|shishu|nari|domestic/i.test(query)) {
    return BANGLADESH_LEGAL_STATUTES.domestic_violence;
  }
  if (/জমি|দলিল|উচ্ছেদ|দখল|land|property|khotian|dispossess/i.test(query)) {
    return BANGLADESH_LEGAL_STATUTES.land_dispute;
  }
  if (/বেতন|মজুর|শ্রমিক|ছাঁটাই|factory|labor|salary|wage/i.test(query)) {
    return BANGLADESH_LEGAL_STATUTES.labor_wage;
  }
  if (/দেনমোহর|ডিভোর্স|তালাক|খোরপোষ|বাচ্চা|সন্তান|ফ্যামিলি|পারিবারিক|dower|family/i.test(query)) {
    return BANGLADESH_LEGAL_STATUTES.family_dower_maintenance;
  }
  if (/সাইবার|ব্ল্যাকমেইল|ছবি|ফেসবুক|ইন্টারনেট|cyber|blackmail|harassment/i.test(query)) {
    return BANGLADESH_LEGAL_STATUTES.cyber_harassment;
  }

  return null;
}
