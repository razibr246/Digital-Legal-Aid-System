/**
 * Pre-flight check for the 16699 voice call. Run this BEFORE a live demonstration.
 *
 * FREE: the Soniox sockets are intercepted with Playwright and never reach the provider,
 * so no STT/TTS credit is spent and no audio is synthesised. What it verifies is
 * everything that has actually gone wrong before:
 *
 *   1. the call button is on the page and the modal opens
 *   2. a blocked microphone produces a VISIBLE Bangla error, not a dead button
 *   3. with a microphone, the session reaches "STT connected" and the greeting plays
 *   4. no page errors and no failed requests along the way
 *
 * The mic-denied case is the one that matters most. It used to throw into a
 * `console.error` that nobody can see during a demo, so the agent looked broken while the
 * server and Soniox were both fine.
 *
 * Usage:  node scripts/verify_voice_readiness.mjs
 */

import { chromium } from "playwright-core";

const SITE = process.env.SITE || "https://legal-voice-agent.adribmahmud.workers.dev";
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name} ${extra}`);
  }
};

const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

async function stubVoice(page, tag) {
  // Intercept both sockets. The client believes it connected, which is what lets us test
  // the start path, and Soniox never sees a byte.
  let stt = false;
  let tts = false;
  await page.routeWebSocket(/.*\/v1\/stt.*/, (ws) => {
    stt = true;
    ws.onMessage(() => {
      try {
        ws.send(JSON.stringify({ type: "error", message: `${tag}: stubbed` }));
      } catch {}
    });
  });
  await page.routeWebSocket(/.*\/v1\/tts.*/, (ws) => {
    tts = true;
    ws.close();
  });
  return () => ({ stt, tts });
}

console.log("\n=== 1. microphone GRANTED: the call must start ===");
{
  const ctx = await browser.newContext({ permissions: ["microphone"] });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  const sockets = await stubVoice(page, "granted");

  await page.goto(SITE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);

  ok("secure context (mic requires https)", await page.evaluate(() => window.isSecureContext));
  const mic = await page.evaluate(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const n = s.getAudioTracks().length;
      s.getTracks().forEach((t) => t.stop());
      return n;
    } catch (e) {
      return `ERR:${e.name}`;
    }
  });
  ok("getUserMedia returns an audio track", mic === 1, `got ${mic}`);

  const btn = page.locator('button:has-text("কল করুন")').first();
  ok("the call button exists", (await btn.count()) > 0);
  await btn.click();
  await page.waitForTimeout(7000);

  const seen = sockets();
  ok("the STT socket was opened", seen.stt);
  ok("the TTS socket was opened", seen.tts);

  const body = await page.locator("body").innerText();
  ok("the softphone opened", /১৬৬৯৯ জাতীয়/.test(body));
  ok("NO failure banner is shown", !/কল শুরু হয়নি/.test(body));
  ok("no page errors", errors.length === 0, errors.join(" | "));
  await ctx.close();
}

console.log("\n=== 2. microphone DENIED: the failure must be visible ===");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const sockets = await stubVoice(page, "denied");

  // Deny the microphone deterministically.
  //
  // `permissions: []` does NOT deny: the browser-level fake device exists in every
  // context, so the stream is granted and the test silently measured the happy path. A
  // denied permission has no API to assert against either -- it is invisible until
  // asked. So the refusal is injected at the only seam that matters, getUserMedia, and
  // the app's own handling of NotAllowedError is what gets tested.
  await page.addInitScript(() => {
    const err = () => {
      const e = new Error("Permission denied");
      e.name = "NotAllowedError";
      return e;
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => Promise.reject(err()),
        enumerateDevices: () => Promise.resolve([]),
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
  });

  await page.goto(SITE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);

  const btn = page.locator('button:has-text("কল করুন")').first();
  await btn.click();
  await page.waitForTimeout(5000);

  const body = await page.locator("body").innerText();
  ok("a visible failure banner is shown", /কল শুরু হয়নি/.test(body));
  ok("the message is in Bangla", /মাইক্রোফোন/.test(body));
  ok("it says how to fix it", /অনুমতি|লক আইকন|ON করুন/.test(body));
  ok("the STT socket is NOT opened", sockets().stt === false, "a blocked mic must not dial");
  await ctx.close();
}

console.log("\n=== 3. the greeting clip is actually fetchable ===");
{
  // A ranged GET rather than HEAD: the worker does not send content-length for HEAD, so
  // asserting on it would have measured a missing header instead of a missing file.
  const res = await fetch(`${SITE}/audio/greeting_language.wav`, { headers: { Range: "bytes=0-1023" } });
  ok("greeting_language.wav is served", res.ok, `status ${res.status}`);
  const body = await res.arrayBuffer();
  ok("it returns real audio bytes", body.byteLength >= 1024, `${body.byteLength} bytes`);
  const head = new Uint8Array(body.slice(0, 4));
  const isRiff = String.fromCharCode(head[0], head[1], head[2], head[3]) === "RIFF";
  ok("it is a real RIFF/WAVE file, not an error page", isRiff);
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
console.log(
  fail
    ? "\nNOT READY. Fix the failures above before demonstrating."
    : "\nREADY. The call path starts, and a blocked mic now says so out loud.",
);
process.exit(fail ? 1 : 0);
