/**
 * The root-menu keypad is a SIMULATION, not telephony: the on-screen buttons call
 * playDtmfTone() and sendMessage(), and nothing anywhere decodes a real DTMF tone
 * out of the mic. It is the only way to reach option 1/2/3 deterministically, so it
 * must keep working alongside the voice-first path.
 *
 * This asserts each route actually PLAYS its prompt. The transcript panel is not a
 * valid signal: speakAssistantPhrase does not emit transcript entries, so a prompt
 * that plays correctly can look absent.
 *
 * Waits are deliberately longer than the longest clip (ivr_menu is ~13s); pressing a
 * key while the menu is still speaking produces a false failure.
 */
import { chromium } from 'playwright-core';

const site = process.env.SITE_URL || 'https://legal-voice-agent.adribmahmud.workers.dev/';
const AFTER_OPENING_MS = 16000;

const results = {};
const check = (k, v, extra = '') => {
  results[k] = v;
  console.log(`${v ? 'PASS' : 'FAIL'} ${k}${extra ? ' :: ' + extra : ''}`);
};

async function route(label, keys, expectClip) {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ permissions: ['microphone'] });
  const page = await ctx.newPage();
  const audio = [];
  const errs = [];
  page.on('response', (r) => {
    const p = new URL(r.url()).pathname;
    if (p.startsWith('/audio/')) audio.push(p);
  });
  page.on('pageerror', (e) => errs.push(String(e)));

  await page.goto(site, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /কল করুন/ }).first().click();
  await page.waitForTimeout(14000);
  const before = audio.length;

  for (const k of keys) {
    await page.locator(`button:has(> span:text-is("${k}"))`).first().click();
    await page.waitForTimeout(AFTER_OPENING_MS);
  }
  await page.waitForTimeout(1500);
  await browser.close();

  const after = audio.slice(before);
  check(`${label} plays ${expectClip}`, after.some((u) => u.includes(expectClip)), after.join(', ') || '(nothing)');
  check(`${label} no page errors`, errs.length === 0, errs.join(' | '));
}

await route('keypad 1 -> general info', ['1', '1'], 'option1_prompt.wav');
await route('keypad 2 -> problem intake', ['1', '2'], 'problem_start');
await route('keypad 3 -> case tracking', ['1', '3'], 'option3_tracking.wav');

const failed = Object.entries(results).filter(([, v]) => !v);
console.log(failed.length ? `\n${failed.length} FAILED` : '\nKEYPAD SIMULATION INTACT ON ALL 3 ROUTES');
process.exit(failed.length ? 1 : 0);
