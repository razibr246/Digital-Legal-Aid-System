/**
 * Fails if `lib/build-info.ts` does not name the commit that is actually deployed.
 *
 * FREE: no call, no STT/TTS, no LLM. Reads git, and one authenticated page render.
 *
 * Why this exists
 * ---------------
 * `components/build-stamp.tsx` exists so a stale deploy is VISIBLE instead of argued
 * about — the shell used to carry a hardcoded date, which is how several deploys went
 * unnoticed. That only works if the stamp is true.
 *
 * The documented deploy was `npx opennextjs-cloudflare build && npx wrangler deploy`,
 * which never runs `scripts/write-build-info.mjs`; only `npm run build` does. A deploy
 * that way shipped a stamp reading `ed07534` while the running code was two commits
 * newer — the exact failure the stamp exists to catch, produced by the stamp itself.
 * `npm run deploy` now does the right thing, and this check catches the case where
 * somebody bypasses it again.
 *
 * The stamp must name a commit **in HEAD's history**. `lib/build-info.ts` is build output and
 * is gitignored, precisely because it used to be committed — which made it self-invalidating:
 * writing the stamp is itself a commit, so the served stamp trailed HEAD by one no-op commit
 * and read as deployment drift.
 *
 * So the two failure modes are different and are reported differently:
 *
 *   - the live stamp is NOT in HEAD's history — a deploy from another branch, a rolled-back
 *     Worker, or a hand-edited file. That is drift, and it FAILS.
 *   - the live stamp is an ancestor of HEAD — you have committed since the last deploy. That
 *     is not drift, and requiring `live === head` would make this check fail after every
 *     docs-only commit. It WARMS, with the commit distance so the number is actionable.
 *
 *   node scripts/check-build-stamp.mjs                 # against the live site
 *   SITE=http://localhost:8787 node scripts/check-build-stamp.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const site = process.env.SITE || "https://legal-voice-agent.adribmahmud.workers.dev";

const git = (...args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const results = [];
const check = (label, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? " :: " + extra : ""}`);
};
const warn = (label, extra = "") => console.log(`WARN ${label}${extra ? " :: " + extra : ""}`);

/** Is `sha` in HEAD's history? */
const inHistory = (sha) => {
  if (!sha || !/^[0-9a-f]{6,40}$/.test(sha)) return false;
  try {
    // The args MUST be an array. `execFileSync(file, args, options)` — passing them as
    // loose parameters silently turns the second string into the options object, and
    // `--is-ancestor` then never reaches git, so this returned false for every SHA.
    execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
/** How many commits HEAD is ahead of `sha`. */
const distance = (sha) => {
  try {
    // Array args here too — see inHistory.
    return Number(execFileSync("git", ["rev-list", "--count", `${sha}..HEAD`], { encoding: "utf8" }).trim());
  } catch {
    return -1;
  }
};

const stamped = /BUILD_SHA = "([^"]+)"/.exec(readFileSync(resolve("lib/build-info.ts"), "utf8"))?.[1] ?? "";
const head = git("rev-parse", "--short", "HEAD");

check("build-info.ts carries a SHA", Boolean(stamped), stamped || "(empty)");
check("the local stamp names a commit in HEAD's history", inHistory(stamped), `stamped=${stamped} head=${head}`);
if (stamped && stamped !== head) {
  warn("the local stamp is behind HEAD", `${distance(stamped)} commit(s) behind — a build has not run since`);
}

// The trap this file exists beside: if build-info.ts is ever re-committed, the served
// stamp trails HEAD by a no-op commit and reads as drift. `git status` cannot see an
// ignored path, so ask git directly — and note that `check-ignore -q` prints NOTHING on
// either outcome, distinguishing them only by exit code. Routing it through the `git()`
// output helper above made success and failure both return "", so this assertion was
// `true` unconditionally: a check that could not fail. Call execFileSync and branch on
// the throw, which is the only signal `check-ignore` actually gives.
let ignored = false;
try {
  execFileSync("git", ["check-ignore", "-q", "lib/build-info.ts"], { stdio: "ignore" });
  ignored = true;
} catch {
  ignored = false;
}
check("build-info.ts stays build output, not source", ignored,
  ignored ? "gitignored" : "NOT IGNORED -- committing it re-creates the self-invalidating stamp");

// Now the live site, read the way a person reads it: the rendered footer.
//
// Reading `BUILD_SHA` out of a client chunk does not work — the constant is inlined and
// minified, so a chunk scan finds nothing and the check silently SKIPs its most important
// assertion. The stamp is rendered by `DlaoShell`, so the page is authenticated; the
// one-click staff login is what the other console suites use.
let live = "(unread)";
try {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto(site, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    await fetch("/api/portal/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role: "dlao" }),
    });
  });
  await page.goto(`${site}/dlao`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const text = await page.evaluate(() => {
    const el = [...document.querySelectorAll("span")].find((e) => /বিল্ড/.test(e.textContent || ""));
    return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : null;
  });
  await browser.close();
  live = text?.match(/বিল্ড:\s*([0-9a-f]{6,40})/)?.[1] ?? "(not rendered)";
} catch (err) {
  check("the live stamp is readable", false, String(err).slice(0, 90));
}

check("the live stamp is readable", live !== "(unread)" && live !== "(not rendered)", live);
if (/^[0-9a-f]{6,40}$/.test(live)) {
  // Drift, as opposed to "you have not deployed since".
  check("the deployed build is from this line of history", inHistory(live), `live=${live} head=${head}`);
  if (inHistory(live) && live !== head) {
    warn("the deployed build is behind HEAD", `${distance(live)} commit(s) behind — run npm run deploy`);
  }
  check("the live stamp matches the last local build", live === stamped, `live=${live} stamped=${stamped}`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed) process.exit(1);
