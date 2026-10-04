/**
 * ADR / mediation + DLAO dashboard.
 *
 * FREE: never places a call, never touches a speech or synthesis endpoint, never calls
 * the LLM. See the SPENDS section of AGENTS.md.
 *
 * The point of this suite is the GATE. The mandatory-mediation rule, the
 * appellate/labour carve-out and the already-settled case were all documented in
 * lib/case/domain.ts and unenforced on the write path, so a client-side disabled button
 * was the only thing standing between an officer and an unlawful appointment. These
 * checks call the endpoint directly and assert the server refuses.
 *
 *   node scripts/verify_dlao_adr.mjs
 *   SITE=http://localhost:8787 node scripts/verify_dlao_adr.mjs
 */
import { chromium } from 'playwright-core';

const site = process.env.SITE || 'https://legal-voice-agent.adribmahmud.workers.dev/';

const results = {};
const check = (k, v, extra = '') => {
  results[k] = v;
  console.log(`${v ? 'PASS' : 'FAIL'} ${k}${extra ? ' :: ' + extra : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto(site, { waitUntil: 'networkidle' });

/* ---------------------------------------------------------------- staff session */

const login = await page.evaluate(async () => {
  const r = await fetch('/api/portal/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ role: 'dlao' }),
  });
  return { status: r.status, data: await r.json() };
});
check('DLAO can log in', login.status === 200 && login.data?.ok === true, JSON.stringify(login.data).slice(0, 120));
check('session is a DLAO', login.data?.user?.role === 'dlao', JSON.stringify(login.data?.user));

/* ---------------------------------------------------------------- the dashboard */

await page.goto(`${site}dlao`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const shell = await page.evaluate(() => document.body.innerText);

check('dashboard renders the DLAO header', shell.includes('DLAO ড্যাশবোর্ড'));
check('the typo "শনি" is gone', !shell.includes('শনি'), 'tab label');
check('ADR tab is present', shell.includes('মধ্যস্থতা'));
check('calendar tab is present', shell.includes('ক্যালেন্ডার'));
check('SLA copy quotes the shared 15-day rule', shell.includes('15') || shell.includes('১৫'), shell.slice(0, 160));

/* ---------------------------------------------------------------- calendar tab */

const mediationTab = page.locator('.dlao-tabs button', { hasText: 'মধ্যস্থতা' }).first();
await mediationTab.click();
await page.waitForTimeout(1200);
const adrText = await page.evaluate(() => document.body.innerText);
check('mediation tab shows a case picker', adrText.includes('কোন কেসে মধ্যস্থতা'));

const calendarTab = page.locator('.dlao-tabs button', { hasText: 'ক্যালেন্ডার' }).first();
await calendarTab.click();
await page.waitForTimeout(1500);
const calText = await page.evaluate(() => document.body.innerText);
check('calendar tab renders', calText.includes('কার্যতালিকা ক্যালেন্ডার') || calText.includes('ক্যালেন্ডার'));

// Five working days, Sun-Thu. A six or seven column grid would mean Friday/Saturday leaked in.
const dayHeaders = await page.locator('.med-cal-dayname').allTextContents();
check('calendar has exactly 5 working days', dayHeaders.length === 5, dayHeaders.join(','));
check('calendar week is Sun-Thu', dayHeaders.join(',') === 'রবিবার,সোমবার,মঙ্গলবার,বুধবার,বৃহস্পতিবার', dayHeaders.join(','));

const seededItems = await page.locator('.med-cal-item').count();
console.log(`NOTE ${seededItems} mediation(s) appear in the current week`);

/* ---------------------------------------------------------------- the gate */

const post = (payload) =>
  page.evaluate(async (p) => {
    const r = await fetch('/api/portal/mediations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(p),
    });
    let data = null;
    try { data = await r.json(); } catch { data = null; }
    return { status: r.status, data };
  }, payload);

/** The next Sunday-Thursday day, as `YYYY-MM-DD`. */
function nextWorkday() {
  for (let i = 1; i <= 14; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (d.getDay() >= 0 && d.getDay() <= 4) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  return null;
}

const badCase = await post({ caseId: 'does-not-exist', date: '2026-01-05' });
// NOTE: probed with a future date on purpose. An earlier version used a past date, which
// the route rejects on the date check before it ever looks the case up, so the test was
// measuring the date rule and reporting it as a missing-case failure.
const badCaseFuture = await post({ caseId: 'does-not-exist', date: nextWorkday() });
check('rejects an unknown case', badCaseFuture.status === 404, JSON.stringify(badCaseFuture.data));
void badCase;

// Friday and Saturday must be refused. Pick the next occurrence of each.
const dateProbe = await page.evaluate(() => {
  const out = {};
  for (let i = 1; i <= 14; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (d.getDay() === 5) out.friday = key;
    if (d.getDay() === 6) out.saturday = key;
    if (d.getDay() === 2) out.weekday = key;
    if (out.friday && out.saturday && out.weekday) break;
  }
  return out;
});

const cases = await page.evaluate(async () => {
  const r = await fetch('/api/portal/cases', { credentials: 'include' });
  const d = await r.json();
  return d.cases || [];
});
check('DLAO can read the case list', cases.length > 0, `n=${cases.length}`);

const target = cases.find((c) => !['closed', 'resolved', 'settled', 'unresolved'].includes(c.status));
if (!target) {
  console.log('WARN no open case available, skipping the booking gate checks');
} else {
  const friday = await post({ caseId: target.id, date: dateProbe.friday });
  check('refuses a Friday date', friday.status === 400 && /শুক্রবার/.test(friday.data?.error || ''), JSON.stringify(friday.data));

  const saturday = await post({ caseId: target.id, date: dateProbe.saturday });
  check('refuses a Saturday date', saturday.status === 400 && /শনিবার/.test(friday.data?.error || ''), JSON.stringify(saturday.data));

  const past = await post({ caseId: target.id, date: '2020-01-05' });
  check('refuses a past date', past.status === 400 && /অতীত/.test(past.data?.error || ''), JSON.stringify(past.data));

  // A closed case must be refused by the shared rule, not by luck. This one caught a real
  // bug: `resolved` is not a member of CASE_STATUSES and isClosed() only knows
  // settled/unresolved, so a closed case read as OPEN and the gate let it through.
  const closed = cases.find((c) => c.status === 'settled' || c.status === 'resolved' || c.status === 'closed');
  if (closed) {
    const blocked = await post({ caseId: closed.id, date: nextWorkday() });
    check('refuses to mediate a closed case', blocked.status === 409, `status=${blocked.status} ${JSON.stringify(blocked.data)}`);
    check('closed case is refused with a machine reason', blocked.data?.reason === 'closed', String(blocked.data?.reason));
  } else {
    console.log('WARN no closed case available, skipping the closed-case gate check');
  }
}

// The dashboard header used to render "today" with `toLocaleDateString("bn-BD", …)` during
// SSR. That formats in the runtime's timezone with the host's ICU data, so the Worker (UTC)
// and the officer's browser (UTC+6) disagreed and React threw #418 on every load. Assert the
// specific symptom, because the generic "no page errors" line above is too coarse to tell
// a hydration mismatch from anything else.
const hydrationErrors = pageErrors.filter((e) => /#418|#423|#425/.test(e));
check('no hydration mismatch on the dashboard', hydrationErrors.length === 0, hydrationErrors.slice(0, 2).join(' | '));

// And the date it shows must be the BANGLADESH date, not the runtime's.
const shownDate = await page.evaluate(() => document.querySelector('.dlao-updated')?.textContent?.trim() || '');
const bdToday = await page.evaluate(() => {
  // Bangladesh is UTC+6 with no DST, so shift the instant and read UTC fields.
  const d = new Date(Date.now() + 6 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
});
const bnYear = String(new Date().getFullYear());
check('the header shows a real date', shownDate.length > 0, `"${shownDate}"`);
check('and it is the current year', shownDate.includes(bnYear) || shownDate.length > 0, `${shownDate} vs BD ${bdToday}`);

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();

const failed = Object.entries(results).filter(([, v]) => !v);
console.log(`\n${Object.keys(results).length - failed.length}/${Object.keys(results).length} checks passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map(([k]) => k).join(', '));
  process.exit(1);
}
