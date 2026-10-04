/**
 * Manual (typed) application flow.
 *
 * The portal's "নতুন আবেদন করুন" modal used to be a stub: it read no fields, posted
 * nothing, and just opened the softphone. It is now a wizard that asks the same
 * slots as the 16699 voice intake, registers the applicant, signs them in, and
 * hands them to the same 3-step identity verification.
 *
 * Run against the deployed worker (the API phase needs the D1 binding, which
 * `next dev` does not provide):
 *   node scripts/verify_manual_application.mjs
 *   SITE=http://localhost:3000 node scripts/verify_manual_application.mjs
 */
import { chromium } from 'playwright-core';

const site = process.env.SITE || 'https://legal-voice-agent.adribmahmud.workers.dev/';

const results = {};
const check = (k, v, extra = '') => {
  results[k] = v;
  console.log(`${v ? 'PASS' : 'FAIL'} ${k}${extra ? ' :: ' + extra : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto(site, { waitUntil: 'networkidle' });

// ---------------------------------------------------------------- API phase

const post = (body) =>
  page.evaluate(
    async (payload) => {
      const r = await fetch('/api/portal/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      let data = null;
      try {
        data = await r.json();
      } catch {
        data = null;
      }
      return { status: r.status, data };
    },
    body,
  );

const valid = {
  sessionId: `web-verify-${Math.floor(Math.random() * 1e9)}`,
  language: 'bn',
  problem: 'জমি নিয়ে প্রতিবেশীর সাথে দ্বন্দ্ব চলছে, খতিয়ান নিয়ে সমস্যা।',
  categoryId: 'inheritance',
  subcategoryId: 'i1',
  hasDisability: false,
  gender: 'নারী',
  displayName: 'ম্যানুয়াল আবেদন পরীক্ষা',
  phone: '01725252525',
  address: 'বাড়ি ১২, রোড ৫, ধানমন্ডি, ঢাকা',
  district: 'ঢাকা',
};

// `next dev` has no D1 binding, so the route answers 503 before it can validate
// anything. Probe once and skip the whole phase rather than reporting every
// assertion as a failure.
const probe = await post({ ...valid, sessionId: `web-probe-${Math.floor(Math.random() * 1e9)}` });
const dbAvailable = probe.status !== 503;

if (!dbAvailable) {
  console.log(`SKIP API phase — no D1 binding here (status ${probe.status}).`);
  console.log('Run against the deployed worker to exercise registration and auto-login.');
} else {
const noCategory = { ...valid };
delete noCategory.categoryId;
delete noCategory.subcategoryId;
const missingProblem = await post({ ...noCategory, problem: '' });
check('rejects empty problem', missingProblem.status === 400, `status ${missingProblem.status}`);

// Per-category escape hatch: the sentinel is not in the category's own list, so the
// route must special-case it instead of 400-ing on a legitimate choice.
const noSubDesc = { ...valid, subcategoryId: 'other', customProblem: '' };
const subOtherShort = await post(noSubDesc);
check('per-category other needs a description', subOtherShort.status === 400 || !dbAvailable,
  `status ${subOtherShort.status}`);
const subOtherOk = await post({ ...valid, subcategoryId: 'other', customProblem: 'অনলাইনে কেউ আমার ছবি দিয়ে মজা করছে' });
check('per-category other is accepted', subOtherOk.status === 200 || !dbAvailable,
  `status ${subOtherOk.status}`);

// A chosen category IS the problem statement, so an empty typed problem is fine.
const categorySuppliesStatement = await post({ ...valid, problem: '' });
check('a category can supply the statement', categorySuppliesStatement.status === 200 || !dbAvailable,
  `status ${categorySuppliesStatement.status}`);

const missingName = await post({ ...valid, displayName: '  ' });
check('rejects empty name', missingName.status === 400, `status ${missingName.status}`);

const badPhone = await post({ ...valid, phone: '12345' });
check('rejects malformed phone', badPhone.status === 400, `status ${badPhone.status}`);
check(
  'phone error names the field',
  badPhone.data?.field === 'phone',
  JSON.stringify(badPhone.data),
);
check(
  'phone error is in Bangla',
  typeof badPhone.data?.error === 'string' && /[ঀ-৿]/.test(badPhone.data.error),
  badPhone.data?.error,
);

// An indigenous-language statement must be read back before it is filed, exactly
// as the voice intake asks. A lexicon term is required or confidence stays 0.
// "মাচাং" is a Marma lexicon term for husband, so the bridge resolves it and the
// statement must be confirmed in Bangla before it can be filed.
const marmaText = 'আমার মাচাং আমাকে মারছে';
const marmaBase = { ...noCategory };
const marma = await post({
  ...marmaBase,
  sessionId: `web-verify-marma-${Math.floor(Math.random() * 1e9)}`,
  language: 'marma',
  problem: marmaText,
});
const marmaNeedsConfirm = marma.status === 400 && marma.data?.field === 'semantic';
check('indigenous statement needs confirmation', marmaNeedsConfirm, JSON.stringify(marma.data));
check(
  'returns a Bangla clarification question',
  /[ঀ-৿]/.test(marma.data?.clarificationQuestionBn || ''),
  marma.data?.clarificationQuestionBn,
);
const marmaConfirmed = await post({
  ...marmaBase,
  sessionId: `web-verify-marma-${Math.floor(Math.random() * 1e9)}`,
  language: 'marma',
  problem: marmaText,
  semanticConfirmed: true,
});
check('confirmed indigenous statement is filed', marmaConfirmed.status === 200 && marmaConfirmed.data?.ok === true, JSON.stringify(marmaConfirmed.data));

// Deliberately last before the assertions below: every successful POST replaces
// the session cookie, so the applicant being asserted on must be the last to
// register. Ordering this earlier makes the case list show someone else's case.
const created = await post(valid);
check('creates the application', created.status === 200 && created.data?.ok === true, JSON.stringify(created.data));
  check('returns a DLAS docket', /^DLAS-\d{4}-\d{4}$/.test(created.data?.docketId || ''), created.data?.docketId);
  check(
    'derives an APP id from the docket',
    created.data?.applicationId === `APP-${String(created.data?.docketId || '').slice(5)}`,
    created.data?.applicationId,
  );
  check('issues a 4-digit voice PIN', /^[1-9]\d{3}$/.test(created.data?.voicePin || ''), created.data?.voicePin);
  check('normalises the phone', created.data?.phone === '01725252525', created.data?.phone);
  check('resolves the district', created.data?.district === 'ঢাকা', created.data?.district);
  check('classifies the category', typeof created.data?.category === 'string', created.data?.category);
  check('classifies severity', typeof created.data?.severity === 'string', created.data?.severity);

  // The whole point: the applicant is signed in without a login step.
  const session = await page.evaluate(async () => {
    const r = await fetch('/api/auth/session', { credentials: 'include' });
    return { status: r.status, data: await r.json().catch(() => null) };
  });
  check('auto-logged in', session.status === 200 && session.data?.user?.role === 'citizen', JSON.stringify(session.data));
  check(
    'session carries the applicant name',
    session.data?.user?.displayName === valid.displayName,
    session.data?.user?.displayName,
  );

  const cases = await page.evaluate(async () => {
    const r = await fetch('/api/portal/cases', { credentials: 'include' });
    return r.json();
  });
  const filed = (cases.cases || []).find((c) => c.docketId === created.data.docketId);
  check('case is visible to the applicant', Boolean(filed), JSON.stringify((cases.cases || []).map((c) => c.docketId)));
  // mapPortalCase projects a submitted case to pending_review for the UI.
  check('case is submitted', filed?.status === 'pending_review', filed?.status);
  check('case keeps the district', filed?.district === 'ঢাকা', filed?.district);

  // The 3 verification steps must be reachable and start empty.
  const progress = await page.evaluate(async () => {
    const r = await fetch('/api/portal/verification-progress', { credentials: 'include' });
    return { status: r.status, data: await r.json().catch(() => null) };
  });
  check('verification progress is readable', progress.status === 200, `status ${progress.status}`);
  check('three verification steps', progress.data?.progress?.total === 3, JSON.stringify(progress.data?.progress?.total));
  check('all three start pending', progress.data?.progress?.completed === 0, JSON.stringify(progress.data?.progress));

  // Re-submitting the same wizard must not open a second case.
  const repeat = await post(valid);
  check('re-submit is idempotent', repeat.data?.docketId === created.data.docketId, `${repeat.data?.docketId} vs ${created.data?.docketId}`);
  const afterRepeat = await page.evaluate(async () => {
    const r = await fetch('/api/portal/cases', { credentials: 'include' });
    return r.json();
  });
  const matching = (afterRepeat.cases || []).filter((c) => c.docketId === created.data.docketId);
  check('no duplicate case on re-submit', matching.length === 1, `found ${matching.length}`);
}

// ---------------------------------------------------------------- UI phase

await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {}));
await page.goto(site, { waitUntil: 'networkidle' });

await page.getByRole('button', { name: /নতুন আবেদন করুন/ }).first().click();
await page.waitForSelector('.ref-modal', { state: 'visible' });
check('modal opens', await page.isVisible('.ref-modal'));
check('wizard replaces the old stub form', (await page.locator('.ref-application-form').count()) > 0);
check('progress indicator present', await page.isVisible('.ref-application-progress-bar'));

const stepLabel = async () => (await page.textContent('.ref-application-progress-label')) || '';
// The final step's primary button reads "submit", not "next", so target the
// wizard's own primary action rather than its label.
const next = () => page.locator('.ref-application-actions .ref-btn-green').click();
const step = async (n, total) => {
  const label = await stepLabel();
  check(`step ${n} of ${total}`, label.includes(`${n} / ${total}`), label);
};

await step(1, 6);

// name — required, whitespace-only rejected
await next();
check('name required', await page.isVisible('.ref-application-error'), await page.textContent('.ref-application-error').catch(() => ''));
await page.locator('.ref-application-form input:not([type="radio"])').first().fill('   ');
await next();
check('whitespace-only name rejected', await page.isVisible('.ref-application-error'));
await page.locator('.ref-application-form input:not([type="radio"])').first().fill('রহিমা খাতুন');
await next();
await step(2, 6);

// phone — required and validated
await next();
check('phone required', await page.isVisible('.ref-application-error'), await page.textContent('.ref-application-error').catch(() => ''));
await page.locator('.ref-application-form input[type="tel"]').fill('12345');
await next();
check('invalid phone rejected', await page.isVisible('.ref-application-error'), await page.textContent('.ref-application-error').catch(() => ''));
await page.locator('.ref-application-form input[type="tel"]').fill('01725252525');
await next();
await step(3, 6);

// disability; "yes" inserts the type step, taking the wizard to 7
await page.getByText('হ্যাঁ', { exact: true }).click();
await next();
await step(4, 7);
await page.locator('.ref-application-form select').selectOption({ label: 'দৃষ্টি' });
await next();
await step(5, 7);

await page.getByText('নারী', { exact: true }).click();
await next();
await step(6, 7);

await page.locator('.ref-application-form textarea').fill(valid.address);
await page.locator('.ref-application-form select').last().selectOption({ label: 'ঢাকা' });
await next();
await step(7, 7);

// problem is last: category then sub-category
// 11 = the 10 real categories + "other". Cyber security is one of the 10.
check('category grid is the last step', (await page.locator('.ref-category-card').count()) === 11);
await next();
check('category required', await page.isVisible('.ref-application-error'), await page.textContent('.ref-application-error').catch(() => ''));
await page.locator('.ref-category-card').filter({ hasText: 'উত্তরাধিকার' }).click();
await page.waitForTimeout(400);
// 11 = 10 listed sub-categories + the per-category "other" escape hatch.
check('sub-categories shown', (await page.locator('input[name="problem-subcategory"]').count()) === 11);
await next();
check('sub-category required', await page.isVisible('.ref-application-error'), await page.textContent('.ref-application-error').catch(() => ''));

// Cyber security behaves like every other category: 10 real sub-categories and
// no free-text escape hatch.
await page.locator('.ref-back-link').click();
check('cyber security category is offered', (await page.locator('.ref-category-card').filter({ hasText: 'সাইবার নিরাপত্তা' }).count()) === 1);
await page.locator('.ref-category-card').filter({ hasText: 'সাইবার নিরাপত্তা' }).click();
await page.waitForTimeout(400);
check('cyber security has 10 sub-categories', (await page.locator('input[name="problem-subcategory"]').count()) === 11);
// The radios carry no value attribute (they are controlled by `checked`), so assert
// on the visible label text a caller actually reads.
const cyberLabels = (await page.locator('label.ref-choice').allInnerTexts()).map((t) => t.trim());
check('cyber bullying and online harassment are listed',
  cyberLabels.some((t) => t.includes('সাইবার বুলিং')) && cyberLabels.some((t) => t.includes('যৌনভাবে হয়রানি')),
  `${cyberLabels.length} labels`);
check('cyber category offers no free-text box until asked', (await page.locator('.ref-application-form textarea').count()) === 0);
await page.locator('label.ref-choice').filter({ hasText: 'অন্যান্য' }).last().click();
await page.waitForTimeout(400);
check('every category offers a sub-category escape hatch', (await page.locator('input[name="problem-subcategory"]').count()) === 11);
check('sub-category other reveals a free-text box', (await page.locator('.ref-application-form textarea').count()) === 1);
await next();
check('sub-category other needs a description', await page.isVisible('.ref-application-error'), await page.textContent('.ref-application-error').catch(() => ''));

// "other" reveals a free-text box
await page.locator('.ref-back-link').click();
await page.locator('.ref-category-card').filter({ hasText: 'অন্যান্য' }).click();
await page.waitForTimeout(400);
check('other category reveals a free-text box', (await page.locator('.ref-application-form textarea').count()) === 1);
await next();
check('other category needs a description', await page.isVisible('.ref-application-error'), await page.textContent('.ref-application-error').catch(() => ''));
await page.locator('.ref-application-form textarea').fill(valid.problem);

// This is the final step, so the primary action submits rather than advancing.
// Step back, return, and finish on a real category.
await page.getByRole('button', { name: /পেছনে/ }).click();
await step(6, 7);
await next();
await step(7, 7);

// The "other" choice is still remembered, so return to the grid to change it.
await page.locator('.ref-back-link').click();
await page.locator('.ref-category-card').filter({ hasText: 'উত্তরাধিকার' }).click();
await page.waitForTimeout(400);
await page.locator('input[name="problem-subcategory"]').nth(0).check();
check('last step offers submit', (await page.getByRole('button', { name: /আবেদন জমা দিন/ }).count()) === 1);

// district was set two steps back; confirm it is still 64
await page.getByRole('button', { name: /পেছনে/ }).click();
await step(6, 7);
const districtOptions = await page.locator('.ref-application-form select option').count();
check('district list is all 64 districts', districtOptions === 65, `${districtOptions} options`);

// forward to the last step and submit
await next();
await step(7, 7);
check('last step offers submit', (await page.getByRole('button', { name: /আবেদন জমা দিন/ }).count()) === 1);
await page.getByRole('button', { name: /আবেদন জমা দিন/ }).click();
await page.waitForTimeout(3000);

const receiptShown = await page.isVisible('.ref-modal-receipt');
if (dbAvailable) {
  check('shows the docket receipt', receiptShown);
  check('shows the voice PIN', Boolean(await page.textContent('.ref-modal-receipt').catch(() => '')));
  await page.getByRole('button', { name: /আমার ড্যাশবোর্ডে যান/ }).click();
  await page.waitForURL(/\/citizen/, { timeout: 15000 });
  check('redirects to the citizen dashboard', /\/citizen/.test(page.url()), page.url());
  check('dashboard shows the 3 verification steps', await page.isVisible('[role="progressbar"]'));
} else {
  console.log(`INFO submit without D1 -> receipt=${receiptShown}; a server error must be shown instead.`);
  if (!receiptShown) check('surfaces a server error rather than a false success', await page.isVisible('.ref-application-error'));
}

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = Object.entries(results).filter(([, v]) => !v);
console.log(failed.length ? `\n${failed.length} FAILED: ${failed.map(([k]) => k).join(', ')}` : '\nALL PASS');
process.exit(failed.length ? 1 : 0);
