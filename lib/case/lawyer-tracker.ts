/**
 * The appointed lawyer's obligations, and how far they have got.
 *
 * This exists because "a lawyer was assigned" tells an applicant nothing. Without a
 * recorded list of expected actions with deadlines, "nothing is happening" and "this
 * is the next step" are indistinguishable from outside the office — and an applicant
 * cannot complain about a lawyer going quiet when there is nothing to compare against.
 *
 * Pure, like `lib/case/domain.ts` and `legal-aid-eligibility.ts`, so the plan can be
 * tested without a browser and the same plan is used both to write the rows and to
 * render them. The deadlines shown to the applicant are therefore the deadlines that
 * were actually recorded, not a second set computed at read time.
 */

export type LawyerActionCode =
  | "first_contact"
  | "docs_collected"
  | "advice_given"
  | "notice_prepared"
  | "filed_in_court"
  | "mediation_attended"
  | "report_filed";

export type LawyerTrack = "all" | "court" | "mediation";

export interface LawyerAction {
  code: LawyerActionCode;
  labelBn: string;
  days: number;
  track: LawyerTrack;
}

/** Days allowed for each action after appointment, by track. */
export const LAWYER_ACTION_PLAN: readonly LawyerAction[] = [
  { code: "first_contact", labelBn: "আবেদনকারীর সাথে প্রথম যোগাযোগ", days: 3, track: "all" },
  { code: "docs_collected", labelBn: "প্রয়োজনীয় কাগজপত্র সংগ্রহ", days: 7, track: "all" },
  { code: "advice_given", labelBn: "আইনি পরামর্শ প্রদান", days: 10, track: "all" },
  { code: "notice_prepared", labelBn: "নোটিস প্রস্তুত ও প্রেরণ", days: 14, track: "court" },
  { code: "filed_in_court", labelBn: "আদালতে মামলা দায়ের", days: 30, track: "court" },
  { code: "mediation_attended", labelBn: "মধ্যস্থতায় উপস্থিতি ও প্রতিবেদন", days: 21, track: "mediation" },
  { code: "report_filed", labelBn: "অগ্রগতি প্রতিবেদন জমা", days: 45, track: "all" },
];

export type ActionState = "done" | "due_soon" | "overdue" | "pending" | "na";

export interface TrackedAction {
  code: LawyerActionCode;
  labelBn: string;
  state: ActionState;
  /** Whole days since appointment. */
  elapsedDays: number;
  /** Whole days until the deadline; negative once overdue. */
  daysRemaining: number;
  dueAt: string | null;
  doneAt: string | null;
  noteBn: string | null;
}

const MS_PER_DAY = 86_400_000;

/** "Due soon" is this many days out. Short, because it is a prompt, not a warning. */
export const DUE_SOON_DAYS = 3;

function wholeDays(ms: number): number {
  return Math.floor(ms / MS_PER_DAY);
}

export function actionsForTrack(track: LawyerTrack): LawyerAction[] {
  return LAWYER_ACTION_PLAN.filter((a) => a.track === "all" || a.track === track);
}

/** ISO date `days` after `from`, used when the appointment seeds the plan. */
export function deadlineFrom(from: string | Date, days: number): string {
  const base = typeof from === "string" ? new Date(from) : from;
  return new Date(base.getTime() + days * MS_PER_DAY).toISOString();
}

export interface TrackedActionInput {
  code: string;
  labelBn: string;
  dueAt: string | null;
  doneAt: string | null;
  noteBn: string | null;
}

/**
 * Grades one recorded action. Pure and total: a bad or missing date never throws, it
 * just reads as outstanding, because a malformed row must not blank a citizen's page.
 */
export function gradeAction(
  input: TrackedActionInput,
  assignedAt: string,
  now: Date = new Date(),
): TrackedAction {
  const assigned = new Date(assignedAt);
  const assignedMs = Number.isNaN(assigned.getTime()) ? now.getTime() : assigned.getTime();
  const elapsedDays = Math.max(0, wholeDays(now.getTime() - assignedMs));

  if (input.doneAt) {
    return {
      code: input.code as LawyerActionCode,
      labelBn: input.labelBn,
      state: "done",
      elapsedDays,
      daysRemaining: 0,
      dueAt: input.dueAt,
      doneAt: input.doneAt,
      noteBn: input.noteBn,
    };
  }

  if (!input.dueAt) {
    return {
      code: input.code as LawyerActionCode,
      labelBn: input.labelBn,
      state: "na",
      elapsedDays,
      daysRemaining: 0,
      dueAt: null,
      doneAt: null,
      noteBn: input.noteBn,
    };
  }

  const due = new Date(input.dueAt);
  const dueMs = Number.isNaN(due.getTime()) ? assignedMs : due.getTime();
  const daysRemaining = wholeDays(dueMs - now.getTime());

  return {
    code: input.code as LawyerActionCode,
    labelBn: input.labelBn,
    state: daysRemaining < 0 ? "overdue" : daysRemaining <= DUE_SOON_DAYS ? "due_soon" : "pending",
    elapsedDays,
    daysRemaining,
    dueAt: input.dueAt,
    doneAt: null,
    noteBn: input.noteBn,
  };
}

export interface TrackerSummary {
  total: number;
  done: number;
  overdue: number;
  dueSoon: number;
  pending: number;
  /** 0-100. Deliberately not a "score" of the lawyer — a percentage of logged steps. */
  progressPercent: number;
  daysSinceAppointment: number;
  /** The single most overdue action, which is what the applicant should be told first. */
  worst: TrackedAction | null;
}

export function summariseTracker(actions: TrackedAction[], assignedAt: string, now: Date = new Date()): TrackerSummary {
  const assigned = new Date(assignedAt);
  const assignedMs = Number.isNaN(assigned.getTime()) ? now.getTime() : assigned.getTime();
  const daysSinceAppointment = Math.max(0, wholeDays(now.getTime() - assignedMs));

  const tracked = actions.filter((a) => a.state !== "na");
  const done = tracked.filter((a) => a.state === "done").length;
  const overdueList = tracked.filter((a) => a.state === "overdue");
  const dueSoon = tracked.filter((a) => a.state === "due_soon").length;
  const pending = tracked.filter((a) => a.state === "pending").length;

  const worst = overdueList.length
    ? overdueList.reduce((a, b) => (a.daysRemaining <= b.daysRemaining ? a : b))
    : null;

  return {
    total: tracked.length,
    done,
    overdue: overdueList.length,
    dueSoon,
    pending,
    progressPercent: tracked.length === 0 ? 0 : Math.round((done / tracked.length) * 100),
    daysSinceAppointment,
    worst,
  };
}

/** Plain Bangla, for the line an applicant actually reads. */
export function describeTracker(summary: TrackerSummary): string {
  if (summary.total === 0) {
    return "আইনজীবী নিয়োগের পর প্রত্যাশিত ধাপগুলো এখনো যুক্ত করা হয়নি।";
  }
  if (summary.overdue > 0) {
    const first = summary.worst?.labelBn ?? "একটি ধাপ";
    return `${summary.daysSinceAppointment} দিন অতিবাহিত হয়েছে। ${summary.total}টি ধাপের মধ্যে ${summary.done}টি সম্পন্ন, ${summary.overdue}টি সময় পেরিয়ে গেছে। সবার আগে "${first}" সম্পন্ন হওয়া দরকার।`;
  }
  if (summary.done === summary.total) {
    return `${summary.daysSinceAppointment} দিনে আইনজীবীর সব প্রত্যাশিত ধাপ সম্পন্ন হয়েছে।`;
  }
  if (summary.dueSoon > 0) {
    return `${summary.daysSinceAppointment} দিন অতিবাহিত। ${summary.done}টি ধাপ সম্পন্ন, ${summary.dueSoon}টির সময় ঘনিয়ে আসছে।`;
  }
  return `${summary.daysSinceAppointment} দিন অতিবাহিত হয়েছে। ${summary.total}টি ধাপের মধ্যে ${summary.done}টি সম্পন্ন হয়েছে; পরবর্তী ধাপ: ${summary.total - summary.done > 0 ? (summary.worst?.labelBn ?? "পরবর্তী ধাপ") : "—"}।`;
}
