/**
 * Safe-contact window.
 *
 * FREE — no network, no STT, no TTS, no LLM. `windowStatus` takes `now` as a parameter
 * precisely so this suite can check a fifteen-minute rule in milliseconds instead of
 * waiting for the clock to reach it.
 *
 * The brief's failure test for A1 is "an unsafe person answers the phone", so the rule
 * that matters is the closed one: outside the window, contact must be refused. That is
 * what most of these checks are about.
 *
 *   npx jiti scripts/test-safe-window.ts
 */
import {
  readWindow,
  windowStatus,
  describeWindow,
  parseHhMm,
  bdDateTimeString,
} from "../lib/case/safe-window";

let failures = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? " :: " + extra : ""}`);
}

/** A UTC instant at a given Bangladesh wall-clock time. Mirrors the module's own maths. */
const BD = 6 * 3_600_000;
const at = (y: number, m: number, d: number, hh: number, mm: number) =>
  new Date(Date.UTC(y, m - 1, d, hh, mm) - BD);

console.log("parsing");

check("rejects a missing time", parseHhMm(null) === null);
check("rejects '25:00'", parseHhMm("25:00") === null);
check("rejects '11:99'", parseHhMm("11:99") === null);
check("accepts '11:15'", parseHhMm("11:15") === 11 * 60 + 15, String(parseHhMm("11:15")));
check("accepts '00:00'", parseHhMm("00:00") === 0);

console.log("\nreading a window off a row");

const moyuriRow = {
  ref: "DEMO-CASE-A1",
  risk_high: 1,
  neutral_only: 1,
  safe_window_bn: null,
  window_start: "11:00",
  window_end: "11:15",
  window_days: "0,1,2,3,4",
};
const w = readWindow(moyuriRow);
check("reads a valid window", w !== null);
check("window is 11:00-11:15", w?.start === "11:00" && w?.end === "11:15", `${w?.start}-${w?.end}`);
check("window is the 5 working days", JSON.stringify(w?.days) === "[0,1,2,3,4]", JSON.stringify(w?.days));

// A bad window must fail CLOSED. Defaulting an unparseable window to office hours would
// open a survivor's contact hours by accident.
check("no window when start is missing", readWindow({ ...moyuriRow, window_start: null }) === null);
check("no window when end is missing", readWindow({ ...moyuriRow, window_end: null }) === null);
check("no window when end precedes start", readWindow({ ...moyuriRow, window_end: "10:00" }) === null);
check("no window when the span is zero", readWindow({ ...moyuriRow, window_end: "11:00" }) === null);
check("no window for a malformed time", readWindow({ ...moyuriRow, window_start: "eleven" }) === null);
check("no row means no window", readWindow(null) === null);

console.log("\nthe window opens and closes exactly when it should");

if (w) {
  // 2026-09-27 is a Sunday (day 0), which is a working day in this window.
  const justBefore = windowStatus(w, at(2026, 9, 27, 10, 59));
  const atOpen = windowStatus(w, at(2026, 9, 27, 11, 0));
  const lastMinute = windowStatus(w, at(2026, 9, 27, 11, 14));
  const atClose = windowStatus(w, at(2026, 9, 27, 11, 15));

  check("one minute before the window it is CLOSED", justBefore.open === false);
  check("closed state explains itself in Bangla", justBefore.blockReasonBn.includes("নিরাপদ সময়ের বাইরে"), justBefore.blockReasonBn);
  check("at 11:00 it is OPEN", atOpen.open === true);
  check("at 11:14 — the last minute — it is OPEN", lastMinute.open === true);
  check("at 11:14 exactly 1 minute remains", lastMinute.minutesRemaining === 1, String(lastMinute.minutesRemaining));
  check("at 11:15 it is CLOSED again", atClose.open === false, "the window is half-open [start, end)");

  check("the next opening is today's when we are before it", justBefore.nextOpenAt.getTime() === at(2026, 9, 27, 11, 0).getTime(), justBefore.nextOpenAt.toISOString());
  check("minutes-until is exact at 10:59", justBefore.minutesUntilOpen === 1, String(justBefore.minutesUntilOpen));
  check("after close, the next opening is tomorrow 11:00", atClose.nextOpenAt.getTime() === at(2026, 9, 28, 11, 0).getTime(), atClose.nextOpenAt.toISOString());
  check("tomorrow's wait is reported in minutes", atClose.minutesUntilOpen > 1300, String(atClose.minutesUntilOpen));
  check("no minutes-remaining while closed", atClose.minutesRemaining === null);
}

console.log("\nthe weekend is skipped when the window is weekdays only");

if (w) {
  // 2026-10-02 is a Friday and 2026-10-03 a Saturday.
  const friday = windowStatus(w, at(2026, 10, 2, 12, 0));
  const saturday = windowStatus(w, at(2026, 10, 3, 12, 0));
  check("Friday noon: window long closed, next is Sunday", friday.nextOpenAt.getTime() === at(2026, 10, 4, 11, 0).getTime(), friday.nextOpenAt.toISOString());
  check("Saturday noon: next is Sunday, not Saturday", saturday.nextOpenAt.getTime() === at(2026, 10, 4, 11, 0).getTime(), saturday.nextOpenAt.toISOString());
  check("Saturday is not open", saturday.open === false);
}

console.log("\na daily window ignores the day list");

const daily = readWindow({ ...moyuriRow, window_days: "" });
if (daily) {
  const saturday = windowStatus(daily, at(2026, 10, 3, 12, 0));
  check("a daily window opens on Saturday", saturday.nextOpenAt.getTime() === at(2026, 10, 4, 11, 0).getTime(), saturday.nextOpenAt.toISOString());
  check("weekend still waits for the next day", saturday.open === false);
}

console.log("\nBDT conversion for the reminder column");

const slot = at(2026, 9, 28, 11, 0);
check("renders local BDT, not UTC", bdDateTimeString(slot) === "2026-09-28 11:00:00", bdDateTimeString(slot));
// 11:00 BDT is 05:00 UTC, so a UTC-based formatter would have written 05:00 and fired
// the reminder six hours early — before the window, in the middle of the afternoon.
check("a 06:00 BDT slot renders as 06:00", bdDateTimeString(at(2026, 9, 28, 6, 0)) === "2026-09-28 06:00:00", bdDateTimeString(at(2026, 9, 28, 6, 0)));

console.log("\nlabels");

check("describes a 15-minute window", describeWindow(660, 675, [0, 1, 2, 3, 4]).includes("১৫ মিনিট"), describeWindow(660, 675, [0, 1, 2, 3, 4]));
check("describes daily when no days are given", describeWindow(660, 675, []).includes("প্রতিদিন"), describeWindow(660, 675, []));

console.log(failures === 0 ? "\nAll safe-window checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
