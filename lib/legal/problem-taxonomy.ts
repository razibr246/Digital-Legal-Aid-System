/**
 * Problem-statement taxonomy for the manual application form.
 *
 * Source: the DLAO section/sub-section list in `reg_category_subcategory/`. The
 * source PDF's Mangal font has a broken ToUnicode map (vowel signs are emitted
 * before their consonant with a stray space), so the text is authored here rather
 * than parsed at runtime — it is data, not something to re-derive on every load.
 *
 * Titles are deliberately plain language. The statute and section are kept in
 * `actBn` for the officer's benefit but are never shown in the picker: "State
 * Acquisition & Tenancy Act, 1950, section 96" is meaningless to a caller, and
 * the earlier statute-titled categories were the ones people bounced off.
 *
 * `other` is not a category with sub-categories: picking it reveals a free-text
 * box, because a caller whose problem is genuinely unlisted must still be able to
 * file rather than pick the nearest wrong bucket.
 */

export interface ProblemSubcategory {
  id: string;
  bn: string;
  en: string;
}

export interface ProblemCategory {
  id: string;
  bn: string;
  en: string;
  /** Shown to officers, never in the caller-facing picker. */
  actBn: string;
  subcategories: ProblemSubcategory[];
  /** Selecting this reveals a free-text box instead of a sub-category list. */
  freeText?: boolean;
}

export const OTHER_CATEGORY_ID = "other";

/**
 * Sentinel sub-category, offered at the end of *every* real category.
 *
 * Scoped by category id, so `family`/`other` and the top-level `other` category are
 * different things and cannot collide. It exists because the 10 listed
 * sub-categories are a guide, not a closed list: a caller whose cyber bullying is
 * not on the list must still be able to say so in their own words rather than
 * pick the nearest wrong option or abandon the form.
 */
export const OTHER_SUBCATEGORY_ID = "other";
export const OTHER_SUBCATEGORY_BN = "অন্যান্য — নিজের সমস্যা লিখুন";
export const OTHER_SUBCATEGORY_EN = "Other — describe your own problem";

/** Every category's sub-category tiles, real ones first, then the escape hatch. */
export function listSubcategoryOptions(
  categoryId: string | null | undefined,
): ProblemSubcategory[] {
  const category = getProblemCategory(categoryId);
  if (!category || category.freeText) return [];
  return [
    ...category.subcategories,
    { id: OTHER_SUBCATEGORY_ID, bn: OTHER_SUBCATEGORY_BN, en: OTHER_SUBCATEGORY_EN },
  ];
}

/** True when the caller picked the per-category free-text escape hatch. */
export function isOtherSubcategory(subcategoryId: string | null | undefined): boolean {
  return subcategoryId === OTHER_SUBCATEGORY_ID;
}

export const PROBLEM_CATEGORIES: ProblemCategory[] = [
  {
    id: "family",
    bn: "পারিবারিক বিষয় ও সন্তান",
    en: "Family matters & children",
    actBn: "পারিবারিক আদালত আইন",
    subcategories: [
      { id: "f1", bn: "স্বামী/স্ত্রী আপনাকে সঠিকভাবে বোঝেন না, বা সংসার ছেড়ে চলে গেছেন?", en: "My spouse does not understand me, or has left the marriage" },
      { id: "f2", bn: "বিবাহবিচ্ছেদ বা তালাক নিয়ে আইনি জটলতা তৈরি হয়েছে?", en: "There is a legal dispute about separation or divorce" },
      { id: "f3", bn: "স্বামী/স্ত্রী আপনাকে বা সন্তানকে ভরণপোষণ দেননি?", en: "My spouse is not paying maintenance for me or the children" },
      { id: "f4", bn: "তালাক বা দাম্পত্য বিচ্ছেদের পর সন্তানের হক্ষের বিষয়ে মতভেদ হচ্ছে?", en: "There is disagreement over child custody after a separation" },
      { id: "f5", bn: "বিবাহের সময় দেনমাহির টাকা স্বামী পরিশোধ করেননি?", en: "My husband has not paid the dower agreed at marriage" },
      { id: "f6", bn: "প্রথম স্তরের অনুমতি ছাড়া দ্বিতীয় বিবাহ করা হয়েছে?", en: "A second marriage was contracted without first-permission" },
      { id: "f7", bn: "দেনমাহির বা ভরণপোষণের বকেয়া টাকা আদায়ের জন্য আইনি পদক্ষেপ চাই?", en: "I want legal recovery of unpaid dower or maintenance" },
      { id: "f8", bn: "বাচ্চার সেফলা করার অধিকার থেকে আমাকে বিচ্ছিন্ন করা হয়েছে?", en: "I have been deprived of custody of my child" },
      { id: "f9", bn: "বিবাহ বা তালাকের কাজে ভুয়া, ভুল বা জাল নথিপত্র তৈরি হয়েছে?", en: "Fake or false documents were made for marriage or divorce" },
      { id: "f10", bn: "দাম্পত্য অধিকার পুনর্দায়ের জন্য আদালতে চাই?", en: "I want to go to court to restore my conjugal rights" },
    ],
  },
  {
    id: "rent",
    bn: "বাড়ি ভাড়া ও বাড়িওয়ালা",
    en: "House rent & landlord",
    actBn: "বাড়ি ভাড়া নিয়ন্ত্রণ আইন",
    subcategories: [
      { id: "r1", bn: "চুক্তি ছাড়াই হঠাৎ কের অতিরিক্ত ভাড়া দাবি করা হচ্ছে?", en: "The landlord is demanding extra rent without an agreement" },
      { id: "r2", bn: "নির্দিষ্ট কারণ বা নোটিশ ছাড়া বাসা খালি করার চাপ দেওয়া হচ্ছে?", en: "I am being pressured to vacate without notice" },
      { id: "r3", bn: "নিয়মিত ভাড়া দেওয়া সত্ত্বেও ঘর ছাড়ার হুমকি দেওয়া হচ্ছে?", en: "I pay rent on time but am being threatened with eviction" },
      { id: "r4", bn: "জামানতের টাকা ফেরত দিতে অসীকার করা হচ্ছে?", en: "The security deposit is being refused back" },
      { id: "r5", bn: "ভাড়ার রিসিপ দিতে তালবাহানা করা হচ্ছে?", en: "The landlord is not issuing rent receipts" },
      { id: "r6", bn: "পানি, বিদ্যুৎ বা গ্যাস সংযোগ ইচ্ছাকৃতভাবে কেটে দেওয়া হয়েছে?", en: "Water, electricity or gas has been deliberately cut" },
      { id: "r7", bn: "চুক্তি অনুযায়ী প্রয়োজনীয় মরামত বা রক্ষণাবেক্ষণ করা হয়নি?", en: "Required repairs or maintenance were not done" },
      { id: "r8", bn: "ভাড়াটিয়া ভেতরে অবৈধ কাজ করছেন বা অন্য সাব-লেট চালু করেছেন?", en: "The tenant runs an illegal business or sublets" },
      { id: "r9", bn: "চুক্তির মেয়াদ শেষ হওয়ার আগেই বাড়ি খালি করতে বলা হচ্ছে?", en: "I am told to leave before the agreement ends" },
      { id: "r10", bn: "নির্ধারিত সময়ের চেয়ে অগ্রিম ভাড়া দিতে বাধ্য করা হচ্ছে?", en: "I am being forced to pay advance rent beyond the term" },
    ],
  },
  {
    id: "inheritance",
    bn: "উত্তরাধিকার ও পারিবারিক সম্পত্তি",
    en: "Inheritance & family property",
    actBn: "সিভিল কোড আদালতের এখতিয়ারভুক্ত বন্ধন ও ভাগ",
    subcategories: [
      { id: "i1", bn: "যৌথ জমি বা ওয়ারিশ সম্পত্তির বন্ধন না বা ভাগ করা হচ্ছে?", en: "Joint or inherited property is being partitioned or taken" },
      { id: "i2", bn: "পিতৃক সম্পত্তি থেকে আমার ন্যায্য অংশ বিতিন্ন করা হয়েছে?", en: "I have been excluded from my share of ancestral property" },
      { id: "i3", bn: "জমি মাপেজাখ বা খতিয়ান করতে সমস্যা হচ্ছে?", en: "There is a problem measuring the land or updating the record" },
      { id: "i4", bn: "অনুমতি ছাড়া কেউ যৌথ জমি বা বাড়ি বিক্রি করে দিয়েছে?", en: "Someone sold joint land or a house without my consent" },
      { id: "i5", bn: "ভাগের জমির হিসাব না দেখিয়ে ঝুঁকিপূর্ণ দামে অন্যকে হস্তান্তর করা হয়েছে?", en: "My share was sold cheaply without an account" },
      { id: "i6", bn: "ওয়ারিশ সম্পত্তির অংশ ভাগ না দিয়ে আত্মীয়দের মধ্যে গালাগালি হচ্ছে?", en: "There is conflict over dividing inherited property" },
      { id: "i7", bn: "অন্য অংশীদার যৌথ জমি লিজিদার নামে নিজের নাম করিয়েছে?", en: "A co-sharer has mutated the record into their own name" },
      { id: "i8", bn: "যৌথ জমির ফসল বা ভাড়ার টাকা একা ভাগ করে নেওয়া হচ্ছে?", en: "Crops or rent from joint land are being taken alone" },
      { id: "i9", bn: "নিবন্ধিত জমিতে অন্যকে জমির মালিক বানানো বা দখল দেওয়া হয়েছে?", en: "Someone has given away or encroached on my registered land" },
      { id: "i10", bn: "জমি আলাদা বা বাটায়ারা করার জন্য আইনি পদক্ষেপ চাই?", en: "I want legal help to partition or demarcate the land" },
    ],
  },
  {
    // Statute deliberately omitted from the title: "State Acquisition & Tenancy
    // Act, 1950, section 96" told a caller nothing about pre-emption.
    id: "agri_land",
    bn: "কৃষি জমি সংক্রান্ত বিরোধ",
    en: "Agricultural land dispute",
    actBn: "কৃষি জমি সম্পর্কিত অগ্রক্রয়",
    subcategories: [
      { id: "a1", bn: "পার্শ্ববর্তী বা যৌথ কৃষি জমি আমাকে না জানিয়েই অন্যের কাছে বিক্রি হয়েছে?", en: "My adjacent or joint farm was sold without telling me" },
      { id: "a2", bn: "আমার অংশের জমি অন্যের কাছে গ্যাপেন বা বিক্রি করা হয়েছে?", en: "My share of land was gifted or sold to another" },
      { id: "a3", bn: "সীমানা লঙ্ঘনকারী প্রতিবেশীর ক্ষেত্রে প্রথম ক্রয়ার অধিকার আমাকে দেওয়া হয়নি?", en: "A neighbour encroached and I was denied first refusal" },
      { id: "a4", bn: "জমি বিক্রির বিষয়ে কাউকে লিখিত নোটিশ দেওয়া হয়নি?", en: "No written notice was given about the land sale" },
      { id: "a5", bn: "আমি অগ্রক্রয়ের অধিকার পেয়ে জমিট নিজের নামে নিতে চাই?", en: "I want to claim the land on my own name by right of pre-emption" },
      { id: "a6", bn: "দলিলে ভুল দাম দেখিয়ে কেনাবেচা থেকে আমাকে বিরত রাখার চেষ্টা হচ্ছে?", en: "A false price is being shown to stop me from buying" },
      { id: "a7", bn: "হওয়া কৃষি জমির সঠিক মূল্য নির্ধারণ নিয়ে বিরোধ হয়েছে?", en: "There is a dispute over the valuation of land I bought" },
      { id: "a8", bn: "আমি শরীরক হিসেবে আদালতের মাধ্যমে জমির মালিক নামে নিতে চাই?", en: "I want the land recorded in my name through court as co-sharer" },
      { id: "a9", bn: "জমি বিক্রির রেজিস্ট্রির কতদিনের মধ্যে অগ্রক্রয়ের মামলা করতে হয় জানতে চাই?", en: "How long do I have to file after registration to claim pre-emption" },
      { id: "a10", bn: "পার্শ্ববর্তী জমিতে জরুরি সীমানা দখলের চেষ্টা করা হচ্ছে?", en: "A neighbour is trying to encroach urgently on my land" },
    ],
  },
  {
    id: "non_agri_land",
    bn: "অকৃষি জমি ও সম্পত্তি সংক্রান্ত বিরোধ",
    en: "Non-agricultural land & property dispute",
    actBn: "অকৃষি জমির অগ্রক্রয়",
    subcategories: [
      { id: "n1", bn: "ভবন, প্লট বা অকৃষি জমি আমাকে না জানিয়ে অন্যকে বিক্রি করা হয়েছে?", en: "A building or non-agri plot was sold without telling me" },
      { id: "n2", bn: "আমার অংশের অকৃষি জমির শরীরক নয় এমন কেউ তা জেনে কিনেছে?", en: "A non-co-sharer bought my share of the property" },
      { id: "n3", bn: "প্রথম ক্রয়ার সুযোগ না দিয়ে অন্যকে জমি দেওয়া হয়েছে?", en: "The land was given to another without first refusal" },
      { id: "n4", bn: "অকৃষি জমিতে অগ্রক্রয়ের দাবির মামলা করতে চাই?", en: "I want to file a pre-emption case on non-agri land" },
      { id: "n5", bn: "জমির হস্তান্তরে কোনো নোটিশ আমি বা আমার শরীরক পাইনি?", en: "We received no notice of the transfer" },
      { id: "n6", bn: "ক্রেতা দখল না নিতে চাইলে সীমানা বিরোধ তৈরি হয়েছে?", en: "A boundary dispute arose when the buyer refused possession" },
      { id: "n7", bn: "দলিলের বিক্রয়মূল্যের সাথে আসল বিক্রয়মূল্যের মধ্যে বড় ধরনের তফাৎ আছে?", en: "There is a large gap between the recorded and real price" },
      { id: "n8", bn: "যৌথ শরীরক হিসেবে জমিট হস্তান্তরে বাধা দিতে চাই?", en: "I want to object to the transfer as a legal co-sharer" },
      { id: "n9", bn: "রেজিস্ট্রি করা জমি কেনাবেচায় আমার অধিকার খব থাকা হয়েছে কি?", en: "Is my interest recorded in the registered sale" },
      { id: "n10", bn: "অকৃষি জমিতে আইনগত অগ্রাধিকার দাবি কীভাবে করব?", en: "How do I claim preferential rights over non-agri land" },
    ],
  },
  {
    id: "maintenance",
    bn: "পিতা-মাতা ভরণপোষণ",
    en: "Parent maintenance",
    actBn: "পিতা-মাতা ভরণপোষণ আইন",
    subcategories: [
      { id: "m1", bn: "সন্তানরা বৃদ্ধ পিতা-মাতার খাওয়া-পরা ও চিকিৎসার খরচ দিতে অসীকার করছে?", en: "My adult children refuse to pay for my food and medical care" },
      { id: "m2", bn: "পিতা-মাতাকে সেবা রেখে বা আশ্রয় দিতে অবহেলা করা হচ্ছে?", en: "My elderly parents are being neglected and denied shelter" },
      { id: "m3", bn: "সম্পর্কের নাম লিখে না থাকলে সন্তানরা বাবা-মাকে বাসা থেকে বের করেছে?", en: "Children have put me out because no paternity is recorded" },
      { id: "m4", bn: "একাধিক সন্তান থাকায় একজনের উপর দায়িত্বের পুরো ভার চাপিয়ে দেওয়া হচ্ছে?", en: "The whole burden is being placed on one of several children" },
      { id: "m5", bn: "বৃদ্ধ পিতা-মাতাকে শারীরিক বা মানসিকভাবে অত্যাচার করা হচ্ছে?", en: "My elderly parent is being physically or mentally abused" },
      { id: "m6", bn: "উপার্জনক্ষম সন্তান থাকা সত্ত্বেও অন্যের দায়ে ঘুরতে হচ্ছে?", en: "I am being made to depend on others despite earning children" },
      { id: "m7", bn: "পিতা-মাতাকে একা ফেলে আসা হয়েছে বা অসম চিকিৎসা করা হচ্ছে?", en: "My parent was abandoned or is receiving improper care" },
      { id: "m8", bn: "ভরণপোষণ না দেওয়ার বিরুদ্ধে আইনি ব্যবস্থা নিতে চাই?", en: "I want legal action for withheld maintenance" },
      { id: "m9", bn: "মাসিক নির্দিষ্ট অংশের খরচ বা ভাতা দেওয়ার দাবি সন্তান প্রত্যাখ্যান করছে?", en: "My child refuses a fixed monthly share of expenses" },
      { id: "m10", bn: "পিতা-মাতা ভরণপোষণ আইনের অধীনে কীভাবে সহায়তা পাব?", en: "How can I get help under the parent maintenance law" },
    ],
  },
  {
    // Same reason as agri_land: the section number told the caller nothing.
    id: "cheque",
    bn: "চেক বাউন্স ও ঋণ আদায়",
    en: "Cheque bounce & debt recovery",
    actBn: "চেক বিডসঅনার সংক্রান্ত অভিযোগ",
    subcategories: [
      { id: "c1", bn: "চেক ব্যাংকে জমার পর টাকার অভাবে বাউন্স হয়েছে?", en: "My cheque bounced for insufficiency of funds" },
      { id: "c2", bn: "ব্যবসা বা দেনা পরিশোধের জন্য দেওয়া ৩ লক্ষ টাকার চেক বাউন্স হয়েছে?", en: "A 300,000 taka cheque for a debt or business bounced" },
      { id: "c3", bn: "বাউন্সের পর দেনাদারকে লিগ্যাল নোটিশ বা আইনি নোটিশ পাঠানো হয়েছে?", en: "A legal notice was sent after the cheque bounced" },
      { id: "c4", bn: "লিগ্যাল নোটিশ পাওয়ার ৩০ দিনের মধ্যে টাকা পরিশোধ করা হয়নি?", en: "Payment was not made within 30 days of the legal notice" },
      { id: "c5", bn: "নির্ধারিত মেয়াদের পর ব্যাংক জমা নিতে সমস্যা হচ্ছে?", en: "The bank is causing trouble accepting the deposit after the due date" },
      { id: "c6", bn: "অ্যাকাউন্ট বন্ধ করার কারণে চেক প্রত্যাখ্যান করা হয়েছে?", en: "The cheque was refused because the account was closed" },
      { id: "c7", bn: "স্বাক্ষর না মেলার অজুহাতে চেক ফেরত এসেছে?", en: "The cheque was returned citing a signature mismatch" },
      { id: "c8", bn: "নির্ধারিত ৩০ দিনের লিগ্যাল নোটিশের সময় পার হয়ে গেছে?", en: "The 30-day legal notice period has already passed" },
      { id: "c9", bn: "৩ লক্ষ টাকা পর্যন্ত পাওনা আদালতের মাধ্যমে কীভাবে আদায় করব?", en: "How do I recover up to 300,000 taka through court" },
      { id: "c10", bn: "ভুয়া বা হারানো চেকে মামলার হুমকি বা নোটিশ দেওয়া হচ্ছে কি?", en: "Am I being threatened over a lost or bounced cheque" },
    ],
  },
  {
    id: "dowry",
    bn: "যৌতুক দাবি ও গ্রহণ",
    en: "Dowry claim & receipt",
    actBn: "যৌতুক নিরোধ আইন",
    subcategories: [
      { id: "d1", bn: "বিয়ের সময় বা পরে স্বামী/শ্বশুরবাড়ির লোকেরা যৌতুক দাবি করছে?", en: "My husband or his family are demanding dowry" },
      { id: "d2", bn: "যৌতুক না দেওয়ায় বিয়ে ভেঙে দেওয়ার হুমকি দেওয়া হচ্ছে?", en: "I am being threatened with divorce over dowry" },
      { id: "d3", bn: "যৌতুক নেওয়া বা দেওয়ার জন্য লিখিত বা মৌখিক চুক্তিতে বাধ্য করা হচ্ছে?", en: "I am being forced into a written or oral dowry agreement" },
      { id: "d4", bn: "যৌতুক দাবির অপরাধে স্বামী বা পরিবারের বিরুদ্ধে অভিযোগ করতে চাই?", en: "I want to complain against my husband or family over dowry" },
      { id: "d5", bn: "যৌতুক নেওয়ার পরও আরও অতিরিক্ত টাকা দাবি করা হচ্ছে?", en: "More money is being demanded even after the dowry was given" },
      { id: "d6", bn: "দাবি মেনে না নেওয়ার কারণে কনে বা তার পরিবারকে হুমকি দেওয়া হচ্ছে?", en: "My daughter or her family is being threatened" },
      { id: "d7", bn: "বিয়ের অনুষ্ঠানে দেওয়া উপহারকে জোর করে যৌতুক হিসেবে দাবি করা হচ্ছে?", en: "Wedding gifts are being claimed as dowry" },
      { id: "d8", bn: "বিয়ের শর্ত হিসেবে আগাম টাকা চাওয়া হয়েছে?", en: "Advance money was demanded as a condition of marriage" },
      { id: "d9", bn: "যৌতুকের টাকা না দেওয়ায় মানসিক নির্যাতন বা হেনস্তা হচ্ছে কি?", en: "Am I being mentally harassed or tortured over dowry" },
      { id: "d10", bn: "যৌতুক নিরোধ আইনের অধীনে আদালতে বা থানায় কীভাবে মামলা করব?", en: "How do I file under the anti-dowry law in court or at the police station" },
    ],
  },
  {
    id: "dowry_violence",
    bn: "যৌতুকজনিত নির্যাতন",
    en: "Violence due to dowry",
    actBn: "নারী ও শিশু নির্যাতন দমন আইন",
    subcategories: [
      { id: "v1", bn: "যৌতুকের টাকা না পাওয়ার কারণে স্ত্রীকে শারীরিক বা মানসিক নির্যাতন করা হচ্ছে?", en: "I am being physically or mentally abused over dowry" },
      { id: "v2", bn: "যৌতুক না দেওয়ায় মারধর করে সাধারণ আঘাত বা জখম করা হয়েছে?", en: "I have been beaten or injured over dowry" },
      { id: "v3", bn: "যৌতুক না দেওয়ায় বাবার বাড়িতে পাঠিয়ে বা ঘর থেকে বের করা হয়েছে?", en: "I have been sent back to my parents or thrown out" },
      { id: "v4", bn: "নির্যাতনের কারণে চিকিৎসা নিতে হয়েছে বা হাসপাতালে ভর্তি হতে হয়েছে?", en: "I needed medical care or hospital admission after the abuse" },
      { id: "v5", bn: "শ্বশুরবাড়ির সদস্যরা একজোট হয়ে গায়ে হাত তুলেছে বা নির্যাতন করেছে?", en: "My in-laws physically attacked me together" },
      { id: "v6", bn: "যৌতুকের দাবিতে নিয়মিত গালিগালাজ, অনাহার বা অবহেলা করা হচ্ছে কি?", en: "I face regular abuse, hunger or neglect over dowry demands" },
      { id: "v7", bn: "আইনি পদক্ষেপ নিলে সংসার ভেঙে যাওয়ার ভয় দেখানো হচ্ছে কি?", en: "I am warned my marriage will end if I take legal action" },
      { id: "v8", bn: "ডাক্তারের মেডিকেল রিপোর্ট সংগ্রহ করেছি কি?", en: "I have a medical report from a doctor" },
      { id: "v9", bn: "থানা বা আদালতে আইনি সুরক্ষার জন্য কীভাবে আবেদন করব?", en: "How do I apply to the police or court for protection" },
      { id: "v10", bn: "যৌতুকের শারীরিক নির্যাতনের জন্য শাস্তির দাবি জানাতে চাই?", en: "I want to claim punishment for physical dowry violence" },
    ],
  },
  {
    id: "cyber",
    bn: "সাইবার নিরাপত্তা ও অনলাইন অপরাধ",
    en: "Cyber security & online offences",
    actBn: "ডিজিটাল নিরাপত্তা আইন, ২০১৮",
    subcategories: [
      { id: "y1", bn: "অনলাইনে আমাকে যৌনভাবে হয়রানি করা হচ্ছে বা অশ্লীল বার্তা/ছবি পাঠানো হচ্ছে?", en: "I am being sexually harassed online or sent obscene messages and images" },
      { id: "y2", bn: "আমার ওপর সাইবার বুলিং বা অনলাইন হয়রানি হচ্ছে, কিংবা আমাকে দিয়েই কাউকে বুলিং করা হচ্ছে?", en: "I am being cyberbullied, or someone is being bullied through me" },
      { id: "y3", bn: "ফেসবুক বা অন্য সোশ্যাল মিডিয়ায় আমার নামে মানহানির ছবি বা পোস্ট ছড়ানো হয়েছে?", en: "Defamatory images or posts about me have been spread on social media" },
      { id: "y4", bn: "আমার অনুমতি ছাড়া ইন্টারনেটে অশ্লীল ছবি বা ভিডিও ছড়ানো হয়েছে?", en: "Obscene images or videos were spread online without my consent" },
      { id: "y5", bn: "ইন্টারনেটে ভয় দেখিয়ে বা মেসেজ ফরওয়ার্ড করে আমাকে ব্ল্যাকমেইল করা হচ্ছে?", en: "I am being blackmailed online with threats or forwarded messages" },
      { id: "y6", bn: "আমার নামে ভুয়া প্রোফাইল খুলে আমার পরিচয় ব্যবহার করে কাউকে ঠকানো হচ্ছে?", en: "A fake profile in my name is being used to deceive people" },
      { id: "y7", bn: "অনলাইনে কারেন্টি অর্ডার বা পণ্য কিনে টাকা নিয়ে পণ্য পাঠানো হয়নি বা ভুল পণ্য এসেছে?", en: "I paid online for goods that were never delivered or were wrong" },
      { id: "y8", bn: "মোবাইল ব্যাংকিং বা অনলাইন ব্যাংকিং থেকে আমার টাকা অপব্যবহার বা চুরি হয়েছে?", en: "Money was misused or stolen from my mobile or online banking" },
      { id: "y9", bn: "আমার ফোন বা অ্যাকাউন্ট হ্যাক করে অন্যের বার্তা, ছবি বা টাকা নিয়ে কাজ করা হচ্ছে?", en: "My phone or account was hacked to access messages, images or money" },
      { id: "y10", bn: "নাবালক সন্তানের অনলাইন শোষণ, হয়রানি বা অবৈধ ছবি/ভিডিও ছড়ানো হয়েছে?", en: "My minor child has been exploited, harassed, or abused online" },
    ],
  },
  {
    id: OTHER_CATEGORY_ID,
    bn: "অন্যান্য — নিজের সমস্যা লিখুন",
    en: "Other — describe your own problem",
    actBn: "সাধারণ বা বিবিধ অভিযোগ",
    subcategories: [],
    freeText: true,
  },
];

export function getProblemCategory(id: string | null | undefined): ProblemCategory | null {
  if (!id) return null;
  return PROBLEM_CATEGORIES.find((c) => c.id === id) ?? null;
}

export function getProblemSubcategory(
  categoryId: string | null | undefined,
  subcategoryId: string | null | undefined,
): ProblemSubcategory | null {
  const category = getProblemCategory(categoryId);
  if (!category || !subcategoryId) return null;
  return category.subcategories.find((s) => s.id === subcategoryId) ?? null;
}
