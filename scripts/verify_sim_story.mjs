import { chromium } from "playwright-core";
const site = "https://legal-voice-agent.adribmahmud.workers.dev/";
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const p = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
let fail = 0;
const ck = (k, v, x = "") => { if (!v) fail++; console.log(`${v ? "PASS" : "FAIL"} ${k}${x ? " :: " + x : ""}`); };

// Every clip a turn references must actually be served. Derived from the plan rather than
// listed by hand: a hardcoded list is what let `nabila_02_problem.wav` outlive the file it
// named, and the failure it caused was silent — a missing clip degrades to a caption, so
// three of the five personas played back mute and every other check still passed.
const { audioClipPlan } = await (await import("jiti")).createJiti(import.meta.url).import("../lib/demo/simulations.ts");
const plan = audioClipPlan();
const badClips = [];
for (const c of plan) {
  const r = await fetch(site + "audio/sim/" + c.file);
  const ok = r.status === 200 && Number(r.headers.get("content-length")) > 1000;
  if (!ok) badClips.push(`${c.file} ${r.status}`);
}
ck(`all ${plan.length} clips served`, badClips.length === 0, badClips.length ? badClips.join(", ") : `${plan.length} files`);

// Distinct voices, checked as data rather than by ear. Soniox voices are
// language-independent, so a scenario that reuses one voice for two speakers is a defect
// the runtime cannot show — it just sounds like one person talking to themselves.
const cast = new Set(plan.map((c) => c.voice));
ck("the cast uses several distinct voices", cast.size >= 5, [...cast].join(", "));
const nabila = plan.filter((c) => c.simId === "nabila" && c.speaker === "caller");
const ripon = plan.filter((c) => c.simId === "ripon" && c.speaker === "caller");
ck("Nabila and Ripon do not share a voice", nabila.length && ripon.length && nabila[0].voice !== ripon[0].voice,
   `nabila=${nabila[0]?.voice} ripon=${ripon[0]?.voice}`);
const moyuriTurn = plan.find((c) => c.speaker === "moyuri");
ck("Moyuri has her own voice, not her proxy's", !!moyuriTurn && moyuriTurn.voice !== ripon[0]?.voice,
   `moyuri=${moyuriTurn?.voice}`);

await p.goto(site + "demo/simulation", { waitUntil: "networkidle" });
await p.waitForTimeout(1000);
ck("launcher lists the scenarios", (await p.locator("button:has-text('সিমুলেশন দেখুন')").count()) >= 5, "");

// Open Moyuri/Ripon.
await p.locator("button", { hasText: "মোয়ূরী" }).first().click();
await p.waitForTimeout(1200);
ck("opens as a modal dialog", (await p.locator('[role="dialog"]').count()) === 1, "");
ck("the dialog is nearly full-screen", (await p.locator('[role="dialog"] > div').first().evaluate((el) => el.getBoundingClientRect().width / window.innerWidth)) > 0.9, "");

// The seven phase chips are the story map. Read them from the phase strip specifically —
// `ol li` also matches the proof panel's list, which counts against the assertion.
const phaseChips = (await p.locator("[data-phase-strip] li").allTextContents()).map((t) => t.trim());
ck("shows seven phases", phaseChips.length === 7, `${phaseChips.length}: ${phaseChips.join(" | ")}`);
// Each chip renders its own number first, so the leading characters must read 1..7.
const numbers = phaseChips.map((t) => t[0]).join("");
ck("they are numbered 1 to 7", numbers === "1234567", numbers);
ck("phase 1 is the call", phaseChips.some(t => t.includes("১৬৬৯৯")), "");
ck("safe-window phase is listed", phaseChips.some(t => t.includes("নিরাপদ সময়")), "");
ck("mediation phase is listed", phaseChips.some(t => t.includes("মধ্যস্থতা")), "");
ck("AI settlement phase is listed", phaseChips.some(t => t.includes("সালিশ সনদ")), "");

// Run it and confirm audio actually plays.
const run = p.locator("button", { hasText: "সিমুলেশন চালান" }).first();
ck("run button shows the step count", /ধাপ/.test(await run.textContent()), (await run.textContent()).trim());
await run.click();
await p.waitForTimeout(2500);
const played = await p.evaluate(() => {
  const el = document.querySelector("audio[data-audio-src]");
  if (!el) return null;
  return { src: el.getAttribute("data-audio-src"), state: el.getAttribute("data-audio-state"), paused: el.paused, t: el.currentTime, dur: el.duration };
});
ck("an <audio> element is mounted for the clip", played !== null, JSON.stringify(played));
ck("the clip is actually playing, not paused", played && played.paused === false && (played.t > 0 || played.state === "playing"), JSON.stringify(played));
ck("the source is a generated clip", played && /\/audio\/sim\/moyuri_/.test(played.src || ""), String(played && played.src));
ck("the clip has real duration", played && played.dur > 1, String(played && played.dur));

// Let it run into the later phases and confirm the window/mediation panels appear.
await p.waitForTimeout(26000);
const later = await p.evaluate(() => document.body.innerText);
ck("story advanced past the call", later.includes("ট্রান্সক্রিপ্ট"), "");

ck("no page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
await b.close();
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
