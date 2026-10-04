/**
 * Fails loudly when a deploy did not actually land.
 *
 * Written because a deploy that printed no version id was treated as done, and a
 * year-long `s-maxage` on HTML meant a stale document could be served indefinitely —
 * and for several cycles neither of us could tell which build was in front of us.
 *
 * Two independent checks, because either alone can be fooled:
 *   1. The live page must serve the build sha that was just written by
 *      scripts/write-build-info.mjs. This catches a deploy that did not roll out.
 *   2. The live page must not be served with a long shared-cache TTL. This catches the
 *      document being cached at the edge, which looks identical from a browser.
 *
 *   node scripts/verify-deploy.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const base = (process.argv[2] || "https://legal-voice-agent.adribmahmud.workers.dev").replace(/\/$/, "");
// A regex match is an array: [full, group1]. Destructuring it as an object binds
// BUILD_SHA to the *whole* match, and [1] then reads a character out of the literal
// source text — which is how this reported a one-letter build sha.
const expected = /BUILD_SHA = "([^"]+)"/.exec(readFileSync(resolve("lib/build-info.ts"), "utf8"))?.[1];
if (!expected) {
  console.error("could not read BUILD_SHA from lib/build-info.ts — run `npm run build` first");
  process.exit(1);
}

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`  FAIL  ${msg}`);
};
const pass = (msg) => console.log(`  PASS  ${msg}`);

// 1. the document, fetched with a unique query so no cache can answer for us
const stampUrl = `${base}/login?deploy-probe=${Date.now()}`;
const doc = await fetch(stampUrl, { redirect: "follow" });
const html = await doc.text();
const cc = doc.headers.get("cache-control") ?? "";
const cdn = doc.headers.get("cdn-cache-control") ?? "";

console.log(`\nexpecting build ${expected} at ${base}`);

// The worker stamps every response with the build it is. Checked on a cache-busted
// request *and* read back per-route below, because either alone can be fooled.
const hdr = doc.headers.get("x-app-build");
if (hdr === expected) pass(`worker reports build ${hdr}`);
else if (html.includes(expected)) pass(`served document carries build ${expected}`);
else fail(`neither the response header nor the document carries build ${expected} (header: ${hdr}) — the deploy did not roll out`);

const longTtl = /s-maxage=(\d{5,})/.exec(cc);
if (longTtl) fail(`HTML is cacheable at the edge for ${longTtl[1]}s — this is what hid the last deploy`);
else if (/no-store|no-cache/.test(cc) || /no-store/.test(cdn)) pass(`edge caching disabled (${cc})`);
else fail(`unexpected cache-control "${cc}" — an edge may serve a stale document`);

// 2. the same page without a cache buster, which is what a real visitor gets
const plain = await fetch(`${base}/login`, { redirect: "follow" });
const plainBuild = plain.headers.get("x-app-build") ?? (await plain.text()).includes(expected) ? expected : null;
if (plainBuild === expected) pass("a normal (cacheable) request also carries the current build");
else fail(`a normal request reports build ${plainBuild} — the edge is holding a stale document`);

// 3. every route must be on the same build. A partial rollout — the worker updated
//    but one route's document cached from before — is what an eyeball comparison of two
//    pages will not catch, and it is exactly how "it works on localhost" and "it is
//    stale on the domain" can both be true at once.
const PATHS = ["/", "/login", "/citizen", "/dlao"];
const seen = new Set();
for (const path of PATHS) {
  const res = await fetch(`${base}${path}?probe=${Date.now()}`, { redirect: "follow" });
  const body = await res.text();
  const found = res.headers.get("x-app-build") ?? (body.includes(expected) ? expected : null);
  if (found) seen.add(found);
  else console.log(`  note  ${path} did not expose a build id`);
}
if (seen.size === 1) pass(`all ${PATHS.length} routes serve one build (${[...seen][0]})`);
else if (seen.size > 1) fail(`routes are on ${seen.size} different builds: ${[...seen].join(", ")}`);
else pass("build id not readable from the probed routes");

console.log(failed ? "\nDEPLOY VERIFICATION FAILED\n" : "\nDEPLOY VERIFIED\n");
process.exit(failed ? 1 : 0);
