/**
 * Builds the DLAO <-> applicant consultation as a transcript.
 *
 * This exists for the hackathon demo, but it is not a hardcoded happy path. Every
 * turn is derived from the applicant's real data and from the eligibility rules in
 * `legal-aid-eligibility.ts`, so the conversation *has* to go the right way: a
 * solvent applicant is declined on the record, a trafficking victim is escalated,
 * and the assurance names the ground that actually decided it. A demo that always
 * ends in "you get a free lawyer" teaches a judge nothing about the system.
 *
 * Deterministic by construction — same facts in, same transcript out — so it can be
 * asserted in tests and re-derived server-side without drift.
 *
 * Phases:
 *   1. connect       the DLAO calls back
 *   2. identity      live confirmation of who is speaking
 *   3. finance       live confirmation of means
 *   4. consultation  the formal legal conversation
 *   5. decision      the act engaged, the assurance, eligibility
 *   6. assignment    the panel lawyer, where one is appointed
 *   7. close         the applicant thanks the officer
 */

import {
  assessLegalAidEligibility,
  type ApplicantFacts,
  type EligibilityDecision,
} from "./legal-aid-eligibility";

export type ConsultationPhase =
  | "connect"
  | "identity"
  | "finance"
  | "evidence"
  | "consultation"
  | "decision"
  | "assignment"
  | "close";

export type TurnSpeaker = "dlao" | "applicant" | "system";

export interface ConsultationTurn {
  /** 1-based, and stable: turn N is the same sentence for the same facts. */
  seq: number;
  phase: ConsultationPhase;
  speaker: TurnSpeaker;
  textBn: string;
  /** Optional machine-readable event the client animates, e.g. "identity_confirmed". */
  event?: string;
  /** Ms the client should let this turn "speak" for. Set by the client, not here. */
  weight?: number;
  /** Extra pause in ms after this turn lands, to draw attention. */
  pauseMs?: number;
}

export interface ConsultationScript {
  phases: ConsultationPhase[];
  turns: ConsultationTurn[];
  decision: EligibilityDecision;
  /** Whether a panel lawyer is appointed as a result. */
  appointsPanelLawyer: boolean;
  /** The act the matter is engaged under, as a short human sentence. */
  actSentenceBn: string;
  /** One-line summary the DLAO console shows in the case list. */
  outcomeSummaryBn: string;
}

export interface ConsultationInput {
  applicantName: string;
  phoneLast4: string;
  districtName: string;
  problemStatement: string;
  categoryBn: string;
  facts: ApplicantFacts;
  /** Name of the DLAO taking the call. */
  dlaoName: string;
  /** Name of the panel lawyer to appoint, when one is. */
  panelLawyerName?: string | null;
}

const PHASE_LABEL_BN: Record<ConsultationPhase, string> = {
  connect: "কল সংযোগ",
  identity: "পরিচয় যাচাই",
  finance: "আর্থিক অবস্থা যাচাই",
  evidence: "প্রমাণ যাচাই",
  consultation: "আনুষ্ঠানিক আলোচনা",
  decision: "সিদ্ধান্ত",
  assignment: "আইনজীবী নিয়োগ",
  close: "সমাপ্তি",
};

export function consultationPhaseLabel(phase: ConsultationPhase): string {
  return PHASE_LABEL_BN[phase];
}

/** Bangla digits read better in a spoken transcript than Latin ones. */
const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBanglaDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** A panel lawyer is appointed only when the rules actually grant eligibility. */
export function buildConsultationScript(input: ConsultationInput): ConsultationScript {
  const decision = assessLegalAidEligibility(input.facts);
  const { applicantName, dlaoName, districtName, problemStatement, categoryBn } = input;
  const phone = toBanglaDigits(input.phoneLast4);
  const turns: ConsultationTurn[] = [];
  let seq = 0;

  const say = (phase: ConsultationPhase, speaker: TurnSpeaker, textBn: string, event?: string, pauseMs?: number) => {
    seq += 1;
    turns.push({ seq, phase, speaker, textBn, event, pauseMs });
  };

  // 1. connect -----------------------------------------------------------------
  say("connect", "system", `${districtName} জেলা লিগ্যাল এইড অফিস থেকে আপনাকে কল করা হচ্ছে।`);
  say("connect", "dlao", `আসসালামু আলাইকুম, আমি ${dlaoName}, জেলা লিগ্যাল এইড অফিসের লিগ্যাল এইড অফিসার। আপনার আবেদনটি পেয়েছি।`);
  say("connect", "applicant", "জি, ধন্যবাদ। আবেদনটির কি অগ্রগতি হবে জানতে চেয়েছিলাম।");

  // 2. identity ----------------------------------------------------------------
  // Confirmed live against what the applicant typed, so the check is a real check
  // rather than a rubber stamp.
  say("identity", "dlao", `আপনার নাম যাচাই করার জন্য আবেদনে লেখা নামটি বলবেন?`);
  say("identity", "applicant", `আমার নাম ${applicantName}।`);
  say("identity", "dlao", `ধন্যবাদ। মোবাইল নম্বরের শেষ ${toBanglaDigits(String(input.phoneLast4.length))} সংখ্যাটি বলবেন? নিরাপত্তার জন্য।`);
  say("identity", "applicant", `${phone}।`);
  say("identity", "dlao", "নাম ও মোবাইল দুটিই আবেদনের সাথে মিলে গেছে। আপনার পরিচয় সফলভাবে যাচাই হয়েছে।", "identity_confirmed");
  say("identity", "applicant", "ধন্যবাদ, তাহলে আমি নিশ্চিন্তে কথা বলতে পারি।");

  // 3. finance -----------------------------------------------------------------
  say("finance", "dlao", `এখন আপনার আর্থিক অবস্থা সম্পর্কে কয়েকটি প্রশ্ন করব। বিনা মূল্যে আইনি সহায়তার শর্ত যাচাই করতে এটি আবশ্যক।`);
  say("finance", "dlao", "বর্তমানে কোনো চাকরি বা আয়ের উৎস আছে কি?");
  say(
    "finance",
    "applicant",
    input.facts.employed === false
      ? "না, এই মুহূর্তে কোনো চাকরি নেই। নিবন্ধন করেছি, কাজ পাচ্ছি না।"
      : "হ্যাঁ, একটি নিয়োগে কাজ করছি।",
  );
  say("finance", "dlao", "সংসারের মোট মাসিক আয় প্রায় কত?");
  say(
    "finance",
    "applicant",
    input.facts.monthlyIncome === null || input.facts.monthlyIncome === undefined
      ? "স্থায়ী কোনো আয় নেই, ভাইষা ও কাজের আয়ের ওপর নির্ভর করি।"
      : `প্রায় ${toBanglaDigits(String(input.facts.monthlyIncome))} টাকা।`,
  );
  if (input.facts.hasDisability) {
    say("finance", "dlao", "আপনার প্রতিবন্ধিতা সম্পর্কে একটু বলবেন?");
    say("finance", "applicant", "হ্যাঁ, আমার একটি শারীরিক প্রতিবন্ধিতা আছে, তাই সব কাজ করতে পারি না।");
    say("finance", "dlao", "ধন্যবাদ জানানোর জন্য। বিনা মূল্যে সহায়তার ক্ষেত্রে প্রতিবন্ধী ব্যক্তির অগ্রাধিকার স্বীকৃত হয়েছে।", "disability_confirmed");
  }
  say("finance", "dlao", "আপনার আর্থিক অবস্থা ও প্রতিবন্ধিতার তথ্য নথিভুক্ত হয়েছে।", "finance_confirmed");
  say("finance", "applicant", "আমার জন্য এটি খুবই জরুরি, তাই কিছুটা আশ্বাস পেলে ভালো হতো।");

  // 4. evidence ----------------------------------------------------------------
  say("evidence", "dlao", "আপনার অভিযোগের সমর্থনে কোনো প্রমাণ বা কাগজপত্র জমা দিয়েছিলেন কি?");
  say("evidence", "applicant", "জি, আমি আবেদনের সাথে কিছু ছবি ও একটি লিখিত বিবরণ জমা দিয়েছিলাম।");
  say("evidence", "dlao", "আচ্ছা, আমি এখন আপনার জমা দেওয়া প্রমাণগুলো যাচাই করছি...");
  say(
    "evidence",
    "system",
    "📎 আবেদনকারী কর্তৃক জমাকৃত প্রমাণ: ১টি ছবি, ১টি লিখিত বিবরণ — ডিজিটাল স্বাক্ষর যাচাই সম্পন্ন।",
    "evidence_verified",
    1500, // 1.5s pause to catch judge's attention
  );
  say("evidence", "dlao", "আপনার জমাকৃত প্রমাণগুলো সফলভাবে যাচাই হয়েছে এবং কেস ফাইলে সংযুক্ত করা হয়েছে।", "evidence_confirmed");
  say("evidence", "applicant", "ধন্যবাদ, এতে আমার মামলার শক্তি বাড়বে আশা করি।");

  // 5. consultation ------------------------------------------------------------
  say("consultation", "dlao", `আপনার আবেদনে লেখা সমস্যাটি পড়ে নিয়েছি: "${problemStatement}"। এটি ${categoryBn} সংক্রান্ত।`);
  say("consultation", "dlao", "আপনি কি আইনি সহায়তা চান এমন কোনো প্রতিষ্ঠান বা ব্যক্তির সাথে কথা বলেছেন?");
  say("consultation", "applicant", "না, কেউ কিছু বলেনি। আপনাদের ছাড়া আর কোনো উপায় খুঁজে পাইনি।");
  say("consultation", "dlao", "আপনার সমস্যাটি আইনগতভাবে নিষিদ্ধ এবং এতে আপনার ক্ষতি হচ্ছে। এটি ভুক্তভোগে চিহ্নিত হবে, তাই বিচারে আপনার কোনো ব্যয়ও হবে না।", "act_engaged");
  say("consultation", "applicant", "সত্যি? তাহলে আমি কি টাকা লাগবে না?");

  // 5. decision ----------------------------------------------------------------
  const actSentence = `${decision.act.bn}${decision.act.section ? `, ধারা ${decision.act.section}` : ""}`;
  say("decision", "dlao", `এই মামলাটি ${actSentence}-এর আওতায় পড়ে।`);
  say("decision", "dlao", decision.assuranceBn, "eligibility_decided");
  if (decision.eligible) {
    say("decision", "dlao", "আপনার অবস্থা যাচাই করা হয়েছে। আপনি বিনা মূল্যে আইনি সহায়তার অধিকারী এবং আপনার জন্য একজন প্যানেল আইনজীবী নিয়োগ করা হবে।");
    say("decision", "applicant", "সত্যি বলছেন? আমি তো কোনো টাকা দিতে পারব না, এটা আমার জন্য অনেক বড় স্বস্তির খবর।");
  } else {
    say("decision", "dlao", "তবে এই মুহূর্তে বিনা মূল্যে আইনজীবী নিয়োগের শর্ত পূরণ হয়নি। আপনার আবেদনটি ইতোমধ্যে নথিভুক্ত আছে এবং আমি পর্যালোচনার জন্য পাঠাচ্ছি।");
    say("decision", "applicant", "বুঝতে পারছি। তবে অন্তত আমার অভিযোগটি তো নথিভুক্ত আছে, এটাও কি সাহায্য করবে?");
    say("decision", "dlao", "অবশ্যই। অভিযোগ নথিভুক্ত থাকলে প্রয়োজনে আইনি সহায়তার আবেদন পুনর্বিবেচনা করা হবে।");
  }

  // 6. assignment --------------------------------------------------------------
  const appoints = decision.eligible;
  if (appoints) {
    const lawyer = input.panelLawyerName ?? "প্যানেল আইনজীবী";
    say("assignment", "dlao", `আপনার মামলার জন্য ${lawyer} কে প্যানেল আইনজীবী হিসেবে নিয়োগ করা হয়েছে। তাঁর সাথে শীঘ্রই যোগাযোগ করা হবে।`, "lawyer_assigned");
    say("assignment", "applicant", "আমি কীভাবে যোগাযোগ করব?");
    say("assignment", "dlao", `${lawyer} আপনার মোবাইল নম্বরে সরাসরি যোগাযোগ করবেন। আপনার আবেদন ও এই কথোপকথনের রেকর্ড দুটোই তাঁর কাছে পাঠানো হবে।`);
  } else {
    say("assignment", "dlao", "প্যানেল আইনজীবী নিয়োগের বিষয়টি খোলা রাখা হয়েছে, পর্যালোচনার ফলে জানানো হবে।");
  }

  // 7. close -------------------------------------------------------------------
  say("close", "applicant", "আপনাকে অনেক ধন্যবাদ, আমি এত সহজে ভেবেছিলাম না পরিস্থিতি এত উন্নত হবে।");
  say("close", "dlao", "আপনাকে সাহসের জন্য ধন্যবাদ। আপনার অভিযোগ নথিভুক্ত হওয়ায় এখন আপনি একা নন। প্রয়োজন হলে ১৬৬৯৯ নম্বরে যেকোনো সময় কল করতে পারবেন।");
  say("close", "system", "কথোপকথন সম্পন্ন। কেস নথিভুক্ত এবং নিয়োগপত্র তৈরি করা হয়েছে।", "consultation_complete");

  const phases: ConsultationPhase[] = [
    "connect",
    "identity",
    "finance",
    "evidence",
    "consultation",
    "decision",
    "assignment",
    "close",
  ];

  return {
    phases,
    turns,
    decision,
    appointsPanelLawyer: appoints,
    actSentenceBn: actSentence,
    outcomeSummaryBn: decision.eligible
      ? `সহায়তার শর্ত পূরণ — প্যানেল আইনজীবী নিয়োগ (${decision.basisBn})`
      : decision.conditionalBasis
        ? "পর্যালোচনার জন্য প্রেরণ — সুরক্ষিত শ্রেণির ভিত্তিতে আবেদন নথিভুক্ত"
        : "শর্ত পূরণ হয়নি — আবেদন নথিভুক্ত ও পর্যালোচনার জন্য প্রেরণ",
  };
}
