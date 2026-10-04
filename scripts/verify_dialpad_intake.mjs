import { chromium } from 'playwright-core';

// ============================================================================
//  COSTS PAID CREDITS — drives the real voice pipeline (Soniox STT/TTS + Groq LLM).
//  Do not run as part of a routine regression sweep. See AGENTS.md.
// ============================================================================
async function main() {
  console.log("=== VERIFYING DUAL-MODAL DIALPAD INPUT (1 for হ্যাঁ, 2 for নারী, etc.) ===");
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
  page.on('websocket', ws => {
    if (ws.url().includes('/v1/tts')) {
      ws.on('framesent', f => {
        try {
          const parsed = JSON.parse(f.payload.toString());
          if (parsed.type === "Speak" && parsed.text) {
            spokenMessages.push(parsed.text);
            console.log('[TTS SPOKE]', parsed.text);
          }
        } catch {}
      });
    }
  });

  await page.goto('https://legal-voice-agent.adribmahmud.workers.dev/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /কল করুন/ }).first().click();
  await page.waitForTimeout(2000);

  // Select language first: 1 = Bangla
  console.log("Selecting language 1 (Bangla)...");
  await page.evaluate(() => window.__voiceAgent?.sendUserMessage("১"));
  await page.waitForTimeout(2500);

  // Press 2 for intake
  console.log("Pressing 2...");
  await page.evaluate(() => window.__voiceAgent?.sendUserMessage("২ (সমস্যা বা নতুন অভিযোগ)"));
  await page.waitForTimeout(2500);

  // Say problem
  console.log("Speaking problem: যৌতুকের জন্য মারধর...");
  await page.evaluate(() => window.__voiceAgent?.sendUserMessage("স্বামী যৌতুকের জন্য মারধর করে বাড়ি থেকে বের করে দিয়েছে।"));
  await page.waitForTimeout(1500);

  // Press 1 to complete problem
  console.log("Pressing 1 to complete problem...");
  await page.evaluate(() => window.__voiceAgent?.sendUserMessage("১"));
  await page.waitForTimeout(2500);

  // Answer disability with "হ্যাঁ" (short word test!) -> routes to disability_type
  console.log("Voice test: Saying short word 'হ্যাঁ'...");
  await page.evaluate(() => window.__voiceAgent?.sendUserMessage("হ্যাঁ"));
  await page.waitForTimeout(2500);

  // Answer disability type
  console.log("Voice test: Saying disability type 'দৃষ্টি'...");
  await page.evaluate(() => window.__voiceAgent?.sendUserMessage("দৃষ্টি"));
  await page.waitForTimeout(2500);

  // Answer gender with "নারী"
  console.log("Voice test: Saying 'নারী'...");
  await page.evaluate(() => window.__voiceAgent?.sendUserMessage("নারী"));
  await page.waitForTimeout(2500);

  // Answer name
  console.log("Voice test: Saying name 'ফাতেমা বেগম'...");
  await page.evaluate(() => window.__voiceAgent?.sendUserMessage("ফাতেমা বেগম"));
  await page.waitForTimeout(2500);

  // Confirm this is the primary number
  console.log("Voice test: Confirming primary number 'হ্যাঁ'...");
  await page.evaluate(() => window.__voiceAgent?.sendUserMessage("হ্যাঁ"));
  await page.waitForTimeout(2500);

  // Provide phone number
  console.log("Voice test: Saying phone '01712345678'...");
  await page.evaluate(() => window.__voiceAgent?.sendUserMessage("01712345678"));
  await page.waitForTimeout(2500);

  // Answer address
  console.log("Voice test: Saying address 'চট্টগ্রাম সদর'...");
  await page.evaluate(() => window.__voiceAgent?.sendUserMessage("চট্টগ্রাম সদর"));
  await page.waitForTimeout(6000);

  // Switch to docket tab to inspect
  await page.getByRole('button', { name: /লাইভ কেস ডকেট/ }).click();
  await page.waitForTimeout(1000);

  const docketCardText = await page.evaluate(() => document.body.innerText);
  const results = {
    hasFatema: docketCardText.includes("ফাতেমা বেগম"),
    hasChittagong: docketCardText.includes("চট্টগ্রাম"),
    hasFemale: docketCardText.includes("নারী"),
    hasDisabilityAid: docketCardText.includes("প্রতিবন্ধী সহায়তা প্রযোজ্য") || docketCardText.includes("প্রতিবন্ধী সুবিধা"),
    hasDocketId: /DLAS-\d{4}-\d{4}/.test(docketCardText)
  };

  console.log("Docket Results:", results);
  console.log("Total TTS Prompts:", spokenMessages.length);
  await browser.close();

  if (results.hasFatema && results.hasDocketId && results.hasFemale && results.hasDisabilityAid) {
    console.log("VERIFICATION SUCCESSFUL: Short words ('হ্যাঁ', 'নারী'), disability priority & docket token generated cleanly!");
  } else {
    console.error("VERIFICATION FAILED", results);
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Run error:", err);
  process.exit(1);
});
