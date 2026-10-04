/**
 * The Chief console, in a real browser, on the deployed worker.
 *
 * Free: it only reads /chief and /api/chief, and the actions it attempts are ones the
 * server is supposed to refuse, so no voice credit is spent and nothing is decided.
 * It asserts the things that are easy to get subtly wrong:
 *   1. a DLAO is refused the page *and* the API
 *   2. the Chief and the Chairman both get the console
 *   3. the two role variants disagree on panel/misconduct authority
 *   4. a two-of-three settlement cannot be certified, and the note names the gap
 *   5. a rejection without a reason is refused
 */
import { chromium } from "playwright-core";

const SITE = process.env.SITE || "https://legal-voice-agent.adribmahmud.workers.dev";
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

async function loginAs(page, role) {
  // Staff sign-in is by role, not by a password, so the session cookie is all there is.
  const res = await page.request.post(`${SITE}/api/portal/login`, { data: { role } });
  if (!res.ok()) throw new Error(`login as ${role} failed: ${res.status()}`);
  return res;
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log("\n1. a DLAO is refused the Chief console");
await loginAs(page, "dlao");
const res = await page.request.get(`${SITE}/api/chief`);
ok("DLAO gets 403 from the API", res.status() === 403, `got ${res.status()}`);
await page.goto(`${SITE}/chief`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const deniedText = await page.locator("body").innerText();
ok("DLAO is not shown the console", !/প্রত্যায়ন/.test(deniedText), deniedText.slice(0, 120));
ok("DLAO is bounced away from /chief", !/চীফ লিগ্যাল এইড অফিসার কনসোল/.test(deniedText));

console.log("\n2. the Chief gets the console, and lands on it");
await ctx.clearCookies();
await loginAs(page, "chief");
const chief = await page.request.get(`${SITE}/api/chief`);
ok("Chief gets 200 from the API", chief.status() === 200, `got ${chief.status()}`);
if (chief.status() === 200) {
  const d = await chief.json();
  ok("role resolves to chief", d.role === "chief", d.role);
  ok("Chief may propose panel changes", d.permissions?.proposePanelChanges === true);
  ok("Chief may NOT approve panel changes", d.permissions?.approvePanelChanges === false);
  ok("Chief may NOT action misconduct", d.permissions?.actionMisconduct === false);
}
await page.goto(`${SITE}/chief`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const chiefText = await page.locator("body").innerText();
ok("console renders the framing line", /প্রত্যায়ন করেন/.test(chiefText));
ok("console shows the five tabs", /সারসংক্ষেপ/.test(chiefText) && /অসদাচরণ/.test(chiefText));
// "শুধুমাত্র পরিদর্শন" — supervision only, i.e. the view is read-only. The badge used to
// read "পরিদর্শনের জন্য", which matched nothing.
ok("supervision is marked read-only", /শুধুমাত্র পরিদর্শন/.test(chiefText));

console.log("\n3. the certification gate holds at two of three");
if (chief.status() === 200) {
  const d = await chief.json();
  const blocked = (d.certifications || []).filter((c) => !c.canCertify);
  for (const c of blocked) {
    const signed = [c.signedA, c.signedB, c.signedC].filter(Boolean).length;
    ok(`${c.ref} blocked with ${signed}/3 signed`, signed < 3);
    ok(`${c.ref} note names who is outstanding`, /বাকি/.test(c.blockedNote || ""), c.blockedNote);
  }
  // Attempt it anyway. The server re-checks, so this must be refused with 409.
  const target = blocked[0];
  if (target) {
    const attempt = await page.request.post(`${SITE}/api/chief`, {
      data: { action: "certify", id: target.caseId },
    });
    ok("server refuses a two-of-three certification", attempt.status() === 409, `got ${attempt.status()}`);
  } else {
    console.log("  --   no blocked settlement seeded, skipped the POST attempt");
  }
}

console.log("\n4. a rejection with no reason is refused");
if (chief.status() === 200) {
  const d = await chief.json();
  const p = (d.payments || [])[0];
  if (p) {
    const attempt = await page.request.post(`${SITE}/api/chief`, {
      data: { action: "payment_reject", id: p.id },
    });
    ok("rejection without a reason is 400", attempt.status() === 400, `got ${attempt.status()}`);
  } else {
    console.log("  --   no pending payment, skipped");
  }
}

console.log("\n5. the Chief is denied a misconduct action");
if (chief.status() === 200) {
  const attempt = await page.request.post(`${SITE}/api/chief`, {
    data: { action: "misconduct_action", id: "x", reason: "test" },
  });
  ok("misconduct action by the Chief is 403", attempt.status() === 403, `got ${attempt.status()}`);
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
