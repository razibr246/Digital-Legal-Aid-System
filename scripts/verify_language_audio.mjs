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

  const ttsSpoken = [];
  const audioFetched = [];

  page.on('websocket', (ws) => {
    if (ws.url().includes('/v1/tts')) {
      ws.on('framesent', (f) => {
        try {
          const p = JSON.parse(f.payload.toString());
          if (p.type === 'Speak' && p.text) ttsSpoken.push(p.text);
        } catch {}
      });
    }
  });
  page.on('response', (res) => {
    const u = new URL(res.url());
    if (u.pathname.startsWith('/audio/') && res.status() === 200) {
      audioFetched.push(u.pathname);
    }
  });

  const send = async (msg, wait = 3000) => {
    await page.evaluate((m) => window.__voiceAgent?.sendUserMessage(m), msg);
    await page.waitForTimeout(wait);
  };

  await page.goto(site, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /কল করুন/ }).first().click();
  await page.waitForTimeout(5000);

  const afterGreeting = { audio: [...audioFetched], tts: [...ttsSpoken] };
  console.log('\n=== AFTER GREETING (language selection pending) ===');
  console.log('pre-recorded fetched:', afterGreeting.audio);
  console.log('TTS synthesized    :', afterGreeting.tts.length === 0 ? '(none)' : afterGreeting.tts);

  const selectViaTts = afterGreeting.tts.length > 0;

  // Marma = 2
  await send('২', 4000);
  const afterMarma = [...audioFetched];
  const afterMarmaTts = [...ttsSpoken];
  // audioFetched is cumulative, so compare the delta: selecting a language must
  // fetch nothing but the menu, and synthesize nothing.
  const newAudioAfterSelection = afterMarma.slice(afterGreeting.audio.length);
  console.log('\n=== AFTER SELECTING MARMA (2) ===');
  console.log('pre-recorded fetched:', afterMarma);
  console.log('newly fetched      :', newAudioAfterSelection.length === 0 ? '(none)' : newAudioAfterSelection);
  console.log('TTS synthesized    :', afterMarmaTts.length === 0 ? '(none)' : afterMarmaTts);

  const results = {
    // The opening is ONE clip: welcome + recording notice + language question.
    merged_opening_prerecorded: afterGreeting.audio.includes('/audio/greeting_language.wav'),
    opening_notTTS: !selectViaTts,
    // The old two-clip opening must be gone: no separate greeting, no separate
    // language clip, and critically no menu in the same breath.
    no_separate_greeting: !afterGreeting.audio.includes('/audio/greeting.wav'),
    no_separate_language_clip: !afterGreeting.audio.includes('/audio/language_select.wav'),
    menu_not_merged_into_greeting: !afterGreeting.audio.includes('/audio/ivr_menu.wav'),
    // The menu is announced exactly once, on its own clip, after the language.
    menu_announcedOnce_afterSelection:
      newAudioAfterSelection.length === 1 && newAudioAfterSelection[0] === '/audio/ivr_menu.wav',
    menu_notTTS: afterMarmaTts.length === 0,
  };

  console.log('\n=== RESULTS ===');
  for (const [k, v] of Object.entries(results)) console.log(`${k}: ${v ? 'PASS' : 'FAIL'}`);
  const pass = Object.values(results).every(Boolean);
  console.log(pass ? 'VERIFICATION PASSED' : 'VERIFICATION FAILED');
  await browser.close();
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
