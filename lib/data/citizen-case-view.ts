/**
 * The applicant's own case, in the shape their dashboard needs.
 *
 * Separate from `/api/portal/cases`, which is a queue projection. This answers three
 * questions a citizen actually asks: who is my lawyer, what is happening to my case,
 * and what happens next. The stage list and the next-step wording come from
 * `lib/case/domain.ts` rather than being written here, so the applicant's view and the
 * DLAO's view cannot disagree about the lifecycle.
 */

import { CASE_STATUSES, type CaseStatus } from "@/lib/case/domain";
import { assessLegalAidEligibility } from "@/lib/case/legal-aid-eligibility";
import type { D1Database } from "@/lib/auth/d1-session";
import { lawyerTrackerView, type LawyerTrackerView } from "./lawyer-tracker-view";

export const STAGE_LABELS_BN: Record<CaseStatus, string> = {
  submitted: "আবেদন গৃহীত",
  review: "যাচাই পর্যালোচনা",
  mediation: "মধ্যস্থতা",
  lawyer: "আইনজীবী নিয়োগ",
  court: "আদালতে দায়ের",
  settled: "সালিশ হয়েছে",
  unresolved: "নিষ্পত্তি হয়নি",
};

/**
 * What the office is expected to be doing at each stage. Shown to the applicant so
 * "nothing is happening" is distinguishable from "this is the next step".
 */
export const STAGE_NEXT_BN: Record<CaseStatus, string> = {
  submitted: "আবেদন নথিভুক্ত হয়েছে। ডিএলএও যাচাই করছেন।",
  review: "ডিএলএও পরিচয় ও আর্থিক অবস্থা যাচাই করছেন।",
  mediation: "মধ্যস্থতা নির্ধারিত হয়েছে। উভয় পক্ষকে সময় জানানো হবে।",
  lawyer: "আপনার প্যানেল আইনজীবী আইনজীবী দায়িত্ব নিয়েছেন। যোগাযোগের অপেক্ষায় থাকুন।",
  court: "মামলা আদালতে দায়ের করা হয়েছে। পরবর্তী শুনানির তারিখ জানানো হবে।",
  settled: "সালিশ সম্পন্ন হয়েছে। আপনি সন্তুষ্ট হলে জানাবেন।",
  unresolved: "বিষয়টি নিষ্পত্তি হয়নি। পুনর্বিবেচনার জন্য যোগাযোগ করুন।",
};

export interface CitizenCaseView {
  caseId: string;
  docketId: string;
  problem: string;
  category: string | null;
  stage: CaseStatus;
  stageLabelBn: string;
  stageNextBn: string;
  stages: { key: CaseStatus; labelBn: string; state: "done" | "current" | "todo" }[];
  sensitive: boolean;
  eligibility: {
    eligible: boolean;
    basisBn: string;
    assuranceBn: string;
    actBn: string;
  };
  lawyer: {
    assignmentId: string;
    name: string;
    barRegistration: string | null;
    phone: string | null;
    email: string | null;
    specialisations: string | null;
    jurisdiction: string | null;
    assignedByName: string | null;
    assignedAt: string;
  } | null;
  timeline: { stage: string; labelBn: string; note: string | null; at: string; byName: string | null }[];
  /** Only present once a lawyer is appointed. */
  tracker: LawyerTrackerView | null;
  updatedAt: string | null;
}

interface Row {
  case_id: string;
  docket_id: string;
  problem: string;
  category: string | null;
  stage: string;
  sensitive: number;
  eligibility_passed: number | null;
  problem_category: string | null;
  problem_subcategory: string | null;
  severity_level: string | null;
  severity_category: string | null;
  has_disability: number;
  gender: string | null;
  employed: number | null;
  monthly_income_bdt: number | null;
  applicant_name: string | null;
  updated_at: string | null;
  // lawyer
  assignment_id: string | null;
  lawyer_name: string | null;
  bar_registration: string | null;
  lawyer_phone: string | null;
  lawyer_email: string | null;
  lawyer_specs: string | null;
  lawyer_jurisdiction: string | null;
  assigned_by_name: string | null;
  assigned_at: string | null;
}

function isStatus(value: string): value is CaseStatus {
  return (CASE_STATUSES as readonly string[]).includes(value);
}

export async function citizenCaseView(db: D1Database, citizenUserId: string): Promise<CitizenCaseView[]> {
  const rows = await db
    .prepare(
      `SELECT c.id AS case_id, c.docket_id, c.problem, c.category, c.stage, c.sensitive,
              c.eligibility_passed, c.problem_category, c.problem_subcategory, c.updated_at,
              a.severity_level, a.severity_category, a.has_disability, a.gender,
              a.employed, a.monthly_income_bdt, a.applicant_name,
              p.id AS assignment_id, p.lawyer_name_bn AS lawyer_name, p.assigned_at,
              p.assigned_by_name_bn AS assigned_by_name,
              pl.bar_registration, pl.phone AS lawyer_phone, pl.email AS lawyer_email,
              pl.specialisations AS lawyer_specs, pl.jurisdiction_district_name AS lawyer_jurisdiction
       FROM cases c
       LEFT JOIN applications a ON a.case_id = c.id
       LEFT JOIN panel_assignments p ON p.case_id = c.id AND p.status = 'active'
       LEFT JOIN panel_lawyers pl ON pl.id = p.panel_lawyer_id
       WHERE c.citizen_user_id = ?
       ORDER BY c.created_at DESC`,
    )
    .bind(citizenUserId)
    .all<Row>();

  const views: CitizenCaseView[] = [];
  for (const row of rows.results) {
    const stage: CaseStatus = isStatus(row.stage) ? row.stage : "submitted";
    const stageIndex = CASE_STATUSES.indexOf(stage);
    // Terminal stages get every step marked done; otherwise the lifecycle is linear up
    // to the current one, so the stepper always reads forward.
    const terminal = stage === "settled" || stage === "unresolved";

    const history = await db
      .prepare(
        `SELECT h.to_stage, h.note, h.at, h.changed_by, u.display_name AS by_name
         FROM case_stage_history h
         LEFT JOIN users u ON u.id = h.changed_by
         WHERE h.case_id = ?
         ORDER BY h.at ASC`,
      )
      .bind(row.case_id)
      .all<{ to_stage: string; note: string | null; at: string; by_name: string | null }>();

    const woman = /^(female|woman|নারী|মহিলা)$/i.test((row.gender ?? "").trim());
    const decision = assessLegalAidEligibility({
      gender: row.gender,
      hasDisability: row.has_disability === 1,
      employed: row.employed === null || row.employed === undefined ? null : row.employed === 1,
      monthlyIncome: row.monthly_income_bdt ?? null,
      onlineAbuseAgainstWoman: woman && row.problem_category === "cyber",
      physicallyAbused: woman && row.problem_category !== "cyber" && row.severity_category === "Immediate Crisis & Safety",
      categoryId: row.problem_category ?? row.category,
      subcategoryId: row.problem_subcategory,
    });

    views.push({
      caseId: row.case_id,
      docketId: row.docket_id,
      problem: row.problem,
      category: row.problem_category ?? row.category,
      stage,
      stageLabelBn: STAGE_LABELS_BN[stage],
      stageNextBn: STAGE_NEXT_BN[stage],
      stages: CASE_STATUSES.slice(0, terminal ? CASE_STATUSES.length : stageIndex + 1).map((key, i) => ({
        key,
        labelBn: STAGE_LABELS_BN[key],
        state: terminal || i < stageIndex ? "done" : i === stageIndex ? "current" : "todo",
      })),
      sensitive: row.sensitive === 1 || row.severity_category === "Immediate Crisis & Safety",
      eligibility: {
        // Prefer what was recorded at the time, so a later rule change cannot silently
        // rewrite the assurance the applicant was already shown.
        eligible: decision.eligible,
        basisBn: decision.basisBn,
        assuranceBn: decision.assuranceBn,
        actBn: decision.act.bn,
      },
      lawyer: row.assignment_id && row.lawyer_name
        ? {
            assignmentId: row.assignment_id,
            name: row.lawyer_name,
            barRegistration: row.bar_registration,
            phone: row.lawyer_phone,
            email: row.lawyer_email,
            specialisations: row.lawyer_specs,
            jurisdiction: row.lawyer_jurisdiction,
            assignedByName: row.assigned_by_name,
            assignedAt: row.assigned_at ?? row.updated_at ?? "",
          }
        : null,
      tracker: await lawyerTrackerView(db, citizenUserId, row.case_id),
      timeline: history.results.map((h) => ({
        stage: h.to_stage,
        labelBn: STAGE_LABELS_BN[h.to_stage as CaseStatus] ?? h.to_stage,
        note: h.note,
        at: h.at,
        byName: h.by_name,
      })),
      updatedAt: row.updated_at,
    });
  }
  return views;
}
