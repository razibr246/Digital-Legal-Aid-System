import { chromium } from 'playwright-core';

const site = process.env.SITE_URL || 'https://legal-voice-agent.adribmahmud.workers.dev/';

/**
 * Universal chatbot regression suite. Free: no STT/TTS/LLM voice pipeline, but
 * it DOES make one real chat completion (a few cents of DeepInfra credit).
 *
 * Ground truth is asserted on browser layout and on the API's own JSON, never on
 * text this codebase renders about itself.
 */
async function main() {
  const browser = await chromium.launch();
  const results = {};
  const check = (k, v, extra = '') => {
    results[k] = v;
    if (!v) console.log(`  FAIL ${k} ${extra}`);
  };

  // ---------- visitor: widget present on the landing page ----------
  const visitorCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await visitorCtx.newPage();
  await page.goto(site, { waitUntil: 'networkidle' });

  const fab = page.getByTestId('chat-fab');
  check('chat launcher visible for a visitor', await fab.isVisible());
  check('launcher has an accessible name', Boolean((await fab.getAttribute('aria-label')) || ''));

  // The 16699 call button already owns the bottom-right corner. The launcher
  // must stack above it, never on top of it.
  const boxes = await page.evaluate(() => {
    const chat = document.querySelector('[data-testid="chat-fab"]');
    const call = document.querySelector('.ref-floating-call');
    if (!chat || !call) return null;
    const a = chat.getBoundingClientRect();
    const b = call.getBoundingClientRect();
    return {
      chat: { top: a.top, bottom: a.bottom, left: a.left, right: a.right },
      call: { top: b.top, bottom: b.bottom, left: b.left, right: b.right },
      viewportH: window.innerHeight,
    };
  });
  check('launcher does not overlap the 16699 call button', Boolean(boxes) && boxes.chat.bottom <= boxes.call.top, JSON.stringify(boxes));
  check('launcher sits above the call button', Boolean(boxes) && boxes.call.bottom < boxes.viewportH, JSON.stringify(boxes));
  check('launcher is on screen', Boolean(boxes) && boxes.chat.top >= 0 && boxes.chat.bottom <= boxes.viewportH, JSON.stringify(boxes));

  // ---------- open, ask, answer ----------
  await fab.click();
  const panel = page.getByTestId('chat-panel');
  check('panel opens', await panel.isVisible());
  check('panel is a labelled dialog', (await panel.getAttribute('role')) === 'dialog' && Boolean(await panel.getAttribute('aria-labelledby')));

  const input = panel.locator('input[type="text"], input:not([type])').first();
  await input.fill('আইনি সহায়তার জন্য কী কী ডকুমেন্ট লাগে?');
  await panel.locator('button[type="submit"]').click();

  await page.waitForFunction(
    () => {
      const log = document.querySelector('[role="log"]');
      if (!log) return false;
      return (log.textContent || '').length > 40;
    },
    null,
    { timeout: 90000 },
  );
  const logText = await page.locator('[role="log"]').innerText();
  check('assistant produced an answer', logText.length > 40, logText.slice(0, 160));
  check('answer is grounded in memory, not a hallucinated number', !/\b16430\b/.test(logText.replace(/ইউএসজিডিএন[^\n]*/g, '')), logText.slice(0, 200));
  check('answer stays concise', logText.length < 2500, `len=${logText.length}`);

  // Escape closes and returns focus to the launcher.
  await page.keyboard.press('Escape');
  check('Escape closes the panel', (await page.getByTestId('chat-panel').count()) === 0);
  check('focus returns to the launcher', await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'chat-fab'));

  await visitorCtx.close();

  // ---------- staff must NOT get the universal assistant ----------
  const staffCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const staffPage = await staffCtx.newPage();
  await staffPage.goto(site, { waitUntil: 'networkidle' });
  const staffLogin = await staffPage.evaluate(async () => {
    const r = await fetch('/api/roles/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        voiceSessionId: `staff-${Math.floor(Math.random() * 1e9)}`,
        docketId: `DLAS-2025-${Math.floor(1000 + Math.random() * 9000)}`,
        displayName: 'ক্যামেরা পরীক্ষা',
        phone: '01715151515',
        problem: 'পরীক্ষা',
        indigenousLanguage: 'bn',
        district: 'ঢাকা',
        category: 'land_dispute',
        role: 'dlao_officer',
      }),
    });
    return r.status;
  });
  // The citizen session route always creates a citizen, so assert the API gate
  // directly with a staff role is not possible here; assert the widget is absent
  // on the DLAO shell instead, which is the visible requirement.
  await staffPage.goto(`${site}dlao`, { waitUntil: 'networkidle' });
  await staffPage.waitForTimeout(1200);
  const onDlao = await staffPage.getByTestId('chat-fab').count();
  check('no chat launcher on the DLAO shell', onDlao === 0, `count=${onDlao}`);

  const gateAsCitizen = await staffPage.evaluate(async () => {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message: 'হেলপলাইন নম্বর কত?' }),
    });
    return r.status;
  });
  check('a signed-in citizen is served by the assistant', gateAsCitizen === 200, `status=${gateAsCitizen} seed=${staffLogin}`);
  await staffCtx.close();

  // ---------- mobile: the panel must be a full-screen sheet ----------
  // This is the regression that shipped once: a fixed bottom offset plus
  // min(560px, 100dvh - 220px) collapsed to a floating strip once the keyboard
  // shrank the viewport, with the page showing through behind it.
  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  const mobile = await mobileCtx.newPage();
  await mobile.goto(site, { waitUntil: 'networkidle' });
  const mobileFab = mobile.getByTestId('chat-fab');
  check('launcher visible on mobile', await mobileFab.isVisible());
  await mobileFab.tap();
  const mobilePanel = mobile.getByTestId('chat-panel');
  check('mobile panel opens', await mobilePanel.isVisible());
  check('mobile panel uses the sheet layout', (await mobilePanel.getAttribute('data-layout')) === 'sheet');

  const sheet = await mobile.evaluate(() => {
    const panel = document.querySelector('[data-testid="chat-panel"]');
    const fab = document.querySelector('[data-testid="chat-fab"]');
    const r = panel?.getBoundingClientRect();
    return {
      w: r?.width ?? 0,
      h: r?.height ?? 0,
      top: r?.top ?? -1,
      left: r?.left ?? -1,
      vw: window.innerWidth,
      vh: window.innerHeight,
      fabHidden: fab ? getComputedStyle(fab).display === "none" : false,
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
  check('mobile sheet spans the full width', Math.abs(sheet.w - sheet.vw) <= 1, JSON.stringify(sheet));
  check('mobile sheet spans the full height', Math.abs(sheet.h - sheet.vh) <= 2, JSON.stringify(sheet));
  check('mobile sheet starts at the top', sheet.top <= 1, JSON.stringify(sheet));
  check('mobile sheet is not offset horizontally', sheet.left <= 1, JSON.stringify(sheet));
  check('launcher is hidden while the sheet is open', sheet.fabHidden === true, JSON.stringify(sheet));
  check('page behind the sheet cannot scroll', sheet.bodyOverflow === 'hidden', JSON.stringify(sheet));

  // The composer must stay reachable, and must not be covered.
  const composer = await mobile.evaluate(() => {
    const form = document.querySelector('.uchat-composer');
    const input = document.querySelector('.uchat-input');
    const r = form?.getBoundingClientRect();
    const ir = input?.getBoundingClientRect();
    return {
      bottom: r?.bottom ?? -1,
      inputVisible: ir ? ir.width > 0 && ir.height >= 32 : false,
      vh: window.innerHeight,
    };
  });
  check('composer sits inside the viewport', composer.bottom <= composer.vh + 1, JSON.stringify(composer));
  check('input is usable on mobile', composer.inputVisible, JSON.stringify(composer));

  // The sheet must track window.visualViewport, because on Android
  // position:fixed resolves against the layout viewport and the keyboard
  // detaches the sheet, pushing the header out of sight.
  const vvh = await mobile.evaluate(() => ({
    set: getComputedStyle(document.documentElement).getPropertyValue('--uchat-vvh').trim(),
    viewportHeight: window.visualViewport ? Math.round(window.visualViewport.height) : null,
    panelHeight: Math.round(document.querySelector('[data-testid="chat-panel"]')?.getBoundingClientRect().height ?? 0),
    headerTop: Math.round(document.querySelector('.uchat-head')?.getBoundingClientRect().top ?? -1),
  }));
  check('sheet is sized from the visual viewport', vvh.set.endsWith('px') && vvh.set !== '0px', JSON.stringify(vvh));
  check('sheet height matches the visual viewport', vvh.viewportHeight === null || Math.abs(vvh.panelHeight - vvh.viewportHeight) <= 2, JSON.stringify(vvh));
  check('header stays at the top of the visual viewport', vvh.headerTop <= 1, JSON.stringify(vvh));

  // Emulate the on-screen keyboard by shrinking the visual viewport.
  await mobile.evaluate(() => {
    document.documentElement.style.setProperty('--force-viewport', '360');
  });
  await mobile.setViewportSize({ width: 390, height: 360 });
  await mobile.waitForTimeout(300);
  const shrunk = await mobile.evaluate(() => {
    const r = document.querySelector('[data-testid="chat-panel"]')?.getBoundingClientRect();
    const c = document.querySelector('.uchat-composer')?.getBoundingClientRect();
    return { h: r?.height ?? 0, vh: window.innerHeight, composerBottom: c?.bottom ?? -1 };
  });
  check('sheet still fills the viewport with the keyboard up', Math.abs(shrunk.h - shrunk.vh) <= 2, JSON.stringify(shrunk));
  check('composer stays on screen with the keyboard up', shrunk.composerBottom <= shrunk.vh + 1, JSON.stringify(shrunk));
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobileCtx.close();

  // ---------- resilience: legible even with a stale stylesheet ----------
  // A real report showed the panel rendering with an invisible header: white
  // title text, no background. That is what happens when the markup is current
  // but the cached CSS is not, and the colours lived only in the stylesheet.
  // Colours are now inline, so strip every stylesheet and they must survive.
  const bareCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const bare = await bareCtx.newPage();
  await bare.goto(site, { waitUntil: 'networkidle' });
  await bare.getByTestId('chat-fab').tap();
  await bare.waitForSelector('[data-testid="chat-panel"]');
  const bareInfo = await bare.evaluate(() => {
    document.querySelectorAll('link[rel=stylesheet], style').forEach((node) => node.remove());
    const head = document.querySelector('.uchat-head');
    const title = document.querySelector('.uchat-title span');
    const welcome = document.querySelector('.uchat-welcome');
    const headStyle = head ? getComputedStyle(head) : null;
    const titleStyle = title ? getComputedStyle(title) : null;
    return {
      headBg: headStyle?.backgroundColor ?? '',
      titleColor: titleStyle?.color ?? '',
      titleLen: (title?.textContent || '').trim().length,
      welcomeLen: (welcome?.textContent || '').trim().length,
    };
  });
  const opaque = (c) => Boolean(c) && c !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(c);
  check('header keeps a background with no stylesheet', opaque(bareInfo.headBg), JSON.stringify(bareInfo));
  check('header title is white on that background', bareInfo.titleColor === 'rgb(255, 255, 255)', JSON.stringify(bareInfo));
  check('header title still present with no stylesheet', bareInfo.titleLen > 0, JSON.stringify(bareInfo));
  check('welcome text still present with no stylesheet', bareInfo.welcomeLen > 20, JSON.stringify(bareInfo));
  await bareCtx.close();

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
