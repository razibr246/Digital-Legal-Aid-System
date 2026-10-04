#!/usr/bin/env node
/**
 * Bulletproof restart: `npm run restart`.
 *
 *  - Tears down the dev server + TTS proxy with SIGTERM → SIGKILL escalation.
 *  - Launches `next dev` fully detached (stdio ignored, no inherited FDs), so
 *    this script can never block the terminal, regardless of OS/Bluetooth/
 *    pipewire thread behaviour in the dev process.
 *  - Polls /api/voice/config until the server answers, then reports the live
 *    voice state (STT language, TTS proxy URL). Hard 60s ceiling: on failure it
 *    prints a reason and exits non-zero instead of hanging.
 */
import { spawn } from "node:child_process";
import { stopEverything } from "./stop.mjs";

const PORT = Number(process.env.PORT || 3000);
const CONFIG_URL = `http://127.0.0.1:${PORT}/api/voice/config`;
const STARTUP_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  console.log(`[restart] ${msg}`);
}

async function main() {
  log("stopping existing server/proxy...");
  const results = await stopEverything();
  for (const r of results) {
    log(`port ${r.port}: ${r.ok ? "released" : "REMAINS BLOCKED"}`);
  }

  log("starting next dev (detached)...");
  const startedAt = Date.now();
  const child = spawn("npm", ["run", "dev"], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const deadline = startedAt + STARTUP_TIMEOUT_MS;
  let lastError = "never responded";

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const res = await fetch(CONFIG_URL, { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        log(`server ready in ${elapsed}s`);
        log(
          `voice live: language=${j.language} model=${j.sttModel} ttsLive=${j.ttsProxyLive} ttsUrl=${j.ttsProxyUrl}`,
        );
        process.exit(0);
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = String(err?.cause?.message || err?.message || err);
    }
  }

  console.error(
    `[restart] FAILED: server not ready after ${STARTUP_TIMEOUT_MS / 1000}s (${lastError}). Logs: /tmp/opencode/next-dev.log`,
  );
  process.exit(1);
}

main();