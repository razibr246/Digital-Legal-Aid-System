/**
 * Safe-contact windows.
 *
 * Pure and dependency-free, so the rule "contact is possible ONLY inside the window" is
 * testable without a browser, a database or a clock of its own.
 *
 * The brief's requirement for A1 is precise: a fixed 15-minute window every day. That is a
 * different shape from a four-hour "safe period", and it is the difference between a
 * reminder an officer can rely on and a note that says "contact her sometime". The window
 * is therefore stored as times and a weekday set, not as prose — see
 * `migrations/0032_safe_window.sql`.
 *
 * All arithmetic is in Bangladesh Standard Time (fixed UTC+6, no DST) for the same reason
 * as `lib/case/mediation.ts`: the Worker renders in UTC and the officer's browser renders
 * in UTC+6, and a safe window that lands on a different day in each is not a safety
 * control. BD_OFFSET_MS is duplicated rather than imported because this module must stay
 * importable on its own in a test.
 */

const BD_OFFSET_MS = 6 * 3_600_000;

export interface SafeWindowRow {
  ref: string;
  risk_high: number | boolean | null;
  neutral_only: number | boolean | null;
  safe_window_bn: string | null;
  window_start: string | null;
  window_end: string | null;
  window_days: string | null;
}

export interface SafeWindow {
  /** Local `HH:MM` on the opening side. */
  start: string;
  /** Local `HH:MM` on the closing side. Same day: a window never crosses midnight. */
  end: string;
  /** JS day indexes, 0 = Sunday. Empty means every day. */
  days: number[];
  /** Human sentence for the officer, from the data rather than invented per screen. */
  labelBn: string;
}

function bdParts(date: Date): { year: number; month: number; day: number; weekday: number; minutes: number; hour: number } {
  const s = new Date(date.getTime() + BD_OFFSET_MS);
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth(),
    day: s.getUTCDate(),
    weekday: s.getUTCDay(),
    minutes: s.getUTCMinutes(),
    hour: s.getUTCHours(),
  };
}

/** A UTC instant at a given Bangladesh wall-clock time. */
function bdAt(year: number, month: number, day: number, minutes: number): Date {
  return new Date(Date.UTC(year, month, day, 0, minutes) - BD_OFFSET_MS);
}

export function parseHhMm(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function toBanglaDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);
}

const DAY_BN = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"];

function formatBnTime(minutes: number): string {
  return `${toBanglaDigits(String(Math.floor(minutes / 60)).padStart(2, "0"))}:${toBanglaDigits(String(minutes % 60).padStart(2, "0"))}`;
}

/**
 * Reads a window out of a `safe_profiles` row, or null when the row has no usable window.
 *
 * A malformed time is treated as "no window" rather than defaulted. Defaulting an
 * unparseable window to 09:00-17:00 would open a survivor's contact hours by accident,
 * and the failure mode of that mistake is somebody's husband answering the phone.
 */
export function readWindow(row: SafeWindowRow | null | undefined): SafeWindow | null {
  if (!row) return null;
  const start = parseHhMm(row.window_start);
  const end = parseHhMm(row.window_end);
  if (start === null || end === null) return null;
  // A zero or negative span is a data error, not an all-day window.
  if (end <= start) return null;

  const days = String(row.window_days ?? "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

  return {
    start: row.window_start!.trim(),
    end: row.window_end!.trim(),
    days,
    labelBn: row.safe_window_bn?.trim() || describeWindow(start, end, days),
  };
}

export function describeWindow(startMin: number, endMin: number, days: number[]): string {
  const span = endMin - startMin;
  const when =
    days.length === 0 || days.length === 7
      ? "প্রতিদিন"
      : days.length === 5 && [0, 1, 2, 3, 4].every((d) => days.includes(d))
        ? "কার্যদিবসে"
        : days.map((d) => DAY_BN[d]).join(", ");
  return `${when} ${formatBnTime(startMin)} থেকে ${formatBnTime(endMin)} — নিরাপদ সময় (${toBanglaDigits(String(span))} মিনিট)`;
}

export interface WindowStatus {
  window: SafeWindow;
  /** True when contact is permitted right now. */
  open: boolean;
  /** The next permitted window, as a UTC instant. Always defined. */
  nextOpenAt: Date;
  /** The window that is next, whether or not it is the one currently running. */
  nextStart: Date;
  nextEnd: Date;
  /** Whole minutes until `nextOpenAt`. 0 while open. */
  minutesUntilOpen: number;
  /** Minutes left in the current window, or null when closed. */
  minutesRemaining: number | null;
  /** The reason to show to an officer when they try to contact outside the window. */
  blockReasonBn: string;
}

function appliesOn(window: SafeWindow, weekday: number): boolean {
  return window.days.length === 0 || window.days.includes(weekday);
}

/**
 * The full status of a window at a given instant.
 *
 * `now` is a parameter so the whole thing is deterministic under test — a safety control
 * whose behaviour can only be checked by waiting for the clock is not testable.
 */
export function windowStatus(window: SafeWindow, now: Date = new Date()): WindowStatus {
  const startMin = parseHhMm(window.start)!;
  const endMin = parseHhMm(window.end)!;
  const span = endMin - startMin;

  // Look at today and the next six days: at most one skip is possible for a weekly set.
  for (let offset = 0; offset <= 7; offset += 1) {
    const probe = new Date(now.getTime() + offset * 86_400_000);
    const { year, month, day, weekday, hour, minutes } = bdParts(probe);
    if (!appliesOn(window, weekday)) continue;
    const start = bdAt(year, month, day, startMin);
    const end = bdAt(year, month, day, endMin);
    if (offset === 0) {
      const nowMin = hour * 60 + minutes;
      if (nowMin >= startMin && nowMin < endMin) {
        return {
          window,
          open: true,
          nextOpenAt: start,
          nextStart: start,
          nextEnd: end,
          minutesUntilOpen: 0,
          minutesRemaining: endMin - nowMin,
          blockReasonBn: "",
        };
      }
    }
    if (start.getTime() > now.getTime()) {
      return {
        window,
        open: false,
        nextOpenAt: start,
        nextStart: start,
        nextEnd: end,
        minutesUntilOpen: Math.ceil((start.getTime() - now.getTime()) / 60_000),
        minutesRemaining: null,
        blockReasonBn:
          "এখন নিরাপদ সময়ের বাইরে। স্বামীর নম্বরে বা বাইরের সময়ে যোগাযোগ করা যাবে না।",
      };
    }
    void span;
  }

  // Unreachable for any well-formed window, but returning the next Sunday beats throwing
  // inside a dashboard render.
  const next = bdAt(2020, 0, 5, startMin);
  return {
    window,
    open: false,
    nextOpenAt: next,
    nextStart: next,
    nextEnd: new Date(next.getTime() + span * 60_000),
    minutesUntilOpen: 0,
    minutesRemaining: null,
    blockReasonBn: "নিরাপদ সময় নির্ধারিত করা নেই।",
  };
}

/** Local `YYYY-MM-DD` in Bangladesh, for a `message_outbox.deferred_until` value. */
export function bdDateTimeString(date: Date): string {
  const s = new Date(date.getTime() + BD_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${s.getUTCFullYear()}-${p(s.getUTCMonth() + 1)}-${p(s.getUTCDate())} ${p(s.getUTCHours())}:${p(s.getUTCMinutes())}:00`;
}

export function bdDateString(date: Date): string {
  const s = new Date(date.getTime() + BD_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${s.getUTCFullYear()}-${p(s.getUTCMonth() + 1)}-${p(s.getUTCDate())}`;
}

export function bdTimeBn(date: Date): string {
  const s = new Date(date.getTime() + BD_OFFSET_MS);
  return formatBnTime(s.getUTCHours() * 60 + s.getUTCMinutes());
}

export function bdDayTimeBn(date: Date): string {
  const s = new Date(date.getTime() + BD_OFFSET_MS);
  return `${DAY_BN[s.getUTCDay()]} ${bdTimeBn(date)}`;
}
