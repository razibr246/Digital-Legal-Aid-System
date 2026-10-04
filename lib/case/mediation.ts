/**
 * ADR / mediation — the rules and the calendar arithmetic.
 *
 * Pure and dependency-free, like `lib/case/domain.ts`, so it is testable without a
 * browser and reusable from an API route, a server component or a client component.
 *
 * Two jobs:
 *
 *  1. `caseFactsFromCase` turns a database row into the `CaseFacts` that
 *     `caseActionState` already understands. This is the important one. The mandatory-
 *     mediation rule, the `medLate` / `needFailedMed` reasons and the appellate/labour
 *     carve-outs were all written in `domain.ts` and then never consulted on the write
 *     path — `assignPanelLawyer` moved a case straight to `lawyer` without asking. The
 *     booking endpoint gates on this so the rule is enforced where it happens, and the
 *     UI gates on the same call so the button and the server can never disagree.
 *
 *  2. The Sun–Thu week. Bangladesh's legal working week runs Sunday to Thursday; Friday
 *     and Saturday are the weekend. A cause list that shows a Saturday hearing date is
 *     not a minor bug, it is a wasted trip for an applicant who may have travelled.
 */

import {
  caseActionState,
  isClosed,
  trackForRole,
  type CaseActionState,
  type CaseFacts,
  type CaseStatus,
  type CaseTrack,
} from "./domain";
import { toBanglaDigits } from "./consultation-script";

export type MediationOutcome = "scheduled" | "settled" | "failed";

/** The five working days, in order. Indexed by `Date.getDay()` via `WORKDAY_INDEX`. */
export const MEDIATION_WEEKDAYS = [
  { code: "sun", bn: "রবিবার", short: "রবি" },
  { code: "mon", bn: "সোমবার", short: "সোম" },
  { code: "tue", bn: "মঙ্গলবার", short: "মঙ্গ" },
  { code: "wed", bn: "বুধবার", short: "বুধ" },
  { code: "thu", bn: "বৃহস্পতিবার", short: "বৃহঃ" },
] as const;

export type WorkdayCode = (typeof MEDIATION_WEEKDAYS)[number]["code"];

/** `Date.getDay()` (0=Sun) -> index into MEDIATION_WEEKDAYS, or -1 for the weekend. */
const WORKDAY_INDEX: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4 };

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

/**
 * Bangladesh Standard Time is UTC+6 all year, with no daylight saving.
 *
 * Every date helper in this file works in that zone explicitly, using UTC accessors on a
 * shifted instant, rather than using the runtime's local zone.
 *
 * This is not a theoretical concern. The Worker renders these dates in UTC and the
 * officer's browser renders them in Asia/Dhaka, so `new Date().getDay()` disagrees
 * between the two for six hours a day. Measured on a Sunday: the Worker saw Saturday and
 * the browser saw Sunday, so the server rendered LAST week's cause list. An officer
 * booking at 00:30 BST would have been filed against the wrong week — and "wrong week"
 * is the difference between a hearing date an applicant can attend and one they cannot.
 */
const BD_OFFSET_MS = 6 * MS_PER_HOUR;

/** The instant shifted so its UTC fields read as Bangladesh wall-clock fields. */
function toBd(date: Date): Date {
  return new Date(date.getTime() + BD_OFFSET_MS);
}

/** Read Bangladesh civil fields off any instant. */
function bdParts(date: Date): { year: number; month: number; day: number; weekday: number } {
  const shifted = toBd(date);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/**
 * A UTC instant at Bangladesh midnight for the given civil date.
 *
 * Returning a UTC instant (rather than a shifted Date) is what keeps
 * `toDateKey(new Date(...))` and `fromDateKey` round-tripping.
 */
function bdMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day) - BD_OFFSET_MS);
}

function addBdDays(date: Date, days: number): Date {
  const { year, month, day } = bdParts(date);
  return bdMidnight(year, month, day + days);
}

/** Today in Bangladesh, as a UTC instant at local midnight. */
function todayBd(now: Date): Date {
  const { year, month, day } = bdParts(now);
  return bdMidnight(year, month, day);
}

/** The Sunday of the Bangladesh week containing `date`. */
export function weekStart(date: Date): Date {
  const { year, month, day, weekday } = bdParts(date);
  return bdMidnight(year, month, day - weekday);
}

/** The five working days of the Bangladesh week containing `date`, Sunday first. */
export function workdaysOfWeek(date: Date): Date[] {
  const sunday = weekStart(date);
  return [0, 1, 2, 3, 4].map((offset) => addBdDays(sunday, offset));
}

export function addDays(date: Date, days: number): Date {
  return addBdDays(date, days);
}

export function sameDay(a: Date, b: Date): boolean {
  const pa = bdParts(a);
  const pb = bdParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

/**
 * `YYYY-MM-DD` for the BANGLADESH civil date, not the UTC one and not the browser's.
 *
 * Deliberately not `toISOString().slice(0, 10)`: that converts to UTC first, so a 22:00
 * booking in Dhaka silently becomes the following day — exactly the bug that makes an
 * applicant turn up a day early.
 */
export function toDateKey(date: Date): string {
  const { year, month, day } = bdParts(date);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** A UTC instant at Bangladesh midnight for that civil date. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return bdMidnight(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * Is this a working day in BANGLADESH, not in the runtime's timezone?
 *
 * The runtime's answer is wrong here, and it was wrong in production: the Worker is UTC
 * and the officer's browser is UTC+6, so `fromDateKey("2026-10-02")` — a UTC instant at
 * 18:00 on Oct 1 — read as Thursday in the Worker and the server ACCEPTED a Friday
 * mediation booking. The five-day week is a legal fact about Bangladesh, so it has to be
 * evaluated in Bangladesh terms or it is not enforced at all.
 */
export function isWorkday(date: Date): boolean {
  // ONLY the Bangladesh weekday. An earlier version also guarded on the raw `getDay()`,
  // which reintroduced the exact bug this function exists to prevent: in the UTC Worker,
  // fromDateKey("2020-01-05") is 18:00 Saturday on Jan 4, so the raw check rejected a
  // Sunday and the caller saw a "Friday or Saturday" message for a valid working day.
  return bdParts(date).weekday in WORKDAY_INDEX;
}

export function weekdayBn(date: Date): string {
  const index = WORKDAY_INDEX[bdParts(date).weekday];
  return index === undefined ? "সম্পূর্ণ" : MEDIATION_WEEKDAYS[index].bn;
}

/** Day of month in Bangladesh, for rendering. */
export function bdDayOfMonth(date: Date): number {
  return bdParts(date).day;
}

/**
 * The abbreviated weekday, in BANGLADESH terms.
 *
 * Added because a date strip was calling `toLocaleDateString("bn-BD", { weekday: "short" })`
 * on a Bangladesh-derived date. That formats in the runtime's timezone using the host's
 * ICU data, so the Worker and the officer's browser could disagree about the label on an
 * otherwise-correct date — the same defect `formatBn` exists to prevent. The abbreviations
 * were already here in `MEDIATION_WEEKDAYS`, so this only exposes them.
 */
export function weekdayBnShort(date: Date): string {
  const index = WORKDAY_INDEX[bdParts(date).weekday];
  return index === undefined ? "" : MEDIATION_WEEKDAYS[index].short;
}

/** Month number in Bangladesh, 1-12, for rendering. */
export function bdMonthOfYear(date: Date): number {
  return bdParts(date).month + 1;
}

/** `HH:MM` in Bangladesh, in Bangla digits. */
export function bdTimeBn(date: Date): string {
  const shifted = toBd(date);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${toBanglaDigits(hh)}:${toBanglaDigits(mm)}`;
}

/** True for a plain `YYYY-MM-DD` key that names a real calendar day. */
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = fromDateKey(value);
  return !Number.isNaN(parsed.getTime()) && toDateKey(parsed) === value;
}

export function formatBn(date: Date, withWeekday = true): string {
  const months = [
    "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
    "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
  ];
  // Bangladesh civil fields. Reading these with the local accessors rendered 27 September
  // in Dhaka as 26 September in the Worker, which is both a hydration mismatch on the
  // calendar and a date a reader could be shown that is not the date the system holds.
  const { year, month, day } = bdParts(date);
  const base = `${toBanglaDigits(String(day))} ${months[month]} ${toBanglaDigits(String(year))}`;
  return withWeekday ? `${weekdayBn(date)}, ${base}` : base;
}

/* ------------------------------------------------------------------ *
 * Building the facts the rules already understand
 * ------------------------------------------------------------------ */

/** The subset of a case row that ADR needs. Deliberately narrow. */
export interface MediationCaseRow {
  id: string;
  status: string;
  stage: string | null;
  district_code: string | null;
  category: string | null;
  problem_category: string | null;
  lawyer_requested: number | boolean | null;
  eligibility_passed: number | boolean | null;
  lawyer_assigned: number | boolean | null;
  /** All attempts, oldest first — the rules read the LAST one. */
  mediations: Array<{ scheduled_at: string | null; outcome: string | null }>;
}

const TRACK_BY_CATEGORY: Array<{ match: RegExp; track: CaseTrack }> = [
  { match: /appellate|supreme|sc\b|আপিল/, track: "appellate" },
  { match: /labour|labor|শ্রম/, track: "labour" },
  { match: /chowki|চৌকি/, track: "chowki" },
];

/**
 * Which track a case is on.
 *
 * `domain.ts` decides this from a ROLE (`trackForRole`), but a district DLAO sees a
 * mixed caseload, so the category has to decide. The category is the honest signal
 * here: a Supreme Court appeal filed at a district office is still an appellate track
 * and still skips mediation.
 */
export function trackForCase(row: Pick<MediationCaseRow, "category" | "problem_category">): CaseTrack {
  const haystack = `${row.problem_category ?? ""} ${row.category ?? ""}`.toLowerCase();
  for (const { match, track } of TRACK_BY_CATEGORY) {
    if (match.test(haystack)) return track;
  }
  return "district";
}

/**
 * Map a stored status onto the domain's vocabulary.
 *
 * Two vocabularies coexist in this schema and they are not the same set. `CASE_STATUSES`
 * is `submitted | review | mediation | lawyer | court | settled | unresolved`, and
 * `isClosed` only knows `settled` and `unresolved`. But the portal-facing side also
 * writes `resolved`, `closed`, `rejected` and `under_review`, and `mapPortalCase`
 * rewrites `submitted` to `pending_review`. Feeding any of those to `caseActionState`
 * made a genuinely CLOSED case look open, and the booking gate then let it through.
 *
 * So this normalises first. Anything unrecognised maps to `unresolved` — the terminal
 * value — because a booking gate should fail closed on a case whose lifecycle it does
 * not understand, and fail open on one that merely looks unusual.
 */
const STATUS_ALIASES: Record<string, CaseStatus> = {
  submitted: "submitted",
  pending_review: "submitted",
  under_review: "review",
  review: "review",
  needs_documents: "review",
  mediation: "mediation",
  assigned: "lawyer",
  lawyer: "lawyer",
  court: "court",
  settled: "settled",
  resolved: "unresolved",
  closed: "unresolved",
  rejected: "unresolved",
  unresolved: "unresolved",
};

function toCaseStatus(value: string | null | undefined): CaseStatus {
  return STATUS_ALIASES[String(value ?? "").toLowerCase()] ?? "unresolved";
}

export function caseFactsFromCase(row: MediationCaseRow): CaseFacts {
  // The stage is the more precise of the two when it is a real lifecycle value: it is
  // what the domain rules are written against. A closed stage wins over an open status,
  // so a case that reached `settled` cannot be re-opened by a stale `status` column.
  const stage = toCaseStatus(row.stage);
  const status = toCaseStatus(row.status);
  const resolvedStatus: CaseStatus = isClosed(stage) ? stage : isClosed(status) ? status : stage !== "unresolved" ? stage : status;
  return {
    status: resolvedStatus,
    track: trackForCase(row),
    districtCode: row.district_code ?? "",
    mediations: row.mediations.map((m) => ({
      date: m.scheduled_at ?? "",
      outcome: (m.outcome ?? undefined) as "scheduled" | "settled" | "failed" | undefined,
    })),
    lawyerAssigned: Boolean(row.lawyer_assigned),
    lawyerRequested: Boolean(row.lawyer_requested),
    eligibilityPassed: row.eligibility_passed === null || row.eligibility_passed === undefined
      ? undefined
      : Boolean(row.eligibility_passed),
  };
}

/**
 * Whether this case may be booked into mediation, and why not if it may not.
 *
 * The single source of truth for the booking gate. The button in the UI and the check
 * in the route both call this, so a green button can never be a red response.
 */
export function bookingVerdict(
  row: MediationCaseRow,
  mandatoryDistricts: readonly string[],
): ActionVerdictLite {
  const state: CaseActionState = caseActionState(caseFactsFromCase(row), mandatoryDistricts);
  return state.mediation;
}

export interface ActionVerdictLite {
  ok: boolean;
  reason: string;
  noteBn?: string;
}

/** A booking date must be a working day and must not be in the past. */
export function validateBookingDate(
  dateKey: string,
  now: Date = new Date(),
): { ok: true; date: Date } | { ok: false; error: string } {
  if (!isDateKey(dateKey)) return { ok: false, error: "তারিখের বিন্যাস সঠিক নয় (YYYY-MM-DD)।" };
  const date = fromDateKey(dateKey);
  if (!isWorkday(date)) {
    return { ok: false, error: "শুক্রবার ও শনিবার সম্পর্কে মধ্যস্থতা নির্ধারিত হয় না।" };
  }
  // `todayBd` rather than a local midnight: this must agree with `toDateKey`, which reads
  // Bangladesh civil time, or a booking made at 00:30 BST would be refused as "past".
  const today = todayBd(now);
  if (date.getTime() < today.getTime()) {
    return { ok: false, error: "অতীতের তারিখে মধ্যস্থতা নির্ধারিত করা যায় না।" };
  }
  return { ok: true, date };
}

export const OUTCOME_LABELS: Record<MediationOutcome, { bn: string; en: string }> = {
  scheduled: { bn: "নির্ধারিত", en: "Scheduled" },
  settled: { bn: "সালিশ হয়েছে", en: "Settled" },
  failed: { bn: "ব্যর্থ", en: "Failed" },
};
