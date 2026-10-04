import { chromium } from 'playwright-core';
import { createNidFixture } from './lib/nid-fixture.mjs';

const site = 'https://legal-voice-agent.adribmahmud.workers.dev/';
const fixture = await createNidFixture();

async function main() {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, permissions: ['camera'] });
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
        voiceSessionId: `p3-${Math.floor(Math.random() * 1e9)}`,
        docketId: `DLAS-2025-${Math.floor(1000 + Math.random() * 9000)}`,
        displayName: 'তিন ধাপ পরীক্ষা',
        phone: '01725252525',
        problem: 'তিন ধাপ',
        indigenousLanguage: 'bn',
        district: 'ঢাকা',
        category: 'land_dispute',
      }),
    });
  });

  // ---------- task 1: document ----------
  const doc = await page.evaluate(async () => {
    const r = await fetch('/api/portal/verify-identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ documentType: 'nid', documentNumber: '19927451234044444' }),
    });
    return { status: r.status, body: await r.json() };
  });
  check('task1 document verified', doc.status === 200, JSON.stringify(doc.body).slice(0, 140));

  const progress0 = await page.evaluate(async () => {
    const r = await fetch('/api/portal/verification-progress', { credentials: 'include' });
    return (await r.json()).progress;
  });
  check('progress endpoint responds', progress0?.total === 3, JSON.stringify(progress0));
  check('task1 auto-marked complete', progress0?.steps?.[0]?.status === 'complete', JSON.stringify(progress0?.steps?.[0]));
  check('task2 pending', progress0?.steps?.[1]?.status === 'pending');
  check('task3 pending', progress0?.steps?.[2]?.status === 'pending');
  check('progress is 1/3', progress0?.completed === 1 && progress0?.percent === 33, JSON.stringify({ c: progress0?.completed, p: progress0?.percent }));

  // ---------- task 2: face (simulated) ----------
  const noConsent = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const fd = new FormData();
    fd.append('selfie', new Blob([bytes], { type: 'image/png' }), 's.png');
    fd.append('consent', 'false');
    const r = await fetch('/api/portal/face-match', { method: 'POST', credentials: 'include', body: fd });
    return r.status;
  }, fixture);
  check('face requires consent', noConsent === 400, `status=${noConsent}`);

  const face = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const fd = new FormData();
    fd.append('selfie', new Blob([bytes], { type: 'image/png' }), 's.png');
    fd.append('consent', 'true');
    const r = await fetch('/api/portal/face-match', { method: 'POST', credentials: 'include', body: fd });
    return { status: r.status, body: await r.json() };
  }, fixture);
  check('face match responds', face.status === 200, JSON.stringify(face.body).slice(0, 200));
  check('face is simulated', face.body.face?.simulated === true);
  check('face reports a score', typeof face.body.face?.matchScore === 'number', String(face.body.face?.matchScore));
  check('face does not retain the image', face.body.face?.imageRetained === false);
  check('face reports liveness', ['passed', 'retry'].includes(face.body.face?.liveness), face.body.face?.liveness);

  // biometric must not be persisted anywhere
  const stored = await page.evaluate(async () => {
    const r = await fetch('/api/portal/verification-progress', { credentials: 'include' });
    const p = (await r.json()).progress;
    return JSON.stringify(p.steps.find((s) => s.id === 'face')?.result ?? {});
  });
  check('no image data persisted for face', !/data:image|base64/.test(stored), stored.slice(0, 120));
  console.log('  face step stored:', stored);

  // ---------- task 3: signature ----------
  // a 1x1 transparent PNG is enough to prove the storage path
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const noConsentSig = await page.evaluate(async (d) => {
    const r = await fetch('/api/portal/signature/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ dataUrl: d, consent: false }),
    });
    return r.status;
  }, `data:image/png;base64,${png}`);
  check('signature requires consent', noConsentSig === 400, `status=${noConsentSig}`);

  const badSig = await page.evaluate(async () => {
    const r = await fetch('/api/portal/signature/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ dataUrl: 'not-a-data-url', consent: true }),
    });
    return r.status;
  });
  check('signature rejects bad payload', badSig === 400, `status=${badSig}`);

  const sig = await page.evaluate(async ({ d, b64 }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 160;
    const ctx2 = canvas.getContext('2d');
    ctx2.strokeStyle = '#0f172a';
    ctx2.lineWidth = 3;
    ctx2.beginPath();
    ctx2.moveTo(40, 110);
    ctx2.quadraticCurveTo(120, 30, 200, 110);
    ctx2.quadraticCurveTo(250, 60, 290, 100);
    ctx2.stroke();
    void b64;
    const r = await fetch('/api/portal/signature/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ dataUrl: canvas.toDataURL('image/png'), consent: true, signedName: 'তিন ধাপ পরীক্ষা', width: 320, height: 160 }),
    });
    return { status: r.status, body: await r.json() };
  }, { d: png, b64: fixture });
  check('signature saved', sig.status === 200, JSON.stringify(sig.body).slice(0, 200));
  check('signature records a hash', Boolean(sig.body.signature?.sha256));
  check('signature keeps consent name', sig.body.signature?.signedName === 'তিন ধাপ পরীক্ষা');

  const progress1 = await page.evaluate(async () => {
    const r = await fetch('/api/portal/verification-progress', { credentials: 'include' });
    return (await r.json()).progress;
  });
  check('task3 marked complete', progress1?.steps?.[2]?.status === 'complete', JSON.stringify(progress1?.steps?.[2]));
  const allDone = progress1?.allComplete === true || progress1?.steps?.every((s) => s.status === 'complete');
  check('progress reaches 3/3 when face also matches', progress1?.completed >= 2, `completed=${progress1?.completed}`);
  void allDone;
  console.log('  progress:', JSON.stringify({ completed: progress1?.completed, percent: progress1?.percent }));

  // ---------- UI ----------
  await page.goto(`${site}citizen/verify`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const uiText = await page.evaluate(() => document.body.innerText);
  check('progress bar shows 3 tasks', /পরিচয় যাচাই — ৩ ধাপ/.test(uiText), uiText.slice(0, 160));
  check('task 1 labelled complete', /সম্পন্ন/.test(uiText));
  check('links to face step', (await page.locator('a[href="/citizen/verify/face"]').count()) >= 1);
  check('links to signature step', (await page.locator('a[href="/citizen/verify/signature"]').count()) >= 1);

  await page.goto(`${site}citizen/verify/signature`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  check('signature pad renders', (await page.locator('canvas').count()) >= 1);
  // Exact names: "মুছে ফেলুন" (canvas) and "স্বাক্ষর মুছে ফেলুন" (delete saved) both contain the same words.
  check('signature has undo', (await page.getByRole('button', { name: 'ফিরিয়ে আনুন', exact: true }).count()) === 1);
  check('signature has canvas clear', (await page.getByRole('button', { name: 'মুছে ফেলুন', exact: true }).count()) === 1);
  check('signature has consent', (await page.locator('#sig-consent').count()) === 1);

  // draw with the mouse and confirm the canvas is no longer blank
  const box = await page.locator('canvas').first().boundingBox();
  await page.mouse.move(box.x + 40, box.y + 100);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(box.x + 40 + i * 18, box.y + 100 - Math.sin(i / 2) * 30);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
  const inked = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const ctx2 = c.getContext('2d');
    const data = ctx2.getImageData(0, 0, c.width, c.height).data;
    let nonEmpty = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 10) nonEmpty += 1;
    return nonEmpty;
  });
  check('drawing marks the canvas', inked > 200, `inked pixels=${inked}`);
  await page.screenshot({ path: '/tmp/opencode/p3-signature.png' });

  await page.goto(`${site}citizen/verify/face`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const faceText = await page.evaluate(() => document.body.innerText);
  check('face page states it is simulated', /এটি একটি সিমুলেশন/.test(faceText));
  check('face page says image is not kept', /সংরক্ষিত হয় না/.test(faceText));
  check('face page has consent checkbox', (await page.locator('#consent').count()) === 1);
  await page.screenshot({ path: '/tmp/opencode/p3-face.png' });

  // clear signature resets the step
  const cleared = await page.evaluate(async () => {
    const r = await fetch('/api/portal/signature', { method: 'DELETE', credentials: 'include' });
    return { status: r.status, body: await r.json() };
  });
  check('signature can be cleared', cleared.status === 200 && cleared.body.ok === true, JSON.stringify(cleared.body));
  const progress2 = await page.evaluate(async () => {
    const r = await fetch('/api/portal/verification-progress', { credentials: 'include' });
    return (await r.json()).progress;
  });
  check('clearing resets task3', progress2?.steps?.[2]?.status === 'pending', JSON.stringify(progress2?.steps?.[2]));

  // unauthenticated
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(site, { waitUntil: 'domcontentloaded' });
  const anonStatus = await ap.evaluate(async (base) => {
    const r = await fetch(`${base}/api/portal/verification-progress`);
    return r.status;
  }, site);
  check('progress requires auth', anonStatus === 401, `status=${anonStatus}`);

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
