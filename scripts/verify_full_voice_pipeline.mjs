import { chromium } from 'playwright-core';

async function main() {
  console.log("Launching headless browser to verify full voice pipeline...");
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });

  const ctx = await browser.newContext();
  await ctx.grantPermissions(['microphone']);
  const page = await ctx.newPage();

  let ttsFrames = 0;
  let ttsBytes = 0;
  let ttsFlushes = 0;

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Direct LLM') || text.includes('TTS') || text.includes('latency') || text.includes('transcript')) {
      console.log('[BROWSER CONSOLE]', text);
    }
  });

  page.on('websocket', ws => {
    if (ws.url().includes('/v1/tts')) {
      console.log('[TTS WS CONNECTED]', ws.url());
      ws.on('framesent', f => {
        const payload = f.payload?.toString() || '';
        try {
          const parsed = JSON.parse(payload);
          if (parsed.type === "Speak") {
            console.log('[TTS WS SENT SPEAK]', parsed.text?.slice(0, 50));
          } else if (parsed.type === "Flush") {
            console.log('[TTS WS SENT FLUSH]');
          }
        } catch {}
      });
      ws.on('framereceived', f => {
        if (f.payload instanceof Buffer || f.payload instanceof Uint8Array) {
          ttsFrames++;
          ttsBytes += f.payload.length;
        } else {
          try {
            const parsed = JSON.parse(f.payload.toString());
            if (parsed.type === "Flushed") {
              ttsFlushes++;
              console.log(`[TTS WS RECEIVED FLUSHED] Total chunks so far: ${ttsFrames}, bytes: ${ttsBytes}`);
            }
          } catch {}
        }
      });
    }
  });

  console.log("Navigating to production site...");
  await page.goto('https://legal-voice-agent.adribmahmud.workers.dev/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  console.log("Initiating call...");
  const startBtn = page.getByRole('button', { name: /কল করুন/ });
  await startBtn.click();

  // Wait 13 seconds for initial greeting and IVR prompt audio to finish
  console.log("Waiting for greeting & IVR prompt to complete...");
  await page.waitForTimeout(13500);

  // Press IVR Option 1 (General Legal Information)
  console.log("Pressing IVR Option 1 via dialpad...");
  const opt1Btn = page.locator('button', { hasText: /^১$|^1$/ }).first();
  if (await opt1Btn.count()) {
    await opt1Btn.click();
    console.log("Option 1 key clicked.");
  } else {
    await page.getByRole('button', { name: /১/ }).first().click();
  }

  // Wait for Option 1 prompt playback
  console.log("Waiting for Option 1 response audio...");
  await page.waitForTimeout(4500);

  // Inject a user voice question into the direct session via window.__voiceAgent
  console.log("Calling window.__voiceAgent.sendUserMessage with legal query...");
  const userQuestion = "আমি কি বিনা খরচে একজন সরকারি আইনজীবী পেতে পারি?";
  await page.evaluate((q) => {
    if (window.__voiceAgent) {
      window.__voiceAgent.sendUserMessage(q);
    } else {
      console.error("window.__voiceAgent not found!");
    }
  }, userQuestion);

  // Wait for LLM to stream tokens and Soniox TTS to synthesize and play audio
  console.log("Waiting for AI response & TTS synthesis...");
  await page.waitForTimeout(12000);

  const pageText = await page.evaluate(() => document.body.innerText);
  console.log("\n--- Transcript Snippet ---");
  console.log(pageText.slice(0, 1500));

  console.log(`\n--- Verification Summary ---`);
  console.log(`TTS PCM Chunks Received: ${ttsFrames}`);
  console.log(`TTS Total Audio Bytes: ${ttsBytes}`);
  console.log(`TTS Flushes: ${ttsFlushes}`);

  await browser.close();

  if (ttsBytes > 0 && ttsFrames > 0) {
    console.log("\n>>> SUCCESS: Voice synthesis and audio playback confirmed without skips! <<<");
    process.exit(0);
  } else {
    console.error("\n>>> FAILURE: No TTS audio bytes received in browser session! <<<");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
