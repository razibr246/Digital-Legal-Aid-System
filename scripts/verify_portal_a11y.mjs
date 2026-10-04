import { chromium } from 'playwright-core';

const site = 'https://legal-voice-agent.adribmahmud.workers.dev/';

async function main() {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext();
  await ctx.grantPermissions(['microphone']);
  const page = await ctx.newPage();

  const results = {};
  const check = (k, v) => {
    results[k] = v;
  };

  // ---------- landing page accessibility ----------
  await page.goto(site, { waitUntil: 'networkidle' });

  check('skip link present', (await page.locator('a.ref-skip-link').count()) === 1);
  check('main landmark has id', (await page.locator('main#ref-main').count()) === 1);
  check('html lang is bn', (await page.getAttribute('html', 'lang')) === 'bn');
  check('notice table has caption', (await page.locator('table.ref-notice-table caption').count()) === 1);
  check('notice filters expose aria-pressed', (await page.locator('.ref-filters button[aria-pressed]').count()) >= 5);
  check('office results are a live region', (await page.locator('.ref-finder p[role="status"]').count()) === 1);
  check('nav has accessible name', (await page.locator('nav[aria-label]').count()) >= 1);
  check(
    'no literal HTML tags in text',
    !(await page.evaluate(() => document.body.innerText)).includes('<strong>'),
  );
  check('exactly one h1', (await page.locator('h1').count()) === 1);

  // skip link becomes visible on focus
  await page.keyboard.press('Tab');
  const skipFocused = await page.evaluate(() => document.activeElement?.className?.includes('ref-skip-link'));
  check('skip link is first tab stop', Boolean(skipFocused));

  // modal: Escape closes and focus returns
  await page.getByRole('button', { name: /Start a new application|নতুন আবেদন করুন/ }).first().click();
  await page.waitForTimeout(500);
  check('dialog opens', (await page.locator('[role="dialog"][aria-modal="true"]').count()) === 1);
  const focusInside = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
    return !!dlg && dlg.contains(document.activeElement);
  });
  check('focus moves into dialog', focusInside);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Escape closes dialog', (await page.locator('[role="dialog"][aria-modal="true"]').count()) === 0);

  // ---------- citizen portal ----------
  // create a citizen session
  await page.goto(site, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await fetch('/api/roles/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        voiceSessionId: 'a11y-profile-probe',
        docketId: 'DLAS-2025-4242',
        displayName: 'প্রোফাইল পরীক্ষা',
        phone: '01912345678',
        problem: 'অ্যাক্সেসিবিলিটি যাচাইয়ের জন্য পরীক্ষামূলক আবেদন',
        hasDisability: true,
        gender: 'female',
        address: 'খুলনা সদর',
        indigenousLanguage: 'bn',
        district: 'খুলনা',
        category: 'domestic_violence',
      }),
    });
  });
  await page.waitForTimeout(500);

  const profileApi = await page.evaluate(async () => {
    const r = await fetch('/api/portal/profile', { credentials: 'include' });
    return { status: r.status, body: await r.json() };
  });
  check('profile API 200', profileApi.status === 200);
  check('profile API returns name', profileApi.body?.profile?.displayName === 'প্রোফাইল পরীক্ষা');
  check('profile API returns phone', profileApi.body?.profile?.phone === '01912345678');
  check('profile API returns memberSince', Boolean(profileApi.body?.profile?.memberSince));
  check('profile API counts application', profileApi.body?.stats?.totalApplications >= 1);
  check('profile API counts disability/voice', profileApi.body?.stats?.voiceApplications >= 1);
  check('profile API lists application', (profileApi.body?.applications?.length ?? 0) >= 1);
  check('application has docket id', /^DLAS-/.test(profileApi.body?.applications?.[0]?.docketId || ''));

  await page.goto(`${site}citizen/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const profileText = await page.evaluate(() => document.body.innerText);
  check('profile page renders name', profileText.includes('প্রোফাইল পরীক্ষা'));
  check('profile page shows phone', profileText.includes('01912345678'));
  check('profile page shows verification', profileText.includes('যাচাই'));
  check('profile page shows stats', profileText.includes('মোট আবেদন'));
  check('profile page lists application', /DLAS-\d{4}-\d{4}/.test(profileText));
  check('profile page has logout', profileText.includes('লগআউট'));

  await page.goto(`${site}citizen`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const dashText = await page.evaluate(() => document.body.innerText);
  const navLinks = await page.locator('nav[aria-label] a').allTextContents();
  check('dashboard nav has profile', navLinks.some((l) => l.includes('প্রোফাইল')));
  check('dashboard nav has apply', navLinks.some((l) => l.includes('আবেদন')));
  check('dashboard nav has track', navLinks.some((l) => l.includes('ট্র্যাক')));
  check('dashboard nav has documents', navLinks.some((l) => l.includes('ডকুমেন্ট')));
  check('dashboard nav has sms', navLinks.some((l) => l.includes('এসএমএস')));
  // The shell renders a desktop row and a mobile panel; each marks the current
  // page exactly once, and exactly one of them is visible per viewport.
  const navState = await page.evaluate(() =>
    [...document.querySelectorAll('nav[aria-label]')].map((nav) => ({
      current: nav.querySelectorAll('[aria-current="page"]').length,
      visible: getComputedStyle(nav).display !== 'none',
    })),
  );
  const exactlyOneMarkEach = navState.every((n) => n.current === 1);
  const exactlyOneVisible = navState.filter((n) => n.visible).length === 1;
  check('dashboard marks current page', exactlyOneMarkEach && exactlyOneVisible, JSON.stringify(navState));
  check('dashboard shows docket not uuid', /DLAS-\d{4}-\d{4}/.test(dashText));
  check('dashboard hides internal uuid', !dashText.includes('CASE-'));
  check('dashboard no English Loading', !dashText.includes('Loading...'));
  check('dashboard links to profile', (await page.locator('a[href="/citizen/profile"]').count()) >= 1);

  console.log('=== RESULTS ===');
  let failed = 0;
  for (const [k, v] of Object.entries(results)) {
    if (!v) failed++;
    console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
  }
  console.log(failed === 0 ? '\nVERIFICATION PASSED' : `\n${failed} FAILED`);
  await browser.close();
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
