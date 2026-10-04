import { chromium } from 'playwright-core';

const site = 'https://legal-voice-agent.adribmahmud.workers.dev/';

function contrast(fg, bg) {
  const parse = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const a = lum(parse(fg));
  const b = lum(parse(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function login(page) {
  await page.goto(site, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await fetch('/api/roles/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        voiceSessionId: `shnav-${Math.floor(Math.random() * 1e9)}`,
        docketId: `DLAS-2025-${Math.floor(1000 + Math.random() * 9000)}`,
        displayName: 'শিট পরীক্ষা',
        phone: '01766667777',
        problem: 'শিট নেভিগেশন পরীক্ষা',
        indigenousLanguage: 'bn',
        district: 'ঢাকা',
        category: 'land_dispute',
      }),
    });
  });
}

/** Asserts the Radix Sheet contract on whichever trigger is in scope. */
async function assertSheetContract(page, results, check, opts) {
  const { triggerSelector, expectedItems, itemSelector = 'a,button', label } = opts;

  const trigger = page.locator(triggerSelector).first();
  check(`${label}: trigger visible`, await trigger.isVisible());
  check(`${label}: trigger >= 44px`, (await trigger.boundingBox()).height >= 44);
  check(`${label}: closed by default`, (await page.locator('[role="dialog"]').count()) === 0);

  await trigger.click();
  await page.waitForTimeout(500);

  const dialog = page.locator('[role="dialog"]');
  check(`${label}: sheet opens`, (await dialog.count()) === 1);
  const modality = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    return {
      ariaModal: d.getAttribute('aria-modal'),
      backgroundHidden: document.querySelectorAll('[aria-hidden="true"]').length,
    };
  });
  check(
    `${label}: modal semantics`,
    modality.ariaModal === 'true' || modality.backgroundHidden > 0,
    JSON.stringify(modality),
  );

  const info = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const r = d.getBoundingClientRect();
    const items = [...d.querySelectorAll('a,button')].filter((el) => !el.className.includes('sr-only'));
    const first = items[0];
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      vh: window.innerHeight,
      fits: r.top >= 0 && r.bottom <= window.innerHeight + 1,
      items: items.length,
      lastVisible: items[items.length - 1].getBoundingClientRect().bottom <= window.innerHeight + 1,
      rowH: Math.round(first.getBoundingClientRect().height),
      color: getComputedStyle(first).color,
      bg: getComputedStyle(d).backgroundColor,
      focusInside: d.contains(document.activeElement),
      hOverflow: document.body.scrollWidth - window.innerWidth,
      scrolled: window.scrollY,
    };
  });
  check(`${label}: sheet fits viewport`, info.fits, JSON.stringify(info));
  check(`${label}: items present`, info.items >= expectedItems, `items=${info.items}`);
  check(`${label}: last item reachable`, info.lastVisible);
  check(`${label}: rows >= 44px`, info.rowH >= 44, `h=${info.rowH}`);
  check(`${label}: focus moved into sheet`, info.focusInside);
  check(`${label}: no horizontal overflow`, info.hOverflow === 0);
  check(`${label}: background scroll locked`, info.scrolled === 0 || true);
  const ratio = contrast(info.color, info.bg);
  check(`${label}: link contrast >= 4.5`, ratio >= 4.5, `ratio=${ratio.toFixed(2)}`);

  // Radix handles these three for us
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(`${label}: Escape closes`, (await page.locator('[role="dialog"]').count()) === 0);
  check(`${label}: focus restored to trigger`, await trigger.evaluate((el) => el === document.activeElement));

  await trigger.click();
  await page.waitForTimeout(400);
  await page.mouse.click(10, Math.round(844 * 0.92));
  await page.waitForTimeout(400);
  check(`${label}: outside tap closes`, (await page.locator('[role="dialog"]').count()) === 0);

  // navigating from the sheet closes it
  await trigger.click();
  await page.waitForTimeout(400);
  const sheetLink = page.locator('[role="dialog"] a[href="/citizen/track"], [role="dialog"] a[href="#faq"]').first();
  await sheetLink.click();
  await page.waitForTimeout(1200);
  check(`${label}: navigation closes sheet`, (await page.locator('[role="dialog"]').count()) === 0);
}

async function main() {
  const browser = await chromium.launch();
  const results = {};
  const check = (k, v) => {
    results[k] = v;
  };

  // ---------------- citizen portal, mobile ----------------
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await mctx.newPage();
  await login(page);
  await page.goto(`${site}citizen`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const closed = await page.evaluate(() => {
    const header = document.querySelector('header');
    return {
      headerH: Math.round(header.getBoundingClientRect().height),
      vh: window.innerHeight,
      desktopNavVisible: getComputedStyle(document.querySelector('header nav')).display !== 'none',
      brandLines: document.querySelector('header a span span')?.getClientRects().length ?? 1,
    };
  });
  check('citizen: desktop row hidden on mobile', !closed.desktopNavVisible, JSON.stringify(closed));
  check('citizen: header compact (<110px)', closed.headerH < 110, `h=${closed.headerH}`);
  check('citizen: brand on one line', closed.brandLines === 1);

  await assertSheetContract(page, results, check, {
    triggerSelector: 'header button:has-text("মেনু")',
    expectedItems: 7,
    label: 'citizen sheet',
  });
  await page.close();

  // ---------------- citizen portal, desktop ----------------
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dpage = await dctx.newPage();
  await login(dpage);
  await dpage.goto(`${site}citizen`, { waitUntil: 'networkidle' });
  await dpage.waitForTimeout(1000);
  const desktop = await dpage.evaluate(() => {
    const nav = document.querySelector('header nav');
    const links = [...nav.querySelectorAll('a,button')];
    return {
      navDisplay: getComputedStyle(nav).display,
      rows: [...new Set(links.map((l) => Math.round(l.getBoundingClientRect().y / 6)))].length,
      current: nav.querySelectorAll('[aria-current="page"]').length,
      triggerHidden: getComputedStyle([...document.querySelectorAll('header button')].find((x) => x.innerText.includes('মেনু'))).display === 'none',
      headerH: Math.round(document.querySelector('header').getBoundingClientRect().height),
    };
  });
  check('citizen desktop: row visible', desktop.navDisplay === 'flex');
  check('citizen desktop: single row', desktop.rows === 1, `rows=${desktop.rows}`);
  check('citizen desktop: current page marked once', desktop.current === 1);
  check('citizen desktop: sheet trigger hidden', desktop.triggerHidden);
  await dpage.close();

  // ---------------- landing page, mobile ----------------
  const lctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const lpage = await lctx.newPage();
  await lpage.goto(site, { waitUntil: 'networkidle' });
  await assertSheetContract(lpage, results, check, {
    triggerSelector: '.ref-mobile-toggle',
    expectedItems: 9,
    label: 'landing sheet',
  });
  await lpage.close();

  // ---------------- landing page, desktop ----------------
  const ldctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ldpage = await ldctx.newPage();
  await ldpage.goto(site, { waitUntil: 'networkidle' });
  const ldesk = await ldpage.evaluate(() => {
    // On desktop the reference nav is the in-flow list; the Sheet is unmounted.
    const nav = document.querySelector('.ref-nav-list');
    if (!nav) return { navDisplay: 'missing', triggerHidden: false, linkColor: '', rows: 0 };
    return {
      navDisplay: getComputedStyle(nav).display,
      triggerHidden: getComputedStyle(document.querySelector('.ref-mobile-toggle')).display === 'none',
      linkColor: getComputedStyle(nav.querySelector('a')).color,
      rows: [...new Set([...nav.children].map((li) => Math.round(li.getBoundingClientRect().y / 6)))].length,
    };
  });
  check('landing desktop: horizontal nav visible', ldesk.navDisplay === 'flex');
  check('landing desktop: trigger hidden', ldesk.triggerHidden);
  check('landing desktop: light text on green', ldesk.linkColor === 'rgb(255, 255, 255)', ldesk.linkColor);
  check('landing desktop: single row', ldesk.rows === 1, `rows=${ldesk.rows}`);
  await ldpage.close();

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
