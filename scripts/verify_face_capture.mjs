import { chromium } from 'playwright-core';

const site = process.env.SITE_URL || 'https://legal-voice-agent.adribmahmud.workers.dev/';

/**
 * Stands in for a phone camera at the browser API boundary.
 *
 * Chromium's fake capture device reports exactly ONE videoinput, so a dual-camera
 * phone cannot be reproduced without help. It also happily opens a second stream
 * while the first is live, which real devices refuse with NotReadableError
 * ("Could not start video source"). Both behaviours are modelled here so the
 * switch has to release the camera before re-opening it.
 */
async function simulatePhoneCamera(context, { cameras: cameraCount = 2 } = {}) {
  await context.addInitScript((count) => {
    const md = navigator.mediaDevices;
    const realEnum = md.enumerateDevices.bind(md);
    const realGum = md.getUserMedia.bind(md);
    const ALT_SUFFIX = '-sim-front';
    const live = new Set();

    const override = (name, value) =>
      Object.defineProperty(md, name, { value, configurable: true, writable: true });

    override('enumerateDevices', async () => {
      const all = await realEnum();
      const cams = all.filter((d) => d.kind === 'videoinput');
      const rest = all.filter((d) => d.kind !== 'videoinput');
      if (!cams.length || count < 2) return count < 2 ? [...rest, ...cams.slice(0, 1)] : all;
      const primary = cams[0];
      const back = { kind: 'videoinput', deviceId: primary.deviceId, label: primary.label, groupId: primary.groupId };
      const front = {
        kind: 'videoinput',
        deviceId: primary.deviceId + ALT_SUFFIX,
        label: 'Front Camera (simulated)',
        groupId: primary.groupId,
      };
      return [...rest, back, front];
    });

    override('getUserMedia', async (constraints) => {
      // A real device hands out one capture session at a time.
      for (const stream of live) {
        const track = stream.getVideoTracks()[0];
        if (track && track.readyState === 'live') {
          throw new DOMException('Could not start video source', 'NotReadableError');
        }
      }

      const wanted = constraints?.video?.deviceId?.exact ?? constraints?.video?.deviceId;
      let stream;
      if (wanted && String(wanted).endsWith(ALT_SUFFIX)) {
        stream = await realGum({ video: true, audio: false });
        const track = stream.getVideoTracks()[0];
        const real = track.getSettings.bind(track);
        track.getSettings = () => ({ ...real(), deviceId: String(wanted) });
      } else {
        stream = await realGum(constraints);
      }

      live.add(stream);
      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => live.delete(stream));
      }
      return stream;
    });
  }, cameraCount);
}

async function seedSession(page) {
  await page.evaluate(async () => {
    await fetch('/api/roles/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        voiceSessionId: `fc-${Math.floor(Math.random() * 1e9)}`,
        docketId: `DLAS-2025-${Math.floor(1000 + Math.random() * 9000)}`,
        displayName: 'ক্যামেরা পরীক্ষা',
        phone: '01729292929',
        problem: 'ক্যামেরা',
        indigenousLanguage: 'bn',
        district: 'ঢাকা',
        category: 'land_dispute',
      }),
    });
  });
  await page.evaluate(async () => {
    await fetch('/api/portal/verify-identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ documentType: 'nid', documentNumber: '19927451234022222' }),
    });
  });
}

/** Ground truth: what the browser says is currently streaming. */
const activeStream = (page) =>
  page.evaluate(() => {
    const video = document.querySelector('video');
    const track = video?.srcObject?.getVideoTracks?.()[0];
    return {
      deviceId: track?.getSettings?.().deviceId ?? null,
      label: track?.label ?? '',
      playing: video ? !video.paused : false,
      w: video?.videoWidth ?? 0,
    };
  });

const countCameras = (page) =>
  page.evaluate(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'videoinput').length;
  });

async function main() {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const results = {};
  const check = (k, v, extra = '') => {
    results[k] = v;
    if (!v) console.log(`  FAIL ${k} ${extra}`);
  };
  const opts = { viewport: { width: 430, height: 1000 }, isMobile: true, hasTouch: true, permissions: ['camera'] };

  // ---------- dual-camera device: the switch must change the device ----------
  const dualCtx = await browser.newContext(opts);
  await simulatePhoneCamera(dualCtx, { cameras: 2 });
  const page = await dualCtx.newPage();
  await page.goto(site, { waitUntil: 'networkidle' });
  await seedSession(page);

  await page.goto(`${site}citizen/verify/face`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /ক্যামেরা চালু করুন/ }).click();
  await page.waitForTimeout(2500);

  const frame = await page.evaluate(() => {
    const video = document.querySelector('video');
    const holder = video?.parentElement; // the element that wraps the video
    const style = holder ? getComputedStyle(holder) : null;
    const rect = holder?.getBoundingClientRect();
    return {
      hasVideo: !!video,
      playing: video ? !video.paused : false,
      radius: style?.borderTopLeftRadius,
      square: rect ? Math.abs(rect.width - rect.height) < 6 : false,
      maxW: rect ? Math.round(rect.width) : 0,
    };
  });
  check('camera stream live', frame.hasVideo && frame.playing, JSON.stringify(frame));
  check('face frame is square', frame.square, JSON.stringify(frame));
  check('face frame is circular', parseFloat(frame.radius) >= 140, `radius=${frame.radius}`);
  check('face frame is constrained in width', frame.maxW <= 330, `w=${frame.maxW}`);

  check('two cameras reported', (await countCameras(page)) === 2, `cameras=${await countCameras(page)}`);

  const before = await activeStream(page);
  check('a camera device is pinned', !!before.deviceId, JSON.stringify(before));

  const switchBtn = page.getByRole('button', { name: /ক্যামেরা পরিবর্তন করুন/ });
  check('switch button present on dual-camera device', (await switchBtn.count()) === 1, `count=${await switchBtn.count()}`);
  check('switch button announces active camera', /পিছনের ক্যামেরা/.test((await switchBtn.getAttribute('aria-label')) || ''), await switchBtn.getAttribute('aria-label'));

  // The regression that matters: the browser must report a DIFFERENT device,
  // and the old capture must be released first or the device stays busy.
  await switchBtn.click();
  await page.waitForTimeout(2500);
  const after = await activeStream(page);
  check('switching restarts the stream', after.playing && after.w > 0, JSON.stringify(after));
  check('switch actually changes the camera device', !!after.deviceId && after.deviceId !== before.deviceId, `before=${before.deviceId} after=${after.deviceId}`);
  const bodyText = await page.locator('body').innerText();
  check(
    'switch is not blocked by a busy camera',
    !/ক্যামেরা চালু করা যায়নি|ক্যামেরাটি এখন ব্যবহারে আছে/.test(bodyText),
    bodyText.match(/.{0,40}ক্যামেরা.{0,40}/)?.[0] || '',
  );
  check('switch button label updates', /সামনের ক্যামেরা/.test((await switchBtn.getAttribute('aria-label')) || ''), await switchBtn.getAttribute('aria-label'));
  await page.screenshot({ path: '/tmp/opencode/face-circle.png' });

  await switchBtn.click();
  await page.waitForTimeout(2500);
  const backAgain = await activeStream(page);
  check('can switch back to the first camera', backAgain.deviceId === before.deviceId, `expected=${before.deviceId} got=${backAgain.deviceId}`);

  // ---------- document capture must stay rectangular ----------
  await page.goto(`${site}citizen/verify`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await page.getByRole('tab', { name: /ছবি তুলে যাচাই/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /ক্যামেরা চালু করুন/ }).click();
  await page.waitForTimeout(2500);
  const docFrame = await page.evaluate(() => {
    const holder = document.querySelector('video')?.parentElement;
    const rect = holder?.getBoundingClientRect();
    const style = holder ? getComputedStyle(holder) : null;
    return { w: rect ? Math.round(rect.width) : 0, h: rect ? Math.round(rect.height) : 0, radius: style?.borderTopLeftRadius };
  });
  const docRatio = docFrame.w / Math.max(1, docFrame.h);
  check('document frame stays landscape', docRatio > 1.4, `ratio=${docRatio.toFixed(2)} ${docFrame.w}x${docFrame.h}`);
  check('document frame is not circular', parseFloat(docFrame.radius) < 100, `radius=${docFrame.radius}`);
  check('document frame is wider than tall', docFrame.w > docFrame.h, `${docFrame.w}x${docFrame.h}`);
  await page.screenshot({ path: '/tmp/opencode/doc-rect.png' });
  await dualCtx.close();

  // ---------- single-camera device: offered, but must degrade gracefully ----------
  // iOS reports one video input and still switches via facingMode, so the button
  // stays; what matters is that pressing it never leaves the citizen stuck.
  const singleCtx = await browser.newContext(opts);
  await simulatePhoneCamera(singleCtx, { cameras: 1 });
  const singlePage = await singleCtx.newPage();
  await singlePage.goto(site, { waitUntil: 'networkidle' });
  await seedSession(singlePage);
  await singlePage.goto(`${site}citizen/verify/face`, { waitUntil: 'networkidle' });
  await singlePage.waitForTimeout(1800);
  await singlePage.getByRole('button', { name: /ক্যামেরা চালু করুন/ }).click();
  await singlePage.waitForTimeout(2500);
  const singleSwitch = singlePage.getByRole('button', { name: /ক্যামেরা পরিবর্তন করুন/ });
  check('switch button still offered when one camera is reported', (await singleSwitch.count()) === 1, `count=${await singleSwitch.count()}`);
  await singleSwitch.click();
  await singlePage.waitForTimeout(2500);
  const singleLive = await activeStream(singlePage);
  check('single-camera device keeps a working stream after switching', singleLive.playing && singleLive.w > 0, JSON.stringify(singleLive));
  const singleText = await singlePage.locator('body').innerText();
  check('single-camera switch is not an error state', !/ক্যামেরা চালু করা যায়নি|ক্যামেরাটি এখন ব্যবহারে আছে/.test(singleText), singleText.match(/.{0,40}ক্যামেরা.{0,40}/)?.[0] || '');
  await singleCtx.close();

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
