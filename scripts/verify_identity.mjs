import { chromium } from 'playwright-core';
import { createNidFixture } from './lib/nid-fixture.mjs';

const site = 'https://legal-voice-agent.adribmahmud.workers.dev/';

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

  // citizen session
  await page.goto(site, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await fetch('/api/roles/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        voiceSessionId: `idv-${Math.floor(Math.random() * 1e9)}`,
        docketId: `DLAS-2025-${Math.floor(1000 + Math.random() * 9000)}`,
        displayName: 'যাচাই পরীক্ষা',
        phone: '01712121212',
        problem: 'পরিচয় যাচাই পরীক্ষা',
        indigenousLanguage: 'bn',
        district: 'ঢাকা',
        category: 'land_dispute',
      }),
    });
  });

  // ---- profile card shows the CTA ----
  await page.goto(`${site}citizen/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const profileText = await page.evaluate(() => document.body.innerText);
  check('profile shows unverified state', /যাচাই বাকি|যাচাই প্রক্রিয়াধীন/.test(profileText), profileText.slice(0, 200));
  check('profile has verify CTA', (await page.locator('a[href="/citizen/verify"]').count()) >= 1);

  // ---- validation: bad numbers rejected ----
  await page.goto(`${site}citizen/verify`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('verify page renders', (await page.locator('#doc-number').count()) === 1);

  const post = (body) =>
    page.evaluate(async (b) => {
      const r = await fetch('/api/portal/verify-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(b),
      });
      return { status: r.status, body: await r.json() };
    }, body);

  const short = await post({ documentType: 'nid', documentNumber: '123' });
  check('rejects short NID', short.status === 400, JSON.stringify(short.body));

  // 12 digits is not a valid BD NID: must be rejected outright on the number path
  const twelve = await post({ documentType: 'nid', documentNumber: '199274512340' });
  check('rejects 12-digit NID', twelve.status === 400, JSON.stringify(twelve.body));

  const badPassport = await post({ documentType: 'passport', documentNumber: '12345' });
  check('rejects malformed passport', badPassport.status === 400, JSON.stringify(badPassport.body));

  const autodetect = await post({ documentType: 'auto', documentNumber: 'AB1234567' });
  check('autodetects passport', autodetect.status === 200 && autodetect.body.verification?.documentType === 'passport', JSON.stringify(autodetect.body).slice(0, 200));

  // ---- valid NID -> simulated record, persisted ----
  const valid = await post({ documentType: 'nid', documentNumber: '19927451234012345' });
  check('accepts valid NID', valid.status === 200, JSON.stringify(valid.body).slice(0, 200));
  check('marks result simulated', valid.body.verification?.simulated === true);
  check('returns masked number', /^•+\d{4}$/.test(valid.body.verification?.documentNumberMasked || ''), valid.body.verification?.documentNumberMasked);
  check('returns extracted name', Boolean(valid.body.verification?.nameEn || valid.body.verification?.nameBn));
  check('sets a status', ['verified', 'review'].includes(valid.body.verification?.status));
  check('reports name match', typeof valid.body.verification?.nameMatch === 'boolean');
  check('returns the document name as profile name', Boolean(valid.body.verification?.profileName), valid.body.verification?.profileName);
  const profileAfterVerify = await page.evaluate(async () => {
    const r = await fetch('/api/portal/profile', { credentials: 'include' });
    return (await r.json()).profile?.displayName;
  });
  check('name auto-updated to the NID name', profileAfterVerify === valid.body.verification?.profileName, `profile="${profileAfterVerify}" doc="${valid.body.verification?.profileName}"`);
  check('valid NID marked format-ok', valid.body.verification?.documentNumberValid === true);
  console.log('  NID result:', valid.body.verification?.status, '| nameMatch:', valid.body.verification?.nameMatch, '| name:', valid.body.verification?.nameEn);

  // ---- history endpoint ----
  const history = await page.evaluate(async () => {
    const r = await fetch('/api/portal/verifications', { credentials: 'include' });
    return { status: r.status, body: await r.json() };
  });
  check('history returns records', history.status === 200 && history.body.verifications.length >= 1, JSON.stringify(history.body).slice(0, 160));

  // ---- profile reflects verification ----
  const profile = await page.evaluate(async () => {
    const r = await fetch('/api/portal/profile', { credentials: 'include' });
    return await r.json();
  });
  check('profile exposes identity summary', Boolean(profile.identity), JSON.stringify(profile.identity));
  check('profile shows latest document', Boolean(profile.identity?.latest?.documentNumberMasked));
  console.log('  profile identity:', JSON.stringify(profile.identity));

  // ---- name-mismatch path + rename ----
  if (valid.body.verification?.nameMatch === false) {
    check('mismatch detail present', Boolean(valid.body.verification?.nameMismatchDetail));
  } else {
    console.log('  (name matched; mismatch UI path covered by unit-level compareNames)');
  }

  // ---- OCR photo path against the real DeepInfra model ----
  const png = await createNidFixture();
  const ocr = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const fd = new FormData();
    fd.append('photo', new Blob([bytes], { type: 'image/png' }), 'nid.png');
    fd.append('documentType', 'nid');
    const r = await fetch('/api/portal/verify-identity', { method: 'POST', credentials: 'include', body: fd });
    return { status: r.status, body: await r.json() };
  }, png);
  check('OCR path succeeds', ocr.status === 200, JSON.stringify(ocr.body).slice(0, 240));
  check('OCR identifies NID', ocr.body.verification?.documentType === 'nid', JSON.stringify(ocr.body).slice(0, 240));
  check('OCR reads document number', Boolean(ocr.body.verification?.documentNumberMasked), JSON.stringify(ocr.body).slice(0, 240));
  check('OCR flagged simulated', ocr.body.verification?.simulated === true);
  check('OCR reports confidence', typeof ocr.body.verification?.ocrConfidence === 'number');
  check('OCR records model', ocr.body.verification?.ocrModel === 'Qwen/Qwen3-VL-30B-A3B-Instruct', ocr.body.verification?.ocrModel);
  // the fixture prints a valid 17-digit NID, so the number must pass validation
  check('OCR number passes validation', ocr.body.verification?.documentNumberValid === true, String(ocr.body.verification?.documentNumberValid));
  check('OCR reads mother name', Boolean(ocr.body.verification?.motherName), ocr.body.verification?.motherName);
  check('OCR reads full address', (ocr.body.verification?.address || '').length > 8, ocr.body.verification?.address);
  check('returns full number for reveal', /^\d{17}$/.test(ocr.body.verification?.documentNumber || ''), ocr.body.verification?.documentNumber);
  console.log('  OCR result:', JSON.stringify({
    status: ocr.body.verification?.status,
    doc: ocr.body.verification?.documentNumberMasked,
    nameEn: ocr.body.verification?.nameEn,
    motherName: ocr.body.verification?.motherName,
    address: ocr.body.verification?.address,
    confidence: ocr.body.verification?.ocrConfidence,
  }));

  // ---- save/accept: persists accepted_at and updates user status ----
  // Use a fresh record: the rename block above already accepted the earlier one.
  const fresh = await post({ documentType: 'nid', documentNumber: '19927451234098764' });
  check('fresh record created for save flow', fresh.status === 200, JSON.stringify(fresh.body).slice(0, 140));

  // Look up by id: the OCR run happens later, so index 0 is a different record.
  const findAccepted = (id) => page.evaluate(async ({ base, want }) => {
    const r = await fetch(`${base}/api/portal/verifications`, { credentials: 'include' });
    const rows = (await r.json()).verifications ?? [];
    return rows.find((row) => row.id === want)?.accepted_at ?? null;
  }, { base: site, want: id });

  const beforeAccept = await findAccepted(fresh.body.verification?.id);
  check('result starts unaccepted', beforeAccept === null, `accepted_at=${beforeAccept}`);

  const vid = fresh.body.verification?.id;
  const saveRes = await page.evaluate(async ({ base, id }) => {
    const r = await fetch(`${base}/api/portal/verify-identity/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ verificationId: id }),
    });
    return { status: r.status, body: await r.json() };
  }, { base: site, id: vid });
  check('accept endpoint 200', saveRes.status === 200, JSON.stringify(saveRes.body).slice(0, 160));
  check('accept returns timestamp', Boolean(saveRes.body.acceptedAt));
  // name mismatch -> stays pending; match -> verified
  const expectedStatus = fresh.body.verification?.nameMatch ? 'verified' : 'pending';
  check('accept sets expected user status', saveRes.body.verificationStatus === expectedStatus, `got=${saveRes.body.verificationStatus} want=${expectedStatus}`);

  const afterAccept = await findAccepted(fresh.body.verification?.id);
  check('accepted_at persisted', Boolean(afterAccept), `accepted_at=${afterAccept}`);

  const badAccept = await page.evaluate(async ({ base, id }) => {
    const r = await fetch(`${base}/api/portal/verify-identity/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ verificationId: id }),
    });
    return r.status;
  }, { base: site, id: 'IDV-does-not-exist' });
  check('rejects unknown verification id', badAccept === 400, `status=${badAccept}`);

  const noId = await page.evaluate(async (base) => {
    const r = await fetch(`${base}/api/portal/verify-identity/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    return r.status;
  }, site);
  check('requires verificationId', noId === 400, `status=${noId}`);

  // ---- the citizen can change their own name from the profile ----
  const renamedByUser = await page.evaluate(async () => {
    const r = await fetch('/api/portal/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ displayName: 'ব্যবহারকারীর নাম' }),
    });
    return { status: r.status, body: await r.json() };
  });
  check('allows the citizen to rename', renamedByUser.status === 200, JSON.stringify(renamedByUser.body).slice(0, 140));
  check('rename echoes the new name', renamedByUser.body?.displayName === 'ব্যবহারকারীর নাম');

  const drifted = await page.evaluate(async () => {
    const r = await fetch('/api/portal/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ displayName: 'সম্পূর্ণ ভিন্ন নাম' }),
    });
    return { status: r.status, body: await r.json() };
  });
  check('rename warns when it no longer matches the NID', Boolean(drifted.body?.nameWarning), JSON.stringify(drifted.body).slice(0, 200));

  const tooShort = await page.evaluate(async () => {
    const r = await fetch('/api/portal/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ displayName: 'ক' }),
    });
    return r.status;
  });
  check('rejects a too-short name', tooShort === 400, `status=${tooShort}`);

  // The profile page must expose the rename control.
  await page.goto(`${site}citizen/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const renameBtn = page.getByRole('button', { name: 'নাম পরিবর্তন' });
  check('profile has rename button', (await renameBtn.count()) >= 1);
  if (await renameBtn.count()) {
    await renameBtn.first().click();
    await page.waitForTimeout(400);
    check('rename editor opens', (await page.locator('input[aria-label="আপনার নাম"]').count()) === 1);
    await page.locator('input[aria-label="আপনার নাম"]').fill('পরীক্ষামূলক নাম');
    await page.getByRole('button', { name: 'সংরক্ষণ করুন' }).click();
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() => document.body.innerText);
    check('new name shown after save', after.includes('পরীক্ষামূলক নাম'), after.slice(0, 120));
  }

  // ---- rejects non-image ----
  const notImage = await page.evaluate(async () => {
    const fd = new FormData();
    fd.append('photo', new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }), 'x.pdf');
    const r = await fetch('/api/portal/verify-identity', { method: 'POST', credentials: 'include', body: fd });
    return r.status;
  });
  check('rejects non-image upload', notImage === 400, `status=${notImage}`);

  // ---- unauthenticated is rejected ----
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(site, { waitUntil: 'domcontentloaded' });
  const anonStatus = await anonPage.evaluate(async (base) => {
    const r = await fetch(`${base}/api/portal/verify-identity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentType: 'nid', documentNumber: '199274512340' }),
    });
    return r.status;
  }, site);
  check('rejects unauthenticated', anonStatus === 401, `status=${anonStatus}`);

  // ---- the reported NID, in a session whose name matches it ----
  // Regression: 1234567890 derived nameBn "নাসরিন ইব্রাহিম" (given name plus
  // FATHER) while nameEn was "Nasrin Akter", so the two halves of one record
  // disagreed and the name check failed on every run. Needs its own session
  // because earlier checks in this suite rename the profile.
  await page.evaluate(async () => {
    await fetch('/api/roles/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        voiceSessionId: `idv-rep-${Math.floor(Math.random() * 1e9)}`,
        docketId: `DLAS-2025-${Math.floor(1000 + Math.random() * 9000)}`,
        displayName: 'Nasrin Akter',
        phone: '01713131313',
        problem: 'নাম যাচাই পরীক্ষা',
        indigenousLanguage: 'bn',
        district: 'ঢাকা',
        category: 'land_dispute',
      }),
    });
  });
  const reported = await page.evaluate(async () => {
    const r = await fetch('/api/portal/verify-identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ documentType: 'nid', documentNumber: '1234567890' }),
    });
    return { status: r.status, body: await r.json() };
  });
  const rv = reported.body.verification || {};
  const fatherTokens = ['আব্দুল করিম', 'ইব্রাহিম', 'আব্দুল হাকিম', 'আনোয়ার হোসেন', 'রফিকুল'];
  const surnames = ['বেগম', 'ইসলাম', 'আক্তার', 'খাতুন', 'সুলতানা', 'হক', 'চৌধুরী', 'রহমান'];
  check('reported NID is accepted', reported.status === 200, JSON.stringify(reported.body).slice(0, 200));
  check('reported NID name is not a first+father merge', !fatherTokens.some((t) => (rv.nameBn || '').includes(t)), `nameBn=${rv.nameBn} father=${rv.fatherName}`);
  check('reported NID Bangla name ends in a surname', surnames.includes((rv.nameBn || '').trim().split(/\s+/).pop() || ''), `nameBn=${rv.nameBn}`);
  check('reported NID name is two words', (rv.nameBn || '').trim().split(/\s+/).length === 2, `nameBn=${rv.nameBn}`);
  check('reported NID name matches the typed name', rv.nameMatch === true, `nameMatch=${rv.nameMatch} detail=${rv.nameMismatchDetail}`);
  check('reported NID verifies cleanly', rv.status === 'verified', `status=${rv.status} detail=${rv.nameMismatchDetail}`);
  check('reported NID profile name is the clean name', rv.profileName === rv.nameBn, `profile="${rv.profileName}" nameBn="${rv.nameBn}"`);
  console.log('  reported NID:', rv.status, '| nameEn:', rv.nameEn, '| nameBn:', rv.nameBn, '| nameMatch:', rv.nameMatch);

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
