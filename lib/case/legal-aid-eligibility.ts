/**
 * Free legal-aid eligibility.
 *
 * The rule this implements, as stated for the service:
 *
 *   "Free government legal aid is available to financially insolvent, unemployed
 *    or unable-to-work people, as well as vulnerable groups such as children,
 *    abused women/children, trafficking or acid-attack victims, destitute/abandoned
 *    women, and persons with disabilities. A woman facing cyberbullying, online
 *    harassment, threats, blackmail or similar abuse may also seek legal aid,
 *    particularly where she is financially unable to pursue justice or falls within
 *    a protected/vulnerable category."
 *
 * That paragraph has three independent limbs, and the third is explicitly a
 * *particularity* — a woman facing online abuse qualifies, but "particularly where"
 * means the abuse alone is weaker than the other grounds and should be reported as
 * such rather than silently treated as equal to trafficking. So each ground returns
 * its own strength and the decision records every ground that applied, not just the
 * first one that matched. An officer can then see exactly why someone passed.
 *
 * Pure and dependency-free, like `lib/case/domain.ts`, so it is testable without a
 * browser and reusable from a route, a server component or a client component. It
 * must never be re-derived in a screen: this is the single answer to "does this
 * person get a free lawyer", and a DLAO's decision has to be explainable.
 */

export type EligibilityStrength = "decisive" | "supporting" | "conditional";

export interface EligibilityGround {
  /** Stable, machine-readable. Branch on this, never on the prose. */
  code: string;
  bn: string;
  en: string;
  strength: EligibilityStrength;
  /** Why this ground applies, for the officer's file. */
  detail: string;
}

export interface EligibilityDecision {
  eligible: boolean;
  /** Every ground that applied, strongest first. Never just the first match. */
  grounds: EligibilityGround[];
  /** The single strongest ground's code — what the verdict is "because of". */
  basis: string | null;
  basisBn: string;
  /**
   * The statute or scheme the matter is engaged under. Never null: an unrecognised
   * category resolves to the general-petition entry rather than leaving the officer
   * with no statute to quote.
   */
  act: { bn: string; en: string; section: string | null };
  /** Short, spoken, human sentence for the applicant. Never a tag name. */
  assuranceBn: string;
  priority: "urgent" | "high" | "standard";
  /** True when eligibility rests on the weaker cyber limb. */
  conditionalBasis: boolean;
}

/**
 * Tri-state on purpose. `false` means "answered no", `null`/`undefined` means
 * "not established". Collapsing the two would be the same mistake as treating
 * unknown income as zero income: it would make an unasked question look like a
 * negative answer and hand someone free legal aid on a technicality.
 */
export interface ApplicantFacts {
  gender?: string | null;
  isChild?: boolean | null;
  /** From the application's own disability field, not inferred from the text. */
  hasDisability?: boolean | null;
  /** Monthly household income in BDT. Unknown is `null`, which is not zero. */
  monthlyIncome?: number | null;
  employed?: boolean | null;
  /** Physically able to work — separate from being employed. */
  ableToWork?: boolean | null;
  destituteOrAbandoned?: boolean | null;
  /** From the severity spec's Category A tags, not from free text. */
  traffickingRisk?: boolean | null;
  acidAttackVictim?: boolean | null;
  physicallyAbused?: boolean | null;
  /** Woman facing cyberbullying, online harassment, threats or blackmail. */
  onlineAbuseAgainstWoman?: boolean | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
}

/**
 * Income ceiling. Deliberately generous and expressed as a household figure: the
 * question is whether this person can fund a lawyer today, not whether they are
 * living in poverty. Someone above it can still pass on a vulnerable ground.
 */
export const MEANS_TEST_MONTHLY_BDT = 15000;

const ACTS: Record<string, { bn: string; en: string; section: string | null }> = {
  cyber: { bn: "ডিজিটাল নিরাপত্তা আইন, ২০১৮", en: "Digital Security Act, 2018", section: null },
  trafficking: { bn: "মানব পাচার প্রতিরোধ ও দমন আইন, ২০১২", en: "Human Trafficking Deterrence and Suppression Act, 2012", section: null },
  violence: { bn: "নারী ও শিশু নির্যাতন দমন আইন, ২০০০", en: "Nari O Shishu Nirjatan Daman Act, 2000", section: null },
  disability: { bn: "প্রতিবন্ধী ব্যক্তির অধিকার ও সুরক্ষা আইন, ২০১৩", en: "Rights and Protection of Persons with Disabilities Act, 2013", section: null },
  acid: { bn: "বিষ প্রয়োগের আইন", en: "Acid Control Act", section: null },
  family: { bn: "পারিবারিক আদালত আইন, ২০২৩", en: "Family Courts Act, 2023", section: "21B" },
  labour: { bn: "বাংলাদেশ শ্রম আইন, ২০০৬", en: "Bangladesh Labour Act, 2006", section: "33" },
  land: { bn: "ভূমি অপরাধ প্রতিরোধ ও প্রতিকার আইন, ২০২৩", en: "Land Crime Prevention and Redress Act, 2023", section: null },
  property: { bn: "সম্পত্তি হস্তান্তর আইন, ১৮৮২", en: "Transfer of Property Act, 1882", section: null },
  cheque: { bn: "নগদীয় দলিল আইন, ১৮৮১", en: "Negotiable Instruments Act, 1881", section: "138" },
  inheritance: { bn: "উত্তরাধিকার আইন, ১৯২৫", en: "Succession Act, 1925", section: null },
  general: { bn: "সাধারণ বিবিধ অভিযোগ", en: "General or miscellaneous petition", section: null },
};

/** The statute each deciding ground engages, so `act` always matches `basis`. */
const ACT_FOR_BASIS: Record<string, { bn: string; en: string; section: string | null }> = {
  trafficking_victim: ACTS.trafficking,
  acid_attack_victim: ACTS.acid,
  abused_woman_or_child: ACTS.violence,
  destitute_abandoned_woman: ACTS.violence,
  child: ACTS.violence,
  person_with_disability: ACTS.disability,
  woman_online_abuse: ACTS.cyber,
};

function actForCategory(categoryId: string | null | undefined) {
  if (!categoryId) return ACTS.general;
  return ACTS[categoryId] ?? ACTS.general;
}

/** Grounds from the "vulnerable groups such as ..." limb. */
const PROTECTED_CODES = new Set([
  "trafficking_victim",
  "acid_attack_victim",
  "abused_woman_or_child",
  "destitute_abandoned_woman",
  "child",
  "person_with_disability",
]);

/** Grounds from the "financially insolvent, unemployed or unable-to-work" limb. */
const MEANS_CODES = new Set(["financially_insolvent", "unemployed", "unable_to_work"]);

function isWoman(gender: string | null | undefined): boolean {
  return typeof gender === "string" && /^(female|woman|নারী|মহিলা)$/i.test(gender.trim());
}

/**
 * The strongest ground decides eligibility, but every ground is returned. Two
 * reasons: an officer appealing a refusal needs the full picture, and the
 * "conditional" cyber limb is meaningless unless the decisive grounds are visible
 * alongside it.
 */
export function assessLegalAidEligibility(facts: ApplicantFacts): EligibilityDecision {
  const grounds: EligibilityGround[] = [];
  const woman = isWoman(facts.gender);

  if (facts.traffickingRisk) {
    grounds.push({
      code: "trafficking_victim",
      bn: "মানব পাচারের শিকার",
      en: "Trafficking victim",
      strength: "decisive",
      detail: "নারী ও শিশু পাচারের শিকার হিসেবে চিহ্নিত।",
    });
  }
  if (facts.acidAttackVictim) {
    grounds.push({
      code: "acid_attack_victim",
      bn: "বিষ প্রয়োগের শিকার",
      en: "Acid-attack victim",
      strength: "decisive",
      detail: "বিষ প্রয়োগের শিকার হিসেবে চিহ্নিত।",
    });
  }
  if (facts.physicallyAbused) {
    grounds.push({
      code: "abused_woman_or_child",
      bn: "নারী বা শিশুর প্রতি সহিংসতার শিকার",
      en: "Abused woman or child",
      strength: "decisive",
      detail: "নারী ও শিশু নির্যাতনের শিকার হিসেবে চিহ্নিত।",
    });
  }
  if (facts.destituteOrAbandoned) {
    grounds.push({
      code: "destitute_abandoned_woman",
      bn: "অসচ্ছল ও পরিত্যক্ত নারী",
      en: "Destitute or abandoned woman",
      strength: "decisive",
      detail: woman ? "অসচ্ছল ও পরিত্যক্ত নারী হিসেবে চিহ্নিত।" : "অসচ্ছল ও পরিত্যক্ত ব্যক্তি হিসেবে চিহ্নিত।",
    });
  }
  if (facts.isChild) {
    grounds.push({
      code: "child",
      bn: "শিশু",
      en: "Child",
      strength: "decisive",
      detail: "নাবালক আবেদক, স্বার্থপ্রতিনিধির মাধ্যমে আবেদন করা হয়েছে।",
    });
  }
  if (facts.hasDisability) {
    grounds.push({
      code: "person_with_disability",
      bn: "প্রতিবন্ধী ব্যক্তি",
      en: "Person with a disability",
      strength: "decisive",
      detail: "প্রতিবন্ধী ব্যক্তি হিসেবে অগ্রাধিকার প্রাপ্য।",
    });
  }

  // Limb one: means. Income unknown is deliberately not treated as zero income —
  // it is recorded as unproven and, on its own, does not grant eligibility.
  const income = facts.monthlyIncome;
  const insolvent = income !== null && income !== undefined && income <= MEANS_TEST_MONTHLY_BDT;
  if (insolvent) {
    grounds.push({
      code: "financially_insolvent",
      bn: "আর্থিকভাবে অক্ষম",
      en: "Financially insolvent",
      strength: "decisive",
      detail: `মাসিক আয় ${income} টাকা, যা সহায়তার সীমার মধ্যে।`,
    });
  }
  if (facts.employed === false) {
    grounds.push({
      code: "unemployed",
      bn: "বেকার",
      en: "Unemployed",
      strength: "decisive",
      detail: "কোনো চাকরি নেই।",
    });
  }
  if (facts.ableToWork === false) {
    grounds.push({
      code: "unable_to_work",
      bn: "কাজ করতে অক্ষম",
      en: "Unable to work",
      strength: "decisive",
      detail: "শারীরিক বা মানসিক কারণে কাজ করতে পারেন না।",
    });
  }

  // Limb three: the protected cyber limb. "Particularly where" makes it weaker than
  // a trafficking or disability ground, so it is recorded as conditional and the
  // assurance says so in plain words rather than implying a certainty.
  if (facts.onlineAbuseAgainstWoman && woman) {
    // The paragraph says a woman facing this abuse "may also seek legal aid,
    // particularly where she is financially unable to pursue justice OR falls within
    // a protected/vulnerable category". So this is a full ground in its own right once
    // either of those is present, and only a conditional one when neither is — the
    // "particularly where" is doing real work here, not decoration.
    const hasProtected = grounds.some((g) => PROTECTED_CODES.has(g.code));
    const hasMeans = grounds.some((g) => MEANS_CODES.has(g.code));
    const strength: EligibilityStrength = hasProtected ? "supporting" : hasMeans ? "decisive" : "conditional";
    grounds.push({
      code: "woman_online_abuse",
      bn: "অনলাইন নির্যাতনের শিকার নারী",
      en: "Woman facing cyberbullying, online harassment, threats or blackmail",
      strength,
      detail:
        strength === "supporting"
          ? "অনলাইন নির্যাতনের শিকার হওয়ায় সুরক্ষিত শ্রেণিতে রয়েছেন।"
          : strength === "decisive"
            ? "অনলাইন নির্যাতনের শিকার এবং আর্থিকভাবে বিচারের খরচ বহনে অক্ষম — দুই শর্তই পূরণ।"
            : "অনলাইন নির্যাতনের শিকার হলেও আর্থিক সামর্থ্য বা সুরক্ষিত শ্রেণির কোনোটিই প্রমাণ করা হয়নি।",
    });
  }

  // Within "decisive", a protected-category ground outranks a means ground. Both
  // grant eligibility, but they are not equally durable: someone who is a trafficking
  // victim or a person with a disability qualifies whatever her income, whereas
  // "unemployed" alone is thin — she would stop qualifying the day she found work.
  // Naming the means ground as the basis would tell her that, which is both wrong and
  // the kind of thing that loses an appeal.
  const VULNERABLE_FIRST = [
    // Where a woman faces online abuse and also meets the means test, the abuse is
    // the substantive reason she is in front of us, so it is named first.
    "woman_online_abuse",
    "trafficking_victim",
    "acid_attack_victim",
    "abused_woman_or_child",
    "destitute_abandoned_woman",
    "child",
    "person_with_disability",
    "financially_insolvent",
    "unable_to_work",
    "unemployed",
  ];
  const rank: Record<EligibilityStrength, number> = { conditional: 0, supporting: 1, decisive: 2 };
  grounds.sort((a, b) => {
    const byStrength = rank[b.strength] - rank[a.strength];
    if (byStrength !== 0) return byStrength;
    return VULNERABLE_FIRST.indexOf(a.code) - VULNERABLE_FIRST.indexOf(b.code);
  });

  const decisive = grounds.find((g) => g.strength === "decisive") ?? null;
  const conditionalOnly = grounds.length > 0 && decisive === null;
  const eligible = decisive !== null;
  const basis = decisive?.code ?? grounds[0]?.code ?? null;

  // The statute quoted must follow the ground that actually decided the case.
  //
  // It used to be picked from the raw flags, which could quote the Digital Security
  // Act while the decision rested on her disability — an applicant reads that as the
  // office having assessed the wrong thing. Deriving it from the basis makes the two
  // impossible to disagree.
  const act = ACT_FOR_BASIS[basis ?? ""] ?? actForCategory(facts.categoryId);

  const assuranceBn = buildAssurance(eligible, decisive, conditionalOnly, woman, facts);

  return {
    eligible,
    grounds,
    basis,
    basisBn: decisive?.bn ?? grounds[0]?.bn ?? "",
    act,
    assuranceBn,
    priority: facts.traffickingRisk || facts.acidAttackVictim || facts.physicallyAbused ? "urgent" : eligible ? "high" : "standard",
    conditionalBasis: conditionalOnly,
  };
}

/**
 * The spoken verdict. Short, in plain Bangla, addressed to the applicant — and it
 * never leaks a tag or a code, which is the one thing the severity spec forbids.
 */
function buildAssurance(
  eligible: boolean,
  decisive: EligibilityGround | null,
  conditionalOnly: boolean,
  woman: boolean,
  facts: ApplicantFacts,
): string {
  if (eligible && decisive) {
    return `${decisive.bn} — এই শ্রেণিতে আপনি বিনা মূল্যে আইনি সহায়তার অধিকারী, তাই আপনার জন্য প্যানেল আইনজীবী নিয়োগ করা হবে।`;
  }
  if (conditionalOnly) {
    return woman
      ? "অনলাইন নির্যাতনের শিকার হিওয়া আপনাকে সুরক্ষা দেয়, তবে বিনা মূল্যে আইনজীবী নিয়োগের জন্য আপনার আর্থিক সামর্থ্য যাচাই করা প্রয়োজন।"
      : "সুরক্ষিত শ্রেণিতে না হওয়ায় বিনা মূল্যে আইনজীবী নিয়োগ সম্ভব হবে না; আপনার আর্থিক সামর্থ্য যাচাই করা হলে পুনর্বিবেচনা করা হবে।";
  }
  if (facts.hasDisability) {
    return "প্রতিবন্ধী ব্যক্তি হিওয়ায় আপনি অগ্রাধিকার প্রাপ্য; তবে আর্থিক সামর্থ্য ও নির্যাতনের বিষয়ে পরীক্ষা করা হয়নি।";
  }
  return "এই তথ্যের ভিত্তিতে বিনা মূল্যে আইনজীবী নিয়োগের শর্ত পূরণ হয়নি; আপনার আবেদনটি নিবন্ধিত আছে এবং পর্যালোচনা করা হবে।";
}
