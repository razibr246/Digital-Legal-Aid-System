/**
 * Recommends a panel lawyer for a specific case.
 *
 * Called "AI" at the desk, but deliberately deterministic and rule-based. A DLAO is
 * being asked to make a legal-aid appointment that an applicant can challenge, and
 * "the model said so" is not a defensible answer. Every recommendation therefore
 * carries the reasons that produced it, and the same case always yields the same
 * ranking — which is also what makes it testable.
 *
 * Four signals, in descending weight:
 *   1. specialisation match   — does this lawyer actually do this kind of case
 *   2. jurisdiction           — a lawyer outside the district costs travel the
 *                               applicant cannot afford
 *   3. current load           — spread the work
 *   4. overdue steps          — someone already behind is a worse choice
 *
 * Load and overdue only ever *reduce* a ranking; they can never make a specialist for
 * the wrong area look like the right one. That ordering is the point: a perfectly
 * matched lawyer who is busy still beats an idle generalist.
 */

import type { LawyerSummary } from "./lawyer-assignment";

/**
 * Bangla keywords that mark a specialisation as covering a category. Matched as
 * substrings against `panel_lawyers.specialisations`, which is free text a registry
 * clerk typed, so the list is deliberately generous about spelling.
 */
const CATEGORY_SPECIALISATION: Record<string, string[]> = {
  cyber: ["সাইবার", "ডিজিটাল", "ইন্টারনেট", "অনলাইন"],
  family: ["পারিবারিক", "সন্তান", "হেফাজত", "custody"],
  dowry: ["যৌতুক", "দাম্পত্য", "নারী"],
  dowry_violence: ["নারী", "নির্যাতন", "ডিজিটাল"],
  maintenance: ["ভরণপোষণ", "পারিবারিক", "সন্তান"],
  cheque: ["চেক", "ঋণ", "দেনা"],
  agri_land: ["জমি", "সম্পত্তি", "ভূমি"],
  non_agri_land: ["সম্পত্তি", "ভূমি", "জমি"],
  inheritance: ["উত্তরাধিকার", "সম্পত্তি", "জমি"],
  land: ["জমি", "সম্পত্তি", "ভূমি"],
  labour: ["শ্রম", "বেতন", "কর্মঘাত", "মজুরি"],
  mediation: ["মধ্যস্থতা", "সালিশ"],
  property: ["সম্পত্তি", "ভূমি"],
  general: [],
};

export type MatchReasonCode = "specialisation" | "jurisdiction" | "capacity" | "track_record";

export interface MatchReason {
  code: MatchReasonCode;
  bn: string;
  /** Signed contribution to the score, so the arithmetic is inspectable. */
  weight: number;
}

export interface LawyerRecommendation {
  lawyer: LawyerSummary;
  /** 0-100, comparable between lawyers for the same case. */
  score: number;
  reasons: MatchReason[];
  /** True when the lawyer's specialisation covers this case's category. */
  specialist: boolean;
}

const WEIGHTS = {
  specialisation: 55,
  jurisdiction: 20,
  capacity: 15,
  trackRecord: 10,
} as const;

/** Load penalty per live appointment, and per overdue step. */
const LOAD_PENALTY = 6;
const OVERDUE_PENALTY = 5;
const CAPACITY_CAP = WEIGHTS.capacity;

export function recommendLawyers(
  caseFacts: { categoryId: string | null; district: string | null },
  roster: LawyerSummary[],
  limit = 3,
): LawyerRecommendation[] {
  const keywords = CATEGORY_SPECIALISATION[caseFacts.categoryId ?? ""] ?? CATEGORY_SPECIALISATION.general;
  const district = (caseFacts.district ?? "").trim();

  const scored = roster.map((lawyer) => {
    const reasons: MatchReason[] = [];
    let score = 0;

    const specs = (lawyer.specialisations ?? "").toLowerCase();
    const specialist = Boolean(keywords.length && keywords.some((k) => specs.includes(k.toLowerCase())));
    if (specialist) {
      score += WEIGHTS.specialisation;
      reasons.push({
        code: "specialisation",
        bn: `এই ধরনের মামলায় বিশেষায়ন আছে (${lawyer.specialisations})`,
        weight: WEIGHTS.specialisation,
      });
    }

    if (district && (lawyer.jurisdiction ?? "").trim() === district) {
      score += WEIGHTS.jurisdiction;
      reasons.push({ code: "jurisdiction", bn: `একই জেলার অধিকারক্ষেত্র (${district})`, weight: WEIGHTS.jurisdiction });
    }

    // Capacity: full marks for an empty book, tapering to zero at five cases.
    const capacity = Math.max(0, CAPACITY_CAP - lawyer.activeAssignments * LOAD_PENALTY);
    if (capacity > 0) {
      score += capacity;
      reasons.push({
        code: "capacity",
        bn: lawyer.activeAssignments === 0 ? "বর্তমানে কোনো সক্রিয় কেস নেই" : `${lawyer.activeAssignments}টি সক্রিয় কেস`,
        weight: capacity,
      });
    }

    // Being already behind is a reason to avoid someone, never a reason to prefer them.
    if (lawyer.overdueActions === 0) {
      score += WEIGHTS.trackRecord;
      reasons.push({ code: "track_record", bn: "কোনো ধাপ সময় পেরিয়ে যায়নি", weight: WEIGHTS.trackRecord });
    } else {
      score -= lawyer.overdueActions * OVERDUE_PENALTY;
      reasons.push({
        code: "track_record",
        bn: `${lawyer.overdueActions}টি ধাপ সময় পেরিয়েছে`,
        weight: -lawyer.overdueActions * OVERDUE_PENALTY,
      });
    }

    return {
      lawyer,
      score: Math.max(0, Math.min(100, Math.round(score))),
      reasons,
      specialist,
    } satisfies LawyerRecommendation;
  });

  return scored
    .filter((r) => r.lawyer.assignable)
    .sort((a, b) => {
      // A specialist for this case always leads. Otherwise the highest score does.
      if (a.specialist !== b.specialist) return a.specialist ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      if (a.lawyer.activeAssignments !== b.lawyer.activeAssignments) {
        return a.lawyer.activeAssignments - b.lawyer.activeAssignments;
      }
      return a.lawyer.name.localeCompare(b.lawyer.name, "bn");
    })
    .slice(0, limit);
}

/**
 * The one-line justification shown above the list. Says what the recommendation is
 * *for*, not just that a model produced it.
 */
export function summariseRecommendation(
  caseFacts: { categoryId: string | null; categoryBn: string | null },
  recommendations: LawyerRecommendation[],
): string {
  if (recommendations.length === 0) {
    return "এই মামলার জন্য বর্তমানে নিয়োগযোগ্য কোনো আইনজীবী নেই। তালিকায় নেই এমন আইনজীবীকে নিয়োগ দেওয়া যাবে না।";
  }
  const top = recommendations[0];
  const basis = caseFacts.categoryBn ? `"${caseFacts.categoryBn}" মামলার জন্য` : "এই মামলার জন্য";
  if (top.specialist) {
    return `${basis} ${top.lawyer.name} সবচেয়ে উপযুক্ত। বিশেষায়ন, জেলা ও বর্তমান ভার — এই তিনটি বিবেচনায় সর্বোচ্চ নম্বর পেয়েছেন।`;
  }
  // The fallback must still name someone. An officer reading a summary that explains
  // the reasoning but never says who it decided on has been told nothing actionable.
  return `${basis} কোনো আইনজীবীর সরাসরি বিশেষায়ন নেই। তাই সবচেয়ে কম ভার ও স্পষ্ট রেকর্ডের ভিত্তিতে ${top.lawyer.name} সুপারিশ করা হলো।`;
}
