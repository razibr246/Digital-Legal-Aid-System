import { chromium } from 'playwright-core';

// ============================================================================
//  COSTS PAID CREDITS — drives the real voice pipeline (Soniox STT/TTS + Groq LLM).
//  Do not run as part of a routine regression sweep. See AGENTS.md.
// ============================================================================
const site = 'https://legal-voice-agent.adribmahmud.workers.dev/';

async function main() {
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const ctx = await browser.newContext();
  await ctx.grantPermissions(['microphone']);
  const page = await ctx.newPage();

  let spoken = [];
  page.on('websocket', (ws) => {
    if (ws.url().includes('/v1/tts')) {
      ws.on('framesent', (f) => {
        try {
          const parsed = JSON.parse(f.payload.toString());
          if (parsed.type === 'Speak' && parsed.text) {
            spoken.push(parsed.text);
            console.log('  [TTS]', parsed.text);
          }
        } catch {}
      });
    }
  });

  const send = async (label, msg, wait = 2500) => {
    spoken = [];
    console.log(`\n>>> ${label}: sendUserMessage(${JSON.stringify(msg)})`);
    await page.evaluate((m) => window.__voiceAgent?.sendUserMessage(m), msg);
    await page.waitForTimeout(wait);
    return spoken.slice();
  };

  const forceSemanticConfirm = () =>
    page.evaluate(() => {
      const s = window.__voiceAgent?.session;
      if (!s) return 'no session';
      s.indigenousLanguage = 'marma';
      s.intakeStep = 'semantic_confirmation';
      s.intakeData.problem = 'স্বামী আমাকে মারধর করেছেন';
      s.pendingSemanticResult = {
        matched: true,
        confidence: 0.92,
        legalIntent: 'domestic_violence',
        normalizedBangla: 'স্বামী যৌতুকের জন্য মারধর করেছেন',
        matches: [{ matchedText: 'test' }],
        clarificationQuestionBn: 'আপনি কি আমার বুঝানো বাংলা অর্থটি ঠিক বলেছেন? হ্যাঁ অথবা না বলুন।',
      };
      return 'forced';
    });

  await page.goto(site, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /কল করুন/ }).first().click();
  await page.waitForTimeout(3000);

  console.log('\n=== CASE 1: Bangla problem phase, keypad 1 ===');
  await send('language = Bangla', '১');
  await send('menu = complaint', '২ (সমস্যা বা নতুন অভিযোগ)');
  await send('describe problem', 'স্বামী আমাকে মারধর করে বাড়ি থেকে বের করে দিয়েছে।', 3500);
  const c1 = await send('problem done (1)', '১', 4000);
  const case1 = c1.some((t) => t.includes('আপনার সমস্যাটি নথিভুক্ত করা হয়েছে'));

  console.log('\n=== CASE 2: Marma semantic confirmation, keypad 1 (confirm) ===');
  console.log('  setup:', await forceSemanticConfirm());
  const c2 = await send('keypad 1 = হ্যাঁ', '১', 4000);
  const case2 = c2.some((t) => t.includes('আপনার সমস্যাটি নথিভুক্ত করা হয়েছে'));

  console.log('\n=== CASE 3: Marma semantic confirmation, keypad 2 (reject) ===');
  console.log('  setup:', await forceSemanticConfirm());
  const c3 = await send('keypad 2 = না', '২', 4000);
  const case3 = c3.some((t) => t.includes('আরেকবার সংক্ষেপে বলুন'));

  console.log('\n=== RESULTS ===');
  console.log('case1 bangla ack      :', case1 ? 'PASS' : 'FAIL');
  console.log('case2 marma ack       :', case2 ? 'PASS' : 'FAIL');
  console.log('case3 marma re-ask    :', case3 ? 'PASS' : 'FAIL');
  const pass = case1 && case2 && case3;
  console.log(pass ? 'VERIFICATION PASSED' : 'VERIFICATION FAILED');
  await browser.close();
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
