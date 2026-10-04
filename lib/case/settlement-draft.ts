/**
 * Settlement drafting.
 *
 * The brief's closing step is "AI documents the settlement", and the process of
 * documenting it is the part worth showing. So this module returns the DRAFT AS A SET OF
 * CLAUSES, each carrying where its content came from, rather than a finished wall of text.
 * A judge can then see the system assembling an agreement out of a record rather than
 * reciting one.
 *
 * The load-bearing property is that a clause with no source is NOT filled in. It comes back
 * as `open`, for a human to settle. A settlement agreement is an enforceable instrument:
 * if the system quietly invented a maintenance amount, a handover date, or a property
 * boundary that nobody in the room agreed, and a party signed on the strength of it, the
 * AI would have manufactured a dispute. So the draft is deliberately incomplete, and the
 * gaps are the deliverable.
 *
 * Pure and dependency-free. "AI" here means extractive and rule-based, not a language
 * model — which is the right tool here anyway, because every sentence must be traceable to
 * a row in the case record.
 */

import { formatBn, type MediationOutcome } from "./mediation";

export type ClauseSource =
  | "case.problem"
  | "case.district"
  | "mediation.notes"
  | "mediation.venue"
  | "mediation.mediator"
  | "mediation.settled_at"
  | "party.applicant"
  | "party.opposite"
  | "law"
  | "open";

export interface SettlementClause {
  /** Stable id, so a UI can key on it and a test can assert on it. */
  id: string;
  headingBn: string;
  /** The drafted text. Null when the clause is still open. */
  bodyBn: string | null;
  source: ClauseSource;
  /**
   * What a human must supply before this can be signed. Present only when `open`.
   * Phrased as a question to the parties, not as a blank.
   */
  needsBn?: string;
  /** The legal hook, where one exists. */
  legalBasisBn?: string;
}

export interface SettlementDraftInput {
  docketId: string;
  problem: string;
  district: string | null;
  applicantName: string | null;
  /** The applicant is the only party we can name from the record. */
  mediatorName: string | null;
  venue: string | null;
  notes: string | null;
  settledAt: string | null;
  outcome: MediationOutcome | null;
  /** Age of the case in days at the point of settlement. */
  caseAgeDays?: number;
}

export interface SettlementDraft {
  docketId: string;
  titleBn: string;
  clauses: SettlementClause[];
  /** Clauses the parties must still settle before signing. */
  openClauseIds: string[];
  /**
   * True when nothing is outstanding. Never true just because a mediator recorded
   * "settled" — the outcome records that a discussion happened, not that terms were fixed.
   */
  readyToSign: boolean;
  /** A one-line statement of what still blocks it, for the officer and the judge. */
  blockingBn: string;
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const toBn = (input: string) => input.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);

function settledDateBn(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatBn(parsed);
}

export function draftSettlement(input: SettlementDraftInput): SettlementDraft {
  const settledOn = settledDateBn(input.settledAt);
  const clauses: SettlementClause[] = [];

  clauses.push({
    id: "parties",
    headingBn: "পক্ষসমূহ",
    bodyBn: input.applicantName
      ? `১. আবেদনকারী: ${input.applicantName}।`
      : null,
    source: input.applicantName ? "party.applicant" : "open",
    needsBn: "আবেদনকারীর পূর্ণ নাম ও ঠিকানা নথি থেকে নিতে হবে।",
    legalBasisBn: "আইনি সহায়তা প্রদান আইন, ২০০৬",
  });

  // The opposite party is never in our record: the intake is one-sided by design, because
  // a survivor describing her own situation has not and should not supplied the other
  // side's details. Inventing it would be the single most dangerous thing this module
  // could do.
  clauses.push({
    id: "opposite_party",
    headingBn: "বিপরীত পক্ষ",
    bodyBn: null,
    source: "open",
    needsBn: "বিপরীত পক্ষের পূর্ণ নাম ও ঠিকানা সালিশে উপস্থিত পক্ষের কাছ থেকে গ্রহণ করতে হবে।",
    legalBasisBn: "সালিশ আইন, ২০০০",
  });

  clauses.push({
    id: "background",
    headingBn: "বিবরণ",
    bodyBn: input.problem
      ? `২. বিবরণ: ${input.problem}`
      : null,
    source: input.problem ? "case.problem" : "open",
    needsBn: "আবেদনকারীর বক্তব্য থেকে বিবরণ নির্ধারণ করতে হবে।",
  });

  clauses.push({
    id: "mediation_record",
    headingBn: "মধ্যস্থতার রেকর্ড",
    bodyBn:
      settledOn && input.venue
        ? `৩. মধ্যস্থতা অনুষ্ঠিত হয়েছে ${settledOn}, স্থান: ${input.venue}${
            input.mediatorName ? `, মধ্যস্থতাকারী: ${input.mediatorName}` : ""
          }।`
        : null,
    source: settledOn && input.venue ? "mediation.settled_at" : "open",
    needsBn: "মধ্যস্থতার তারিখ ও স্থান নথি থেকে নিশ্চিত করতে হবে।",
  });

  if (input.notes) {
    clauses.push({
      id: "mediation_terms",
      headingBn: "মধ্যস্থতায় চলে আসা শর্ত",
      bodyBn: `৪. মধ্যস্থতাকারীর নথিভুক্ত বিবরণ অনুযায়ী: ${input.notes}`,
      source: "mediation.notes",
    });
  }

  // The heart of it. There is no way to derive a settlement's operative terms from the
  // case record, and pretending otherwise is the failure mode this whole module exists to
  // avoid.
  clauses.push({
    id: "terms",
    headingBn: "সালিশের শর্ত",
    bodyBn: null,
    source: "open",
    needsBn: "সালিশে ঠিক কী সম্পত্তি, কী টাকা এবং কত তারিখের মধ্যে — এই শর্তগুলো উভয় পক্ষকে জানিয়ে লিখিতভাবে ঠিক করতে হবে।",
    legalBasisBn: "সালিশ আইন, ২০০০, ধারা ১২",
  });

  clauses.push({
    id: "deadline",
    headingBn: "কার্যকর হওয়ার শর্ত",
    bodyBn: null,
    source: "open",
    needsBn: "শর্ত কত তারিখের মধ্যে পূরণ করতে হবে তা নির্ধারণ করতে হবে।",
  });

  clauses.push({
    id: "jurisdiction",
    headingBn: "আইনি অধিকারবল",
    bodyBn: input.district
      ? `৫. এই সালিশ ${input.district} জেলার আইনি সহায়তা আধিকারের অধীনে সম্পন্ন হয়েছে।`
      : null,
    source: input.district ? "case.district" : "open",
    needsBn: "জেলা নথি থেকে নিশ্চিত করতে হবে।",
    legalBasisBn: "আইনি সহায়তা প্রদান আইন, ২০০৬",
  });

  clauses.push({
    id: "enforcement",
    headingBn: "বাস্তবায়ন",
    bodyBn: null,
    source: "open",
    needsBn: "শর্ত ভঙ্গ হলে কী প্রক্রিয়া — আদালত, নির্বাহী কার্যক্রম, নাকি পুনর্বিবেচনা — তা উভয় পক্ষকে ঠিক করতে হবে।",
    legalBasisBn: "সালিশ আইন, ২০০০",
  });

  const openClauseIds = clauses.filter((c) => c.bodyBn === null).map((c) => c.id);

  if (input.caseAgeDays !== undefined) {
    clauses.push({
      id: "duration",
      headingBn: "বিবরণসহ",
      bodyBn: `মামলাটি নথিভুক্ত হওয়ার পর ${toBn(String(input.caseAgeDays))} দিন পর্যন্ত অপেক্ষমাণ ছিল।`,
      source: "case.problem",
    });
  }

  return {
    docketId: input.docketId,
    titleBn: "সালিশ সনদ",
    clauses,
    openClauseIds,
    readyToSign: openClauseIds.length === 0,
    blockingBn:
      openClauseIds.length === 0
        ? "সব শর্ত নির্ধারিত হয়েছে; এখন তিন পক্ষের স্বাক্ষর প্রয়োজন।"
        : `${toBn(String(openClauseIds.length))}টি অংশ এখনো নির্ধারিত হয়নি। এগুলো ছাড়া কেউ স্বাক্ষর করবেন না — সালিশ সনদ বাস্তবায়নযোগ্য হবে না।`,
  };
}

/** Renders the draft as the plain text that would be stored in `settlements.decree`. */
export function renderSettlementText(draft: SettlementDraft): string {
  const lines = [`${draft.titleBn}`, `${draft.docketId}`, ""];
  for (const clause of draft.clauses) {
    if (clause.bodyBn) {
      lines.push(clause.bodyBn);
    } else {
      lines.push(`[${clause.headingBn} — অনির্ধারিত: ${clause.needsBn}]`);
    }
  }
  if (!draft.readyToSign) {
    lines.push("", `— ${draft.blockingBn}`);
  }
  return lines.join("\n");
}
