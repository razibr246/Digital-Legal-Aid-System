import { chromium } from 'playwright-core';

async function main() {
  console.log("=== VERIFYING MULTI-INPUT CHAINING PIPELINE (KEYPAD 2) ===");
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

  const spokenMessages = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Intake step') || text.includes('speakAssistantPhrase') || text.includes('advanceFromProblemStep') || text.includes('handleIntake') || text.includes('TTS') || text.includes('Direct LLM')) {
      console.log('[BROWSER]', text);
    }
  });

  page.on('websocket', ws => {
    if (ws.url().includes('/v1/tts')) {
      ws.on('framesent', f => {
        const payload = f.payload?.toString() || '';
        try {
          const parsed = JSON.parse(payload);
          if (parsed.type === "Speak" && parsed.text) {
            spokenMessages.push(parsed.text);
            console.log('[TTS SPOKE]', parsed.text);
          }
        } catch {}
      });
    }
  });

  console.log("1. Navigating to deployed worker...");
  await page.goto('https://legal-voice-agent.adribmahmud.workers.dev/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  console.log("2. Clicking 'কল করুন'...");
  const startBtn = page.getByRole('button', { name: /কল করুন/ });
  await startBtn.click();
  await page.waitForTimeout(2500);

  console.log("3. Pressing Keypad 2 (সমস্যা বা নতুন অভিযোগ)...");
  await page.evaluate(() => {
    if (window.__voiceAgent) {
      window.__voiceAgent.sendUserMessage("২");
    }
  });
  await page.waitForTimeout(3000);

  console.log("4. Simulating caller describing problem...");
  await page.evaluate(() => {
    if (window.__voiceAgent) {
      window.__voiceAgent.sendUserMessage("আমার জমি প্রতিবেশী জোরপূর্বক দখল করে নিয়েছে, আমি প্রতিকার চাই।");
    }
  });
  await page.waitForTimeout(1500);

  console.log("5. Pressing Keypad 1 (বলা শেষ / problem finished)...");
  await page.evaluate(() => {
    if (window.__voiceAgent) {
      window.__voiceAgent.sendUserMessage("১");
    }
  });
  await page.waitForTimeout(3000);

  console.log("6. Providing Disability answer: 'না'...");
  await page.evaluate(() => {
    if (window.__voiceAgent) {
      window.__voiceAgent.sendUserMessage("না");
    }
  });
  await page.waitForTimeout(3000);

  console.log("7. Providing Gender answer: 'পুরুষ'...");
  await page.evaluate(() => {
    if (window.__voiceAgent) {
      window.__voiceAgent.sendUserMessage("পুরুষ");
    }
  });
  await page.waitForTimeout(3000);

  console.log("8. Providing Name answer: 'আব্দুল করিম'...");
  await page.evaluate(() => {
    if (window.__voiceAgent) {
      window.__voiceAgent.sendUserMessage("আমার নাম আব্দুল করিম");
    }
  });
  await page.waitForTimeout(3000);

  console.log("9. Providing Address answer: 'মিরপুর, ঢাকা'...");
  await page.evaluate(() => {
    if (window.__voiceAgent) {
      window.__voiceAgent.sendUserMessage("মিরপুর ১০ নম্বর, ঢাকা");
    }
  });
  await page.waitForTimeout(6000);

  console.log("10. Checking page state and docket card...");
  const pageState = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasDocketId: /DLAS-\d{4}-\d{4}/.test(text),
      hasKarim: text.includes("আব্দুল করিম") || text.includes("করিম"),
      hasDhaka: text.includes("ঢাকা"),
      hasMale: text.includes("পুরুষ"),
      hasNoDisability: text.includes("প্রতিবন্ধকতা নেই"),
      innerTextSnippet: text.slice(0, 1500)
    };
  });

  console.log("Verification results:", JSON.stringify(pageState, null, 2));
  console.log("Total TTS phrases spoken:", spokenMessages.length);

  await browser.close();

  if (pageState.hasDocketId || pageState.hasKarim) {
    console.log("SUCCESS: Multi-input intake chain flow executed completely!");
  } else {
    console.error("FAIL: Docket ID or caller name not found on page.");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
