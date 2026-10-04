#!/usr/bin/env node
/**
 * Bulletproof teardown for the Next dev server + TTS proxy.
 *
 * Guarantees (never hangs, never leaves a wedged port):
 *  1. Lists every pid bound to the target ports (SS check).
 *  2. SIGTERM, then polls until the port is actually released.
 *  3. If a SIGTERM'd process refuses to die (open WS keeping the event loop
 *     alive, stuck audio/pipewire threads, etc.), escalates to SIGKILL and
 *     polls again.
 *  4. Always exits: reports each port as freed or lists the remaining leak.
 */
import { execSync } from "node:child_process";
import net from "node:net";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORTS = process.argv.slice(2).map(Number).filter(Number.isFinite);
const targets =
  PORTS.length > 0
    ? PORTS
    : [
        Number(process.env.PORT || 3000),
        Number(process.env.TTS_PROXY_PORT || 8200),
      ];

function log(msg) {
  console.log(`[stop] ${msg}`);
}

function pidsOnPort(port) {
  try {
    const out = execSync(`ss -tlnp '( sport = :${port} )' 2>/dev/null`, {
      encoding: "utf8",
    }).trim();
    if (!out) return [];
    const pids = new Set();
    for (const line of out.split("\n").slice(1)) {
      const m = line.match(/pid=(\d+)/);
      if (m) pids.add(Number(m[1]));
    }
    return [...pids];
  } catch {
    return [];
  }
}

function portFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => {
      try {
        probe.close();
      } catch {}
      resolve(false);
    });
    probe.listen({ host: "127.0.0.1", port }, () => {
      probe.close(() => resolve(true));
    });
  });
}

async function killPid(pid) {
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

async function stopPort(port) {
  const pids = pidsOnPort(port);
  if (pids.length === 0) {
    log(`port ${port}: nothing running`);
    return true;
  }

  log(`port ${port}: sending SIGTERM to ${pids.join(", ")}`);
  for (const pid of pids) await killPid(pid);

  // Poll for release (default ~5s).
  for (let i = 0; i < 20; i++) {
    await sleep(250);
    if (await portFree(port)) {
      log(`port ${port}: freed after SIGTERM`);
      return true;
    }
  }

  // Escalate: SIGKILL is guaranteed to release the listener.
  log(`port ${port}: escalating to SIGKILL (pid ${pids.join(", ")})`);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
  for (let i = 0; i < 12; i++) {
    await sleep(250);
    if (await portFree(port)) {
      log(`port ${port}: freed after SIGKILL`);
      return true;
    }
  }

  log(`port ${port}: STILL BLOCKED after SIGKILL: ${pidsOnPort(port).join(", ")}`);
  return false;
}

export async function stopEverything() {
  const results = [];
  for (const port of targets) results.push({ port, ok: await stopPort(port) });
  return results;
}

if (import.meta.main) {
  const results = await stopEverything();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}