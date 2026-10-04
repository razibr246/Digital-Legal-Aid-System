/**
 * Bangladesh-time date helpers.
 *
 * FREE — no network, no STT/TTS, no LLM. `npm run test:bd-time`
 *
 * Every check here exists because of a bug that actually shipped. The Worker runs in UTC
 * and the browser in Asia/Dhaka, and a five-day working week is a legal fact about
 * Bangladesh, so anything that reads a day, a month or a clock time has to be evaluated in
 * Bangladesh terms. Reading it in the runtime's zone produced, in production:
 *
 *   - a cause list showing LAST week, because the Worker saw Saturday and the browser
 *     saw Sunday;
 *   - a Friday mediation booking accepted, because 2026-10-02 is 18:00 Thursday in UTC;
 *   - a valid Sunday rejected with a "Friday or Saturday" message, for the mirror reason;
 *   - a React hydration mismatch on the calendar, from the same disagreement.
 *
 * The instant is built as a UTC timestamp so the checks are independent of the machine
 * running them, which is the whole point: a check written in the developer's local time
 * would have passed locally and failed in production.
 */
import {
  isWorkday,
  weekdayBn,
  formatBn,
  toDateKey,
  fromDateKey,
  bdDayOfMonth,
  bdMonthOfYear,
  bdTimeBn,
  weekStart,
  workdaysOfWeek,
} from "../lib/case/mediation";

let failures = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? " :: " + extra : ""}`);
}

const BD = 6 * 3_600_000;
const bdt = (y: number, m: number, d: number, hh = 0, mm = 0) =>
  new Date(Date.UTC(y, m - 1, d, hh, mm) - BD);

console.log("the working week is Sunday to Thursday, in Bangladesh terms");

// 2026-10-02 is a Friday. fromDateKey gives 18:00 Thursday in UTC, which is exactly the
// instant that used to be misread.
const friday = fromDateKey("2026-10-02");
check("2026-10-02 is a real Friday in Bangladesh", friday.getUTCDay() === 4, `raw getUTCDay=${friday.getUTCDay()}`);
check("and is therefore NOT a working day", isWorkday(friday) === false);
check("the weekday reads as the weekend", weekdayBn(friday) === "সম্পূর্ণ", weekdayBn(friday));

// 2026-10-04 is a Sunday in Bangladesh, and 18:00 SATURDAY in UTC — the mirror image of
// the Friday case above, and the skew that made the server render last week's cause list.
const sunday = fromDateKey("2026-10-04");
check("2026-10-04 raw UTC weekday is Saturday", sunday.getUTCDay() === 6, `raw getUTCDay=${sunday.getUTCDay()}`);
check("and IS a working day", isWorkday(sunday) === true);
check("the weekday reads as Sunday", weekdayBn(sunday) === "রবিবার", weekdayBn(sunday));

// 2020-01-05 is a Sunday and arrives as 18:00 Saturday — the mirror of the Friday case.
const oldSunday = fromDateKey("2020-01-05");
check("2020-01-05 raw UTC weekday is Saturday", oldSunday.getUTCDay() === 6, `raw=${oldSunday.getUTCDay()}`);
check("but it is a working day in Bangladesh", isWorkday(oldSunday) === true);
check("and is labelled Sunday", weekdayBn(oldSunday) === "রবিবার", weekdayBn(oldSunday));

// 2020-01-04 is a Saturday.
check("2020-01-04 is correctly rejected", isWorkday(fromDateKey("2020-01-04")) === false);
check("2026-10-03 (Saturday) is correctly rejected", isWorkday(fromDateKey("2026-10-03")) === false);

console.log("\nthe week always starts on Sunday and is five days wide");

const week = workdaysOfWeek(bdt(2026, 10, 7)); // a Wednesday
check("five workdays", week.length === 5, String(week.length));
check("all five are working days", week.every(isWorkday), week.map((d) => weekdayBn(d)).join(","));
check("the first is a Sunday", weekdayBn(week[0]) === "রবিবার", weekdayBn(week[0]));
check("the last is a Thursday", weekdayBn(week[4]) === "বৃহস্পতিবার", weekdayBn(week[4]));
check("they are consecutive days", toDateKey(week[4]) === "2026-10-08", toDateKey(week[4]));

const sundayWeek = workdaysOfWeek(bdt(2026, 10, 4));
check("a week that starts on Sunday keeps its Sunday", weekdayBn(sundayWeek[0]) === "রবিবার", weekdayBn(sundayWeek[0]));

const thursdayWeek = workdaysOfWeek(bdt(2026, 10, 8));
check("a week viewed on its last day still spans Mon-Thu plus that Sunday", thursdayWeek.length === 5 && weekdayBn(thursdayWeek[0]) === "রবিবার", thursdayWeek.map((d) => toDateKey(d)).join(","));

console.log("\ndate keys round-trip");

for (const key of ["2026-10-02", "2026-10-04", "2020-01-05", "2026-01-01"]) {
  check(`${key} round-trips`, toDateKey(fromDateKey(key)) === key, toDateKey(fromDateKey(key)));
}
check("a key just before midnight BDT is not pushed to the next day", toDateKey(new Date(Date.UTC(2026, 8, 26, 18, 30))) === "2026-09-27", toDateKey(new Date(Date.UTC(2026, 8, 26, 18, 30))));

console.log("\nrendering uses Bangladesh civil fields, not the runtime's");

// 18:30 UTC on 26 Sep is already 00:30 on 27 Sep in Dhaka.
const justPastMidnight = new Date(Date.UTC(2026, 8, 26, 18, 30));
check("the day number is 27, not 26", bdDayOfMonth(justPastMidnight) === 27, String(bdDayOfMonth(justPastMidnight)));
check("the month is September", bdMonthOfYear(justPastMidnight) === 9, String(bdMonthOfYear(justPastMidnight)));
check("the rendered date is 27 September", formatBn(justPastMidnight, false).startsWith("২৭"), formatBn(justPastMidnight, false));
check("the clock reads 00:30 BDT", bdTimeBn(justPastMidnight) === "০০:৩০", bdTimeBn(justPastMidnight));
check("a 10:00 BDT booking is not rendered as 04:00", bdTimeBn(bdt(2026, 10, 4, 10, 0)) === "১০:০০", bdTimeBn(bdt(2026, 10, 4, 10, 0)));

console.log("\nweekStart lands on a Sunday");

check("midweek weekStart is the previous Sunday", toDateKey(weekStart(bdt(2026, 10, 7))) === "2026-10-04", toDateKey(weekStart(bdt(2026, 10, 7))));
check("a Sunday's weekStart is itself", toDateKey(weekStart(bdt(2026, 10, 4))) === "2026-10-04", toDateKey(weekStart(bdt(2026, 10, 4))));

console.log(failures === 0 ? "\nAll Bangladesh-time checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
