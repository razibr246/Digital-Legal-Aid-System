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
  let completePayload = null;
  let completeStatus = null;

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

  page.on('response', async (res) => {
    if (res.url().includes('/api/roles/complete')) {
      completeStatus = res.status();
      try {
        completePayload = await res.json();
      } catch {}
    }
  });

  const send = async (msg, wait = 2600) => {
    await page.evaluate((m) => window.__voiceAgent?.sendUserMessage(m), msg);
    await page.waitForTimeout(wait);
  };

  await page.goto(site, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /কল করুন/ }).first().click();
  await page.waitForTimeout(3000);

  await send('১'); // language: Bangla
  await send('২ (সমস্যা বা নতুন অভিযোগ)');
  await send('স্বামী আমাকে মারধর করে বাড়ি থেকে বের করে দিয়েছে।', 3500);
  await send('১', 4000); // problem done -> acknowledgement + next step
  const ackIndex = spoken.findIndex((t) => t.includes('আপনার সমস্যাটি নথিভুক্ত করা হয়েছে'));
  await send('না'); // no disability
  await send('নারী');
  await send('রুমানা বেগম');
  await send('হ্যাঁ'); // primary number
  await send('চট্টগ্রাম সদর', 7000); // address -> finalize

  // Auto-login state after intake
  const session = await page.evaluate(async () => {
    const r = await fetch('/api/auth/session', { credentials: 'include' });
    return { status: r.status, body: await r.text() };
  });

  const uiText = await page.evaluate(() => document.body.innerText);

  console.log('\n=== INTAKE RESULTS ===');
  console.log('1. problem-phase acknowledgement :', ackIndex >= 0 ? 'PASS' : 'FAIL');
  console.log('2. /api/roles/complete status     :', completeStatus, completeStatus === 200 ? 'PASS' : 'FAIL');
  console.log('   applicationId                  :', completePayload?.applicationId || '(none)');
  console.log('   user                           :', completePayload?.user?.displayName, '/', completePayload?.user?.role);
  console.log('3. auto-login (/api/auth/session) :', session.status, session.status === 200 ? 'PASS' : 'FAIL');
  console.log('   session body                   :', session.body.slice(0, 160));
  console.log('4. UI shows logged-in name       :', uiText.includes('রুমানা বেগম') ? 'PASS' : 'not shown on landing');

  const docketId = completePayload?.docketId;
  const applicationId = completePayload?.applicationId;
  console.log('\nDOCKET=' + docketId + ' APPLICATION=' + applicationId);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
