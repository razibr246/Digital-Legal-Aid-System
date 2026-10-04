import { chromium } from 'playwright-core';

const site = 'https://legal-voice-agent.adribmahmud.workers.dev/';
const HEADING = "পরিচয় যাচাই"; // "পরিচয় যাচাই — ৩ ধাপ"
const THREE = "ধাপ";

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 420, height: 1000 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const results = {};
  const check = (k, v, extra = '') => {
    results[k] = v;
    if (!v) console.log(`  FAIL ${k} ${extra}`);
  };

  await page.goto(site, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await fetch('/api/roles/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        voiceSessionId: `pv-${Math.floor(Math.random() * 1e9)}`,
        docketId: `DLAS-2025-${Math.floor(1000 + Math.random() * 9000)}`,
        displayName: 'অগ্রগতি দেখা',
        phone: '01728282828',
        problem: 'অগ্রগতি',
        indigenousLanguage: 'bn',
        district: 'ঢাকা',
        category: 'land_dispute',
      }),
    });
  });

  const progressText = async () => {
    const bar = page.locator('text=/ধাপ সম্পন্ন/').first();
    if (!(await bar.count())) return null;
    return (await bar.innerText()).replace(/\s+/g, ' ').trim();
  };

  for (const [label, path] of [
    ['DASHBOARD', '/citizen'],
    ['DOCUMENT', '/citizen/verify'],
    ['FACE', '/citizen/verify/face'],
    ['SIGNATURE', '/citizen/verify/signature'],
  ]) {
    await page.goto(site + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    const text = await page.evaluate(() => document.body.innerText);
    const hasBar = text.includes(HEADING) && text.includes(THREE) && /ধাপ সম্পন্ন/.test(text);
    check(`${label}: progress bar visible`, hasBar, (text.slice(0, 120) || '').replace(/\n+/g, ' | '));
    check(`${label}: lists 3 tasks`, /1\.\s*পরিচয়পত্র যাচাই/.test(text) && /2\.\s*মুখ পরীক্ষা/.test(text) && /3\.\s*ই-স্বাক্ষর/.test(text));
    check(`${label}: shows a progressbar`, (await page.locator('[role="progressbar"]').count()) >= 1);
  }

  // completing task 1 must move the bar on the dashboard
  await page.evaluate(async () => {
    await fetch('/api/portal/verify-identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ documentType: 'nid', documentNumber: '19927451234033333' }),
    });
  });
  await page.goto(site + '/citizen', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => document.body.innerText);
  check('dashboard reflects 1/3 after document check', /1\s*\/\s*3 ধাপ সম্পন্ন/.test(after), (after.match(/\d\s*\/\s*3 ধাপ সম্পন্ন/) || [])[0]);
  check('dashboard marks task 1 complete', /1\.\s*পরিচয়পত্র যাচাই[\s\S]{0,120}সম্পন্ন/.test(after));
  await page.screenshot({ path: '/tmp/opencode/dashboard-progress.png' });

  console.log('\n=== RESULTS ===');
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
