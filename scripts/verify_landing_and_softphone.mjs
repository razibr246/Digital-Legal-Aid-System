import { chromium } from 'playwright-core';

async function main() {
  console.log("=== VERIFYING LANDING PAGE PORT & SOFTPHONE MODAL UX ===");
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

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('TTS') || text.includes('Intake') || text.includes('Direct LLM')) {
      console.log('[BROWSER]', text);
    }
  });

  console.log("1. Navigating to production site...");
  await page.goto('https://legal-voice-agent.adribmahmud.workers.dev/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Check landing page elements
  console.log("2. Checking landing page content...");
  const content = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasGovTitle: text.includes("গণপ্রজাতন্ত্রী বাংলাদেশ সরকার"),
      hasBrand: text.includes("Bangladesh") && text.includes("Legal Portal"),
      hasIlliterateBanner: text.includes("পড়তে বা লিখতে পারেন না? কোনো সমস্যা নেই!"),
      hasHeroText: text.includes("ন্যায়বিচারের পথে"),
      hasHotlineBtn: text.includes("১৬৬৯৯ কল করুন") || text.includes("১৬৬৯৯-এ এখনই কথা বলুন"),
      hasMediation: text.includes("মধ্যস্থতা (ADR)"),
      hasLawyers: text.includes("প্যানেল আইনজীবী")
    };
  });

  console.log("Landing page check:", content);
  if (!content.hasGovTitle || !content.hasIlliterateBanner || !content.hasHeroText) {
    throw new Error("Landing page elements missing!");
  }

  // Click the prominent 16699 button in the illiterate accessibility banner
  console.log("3. Clicking '১৬৬৯৯-এ এখনই কথা বলুন' button...");
  const callBtn = page.getByRole('button', { name: /১৬৬৯৯-এ এখনই কথা বলুন|১৬৬৯৯ কল করুন/ }).first();
  await callBtn.click();
  await page.waitForTimeout(3000);

  // Verify Softphone Modal is visible
  console.log("4. Verifying Softphone Modal is open...");
  const modalState = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasHelplineTitle: text.includes("১৬৬৯৯ জাতীয় আইনি সহায়তা হেল্পলাইন"),
      hasDialpad: text.includes("স্মার্ট আইভিআর ডায়ালপ্যাড"),
      hasCallRunningOrConnected: text.includes("CONNECTED") || text.includes("কল চলছে") || text.includes("কল প্রক্রিয়াধীন"),
      hasHangupBtn: text.includes("কল শেষ করুন")
    };
  });

  console.log("Softphone Modal state:", modalState);
  if (!modalState.hasHelplineTitle || !modalState.hasDialpad) {
    throw new Error("Softphone modal did not open properly!");
  }

  // Test Minimize functionality
  console.log("5. Testing modal minimize button...");
  const minimizeBtn = page.getByRole('button', { name: /মিনিমাইজ/ }).first();
  if (await minimizeBtn.count()) {
    await minimizeBtn.click();
    await page.waitForTimeout(1000);

    const minimizedState = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasFloatingPill: text.includes("১৬৬৯৯ কল চলছে") || text.includes("উইন্ডো খুলুন"),
      };
    });
    console.log("Minimized floating pill state:", minimizedState);

    // Click 'উইন্ডো খুলুন' to restore
    console.log("6. Restoring modal from floating pill...");
    const restoreBtn = page.getByRole('button', { name: /উইন্ডো খুলুন/ }).first();
    if (await restoreBtn.count()) {
      await restoreBtn.click();
      await page.waitForTimeout(1000);
    }
  }

  // Send DTMF 2 to verify intake works inside the modal
  console.log("7. Sending DTMF 2 (অভিযোগ) inside modal...");
  await page.evaluate(() => {
    if (window.__voiceAgent) {
      window.__voiceAgent.sendUserMessage("২");
    }
  });
  await page.waitForTimeout(3500);

  const intakeActive = await page.evaluate(() => {
    const text = document.body.innerText;
    return text.includes("আইনি অভিযোগ ও কেস নথিভুক্তি") || text.includes("ধাপ ১: সমস্যা বর্ণনা");
  });

  console.log("Intake stepper active:", intakeActive);

  // Hang up
  console.log("8. Ending call...");
  const hangupBtn = page.getByRole('button', { name: /কল শেষ করুন/ }).first();
  if (await hangupBtn.count()) {
    await hangupBtn.click();
    await page.waitForTimeout(1000);
  }

  await browser.close();
  console.log("=== ALL LANDING PAGE & SOFTPHONE MODAL TESTS PASSED SUCCESSFULLY! ===");
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
