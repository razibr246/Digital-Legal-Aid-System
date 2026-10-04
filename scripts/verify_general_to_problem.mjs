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

  const spoken = [];
  let complete = null;
  page.on('websocket', (ws) => {
    if (ws.url().includes('/v1/tts')) {
      ws.on('framesent', (f) => {
        try {
          const p = JSON.parse(f.payload.toString());
          if (p.type === 'Speak' && p.text) spoken.push(p.text);
        } catch {}
      });
    }
  });
  page.on('response', async (r) => {
    if (r.url().includes('/api/roles/complete')) {
      try {
        complete = { status: r.status(), body: await r.json() };
      } catch {}
    }
  });

  const step = () =>
    page.evaluate(() => {
      const s = window.__voiceAgent?.session;
      return { step: s?.intakeStep, offer: !!s?.severityConfirmation, lang: s?.indigenousLanguage };
    });

  // Highlighted (green) keys currently rendered in the dialpad
  const greenKeys = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .filter((b) => b.className.includes('bg-emerald-600'))
        .map((b) => b.textContent?.trim().split('\n')[0])
        .filter(Boolean),
    );

  const send = async (label, msg, wait = 3500) => {
    spoken.length = 0;
    console.log(`\n>>> ${label}: ${JSON.stringify(msg)}`);
    await page.evaluate((m) => window.__voiceAgent?.sendUserMessage(m), msg);
    await page.waitForTimeout(wait);
    const st = await step();
    const keys = await greenKeys();
    console.log('    state    :', JSON.stringify(st));
    console.log('    green keys:', keys.length ? keys.join(' | ') : '(none)');
    spoken.forEach((t) => console.log('    [TTS]', t));
    return st;
  };

  await page.goto(site, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /কল করুন/ }).first().click();
  await page.waitForTimeout(4000);
  console.log('=== LANGUAGE STEP ===');
  console.log('    state    :', JSON.stringify(await step()));
  console.log('    green keys:', (await greenKeys()).join(' | '));

  await send('select Bangla (keypad)', '১');
  await send('root menu: general info', '১ (সাধারণ তথ্য ও নিয়মাবলী)');
  const offered = await send('describe problem (LLM should offer)', 'আমার স্বামী আমাকে মারধর করেন', 5000);
  const yesByKeypad = await send('keypad 1 = হ্যাঁ', '১', 4500);
  const ack = await send('problem done (keypad 1)', '১', 4500);

  await send('disability = না', 'না', 3500);
  await send('gender = নারী', 'নারী', 3000);
  await send('name', 'সেলিনা আক্তার', 3000);
  await send('primary = হ্যাঁ', 'হ্যাঁ', 3000);
  await send('address', 'রাজশাহী সদর', 7000);

  console.log('\n=== RESULTS ===');
  const results = {
    'offer armed after problem description': offered.offer === true,
    'offer step exposed to UI': offered.step === 'application_confirm',
    'keypad 1 answered the offer': yesByKeypad.step === 'problem',
    'problem-phase acknowledgement spoken': ack.step === 'disability',
    'application persisted': complete?.status === 200,
  };
  for (const [k, v] of Object.entries(results)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`);
  if (complete?.body) console.log('   applicationId:', complete.body.applicationId, '| user:', complete.body.user?.displayName);
  const pass = Object.values(results).every(Boolean);
  console.log(pass ? '\nVERIFICATION PASSED' : '\nVERIFICATION FAILED');
  await browser.close();
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
