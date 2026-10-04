#!/usr/bin/env node
/**
 * Stress harness: bulletproof stop/restart validation.
 *
 * Every subprocess call runs under a hard timeout; a "hang" manifests as a
 * tool-status 124 / spawnSync status null. Cycles mix worst-case conditions:
 * held TTS sockets during teardown, SIGTERM-ignoring zombies, stale holders on
 * 8200, SIGKILL mid-stream, back-to-back ops, restart while actively streaming.
 *
 * Exit code 0 only if every assertion passes.
 */
import { spawnSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import WebSocket from "ws";

const PROJECT = "/home/adrib/legal_voice_agent";
const QUICK = process.argv.includes("quick");
const CYCLE = QUICK
  ? [0, 1, 5, 3, 2, 14] // indispensable adversarial matrix only
  : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const LINEFEED = 80;

let pass = 0;
let fail = 0;
const failures = [];

const RUN_LIMIT = QUICK ? 60_000 : 90_000; // per command; hang => exceeded
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: PROJECT,
    encoding: "utf8",
    timeout: opts.timeout || RUN_LIMIT,
    maxBuffer: 1 << 24,
    env: { ...process.env, ...opts.env },
  });
  const timedOut = res.signal === "SIGTERM" && res.status === null;
  const code = res.status ?? (timedOut ? 124 : res.error ? 1 : 0);
  return { code, output: (res.stdout || "") + (res.stderr || ""), timedOut };
}

function note(cycle, ok, msg) {
  const tag = ok ? "PASS" : "FAIL";
  const shortMsg = msg.length > 160 ? msg.slice(0, 157) + "..." : msg;
  console.log(`[cycle ${String(cycle).padStart(2)}] ${tag}  ${shortMsg}`);
  if (ok) pass++;
  else {
    fail++;
    failures.push({ cycle, msg });
  }
}

async function portFree(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => {
      try {
        probe.close();
      } catch {}
      resolve(false);
    });
    probe.listen({ host: "127.0.0.1", port }, () => probe.close(() => resolve(true)));
  });
}

async function configState() {
  try {
    const res = await fetch("http://127.0.0.1:3000/api/voice/config", { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function holdWs(url, origin = "http://localhost:3000") {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, url.startsWith("ws://127") ? { headers: { Origin: origin } } : {});
    ws.on("open", () => resolve(ws));
    ws.on("error", () => resolve(null));
  });
}

async function ttsE2E(url, label) {
  // Real audio through the proxy (browser-style Origin): Speak + Flush must
  // yield binary frames and a Flushed ack within 15s.
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { headers: { Origin: "http://localhost:3000" } });
    let bytes = 0;
    let flushed = false;
    const t = setTimeout(() => {
      // Finalize only when the socket closes; this timer just force-closes so
      // a slow-but-successful flush is never misjudged as a hang.
      try {
        ws.close();
      } catch {}
    }, 12_000);
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "Speak", text: "আমি বাংলা ভাষার নির্ভুলতা পরীক্ষা করছি" }));
      ws.send(JSON.stringify({ type: "Flush" }));
    });
    ws.on("message", (d, isBinary) => {
      if (isBinary) bytes += d.length;
      else if (JSON.parse(String(d)).type === "Flushed") flushed = true;
    });
    ws.on("error", () => {});
    ws.on("close", () => {
      clearTimeout(t);
      resolve({ ok: bytes > 0 && flushed, bytes, flushed });
    });
  });
}

async function llmCheck() {
  try {
    const res = await fetch("http://127.0.0.1:3000/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: "Say test" }],
        stream: true,
        max_tokens: 8,
      }),
    });
    const txt = await res.text();
    return res.ok && txt.includes(`"choices"`);
  } catch {
    return false;
  }
}

function spawnHolder(port, { ignoreSigterm = false } = {}) {
  const src = `require("net").createServer().listen(${port},"127.0.0.1",()=>console.log("holder-up-${port}"));${ignoreSigterm ? 'process.on("SIGTERM",()=>{});' : ""}setInterval(()=>{},1000);`;
  const child = spawn("node", ["-e", src], {
    cwd: PROJECT,
    detached: true,
    stdio: "ignore",
    shell: false,
  });
  child.unref();
  return child.pid;
}

async function killPid(pid, signals = ["SIGTERM", "SIGKILL"]) {
  for (const s of signals) {
    try {
      process.kill(pid, s);
    } catch {}
  }
}

(async () => {
  const began = Date.now();
  console.log(`# stress harness: ${CYCLE.join(",")} cycles, hang-gate ${RUN_LIMIT}ms/command\n`);

  // Heartbeat so long sleeps never look like a hang.
  const beat = setInterval(() => {
    console.log(`# ...alive ${Math.round((Date.now() - began) / 1000)}s`);
  }, 12_000);

  // Baseline
  let r = run("npm", ["run", "stop"]);
  note(0, r.code === 0, `baseline stop rc=${r.code}`);

  const loop = async (n) => {
    switch (n) {
      case 1: {
        // Clean stop -> restart, then health check (audio e2e runs once in final).
        r = run("npm", ["run", "stop"]);
        note(n, r.code === 0 && (await portFree(3000)) && (await portFree(8200)), `stop rc=${r.code} portsFree`);
        r = run("npm", ["run", "restart"]);
        note(n, r.code === 0, `restart rc=${r.code} (hang=${r.timedOut})`);
        const cfg = await configState();
        note(n, !!cfg && cfg.ttsProxyLive === true && cfg.language === "bn", `health lang=${cfg?.language} live=${cfg?.ttsProxyLive}`);
        break;
      }
      case 2: {
        // Restart with a stale holder already on 8200 BEFORE server starts.
        await run("npm", ["run", "stop"]);
        const holder = spawnHolder(8200);
        r = run("npm", ["run", "restart"]);
        await killPid(holder);
        const cfg = await configState();
        note(n, r.code === 0 && !!cfg && cfg.ttsProxyLive === true && cfg.ttsProxyUrl.includes(":"),
          `stale-8200: rc=${r.code} live=${cfg?.ttsProxyLive} url=${cfg?.ttsProxyUrl}`);
        break;
      }
      case 3: {
        // Held browser-style TTS socket during stop must be force-closed / freed quickly.
        const cfg = await configState();
        const ws = await holdWs(cfg?.ttsProxyUrl);
        r = run("npm", ["run", "stop"]);
        await sleep(300);
        const closed = !ws || ws.readyState === WebSocket.CLOSED;
        note(n, r.code === 0 && closed && (await portFree(8200)), `held-socket: rc=${r.code} clientClosed=${closed}`);
        await run("npm", ["run", "restart"]);
        break;
      }
      case 4: {
        // Double stop (idempotent, second must be instant no-op).
        r = run("npm", ["run", "stop"]);
        const r2 = run("npm", ["run", "stop"]);
        note(n, r.code === 0 && r2.code === 0 && !r2.timedOut, `double-stop rc=${r.code},${r2.code} hang2=${r2.timedOut}`);
        await run("npm", ["run", "restart"]);
        break;
      }
      case 5: {
        // Stubborn holder on 3000 ignoring SIGTERM -> stop MUST escalate to SIGKILL.
        await run("npm", ["run", "stop"]);
        const holder = spawnHolder(3000, { ignoreSigterm: true });
        await sleep(500);
        r = run("npm", ["run", "stop"]);
        await killPid(holder);
        note(n, r.code === 0 && (await portFree(3000)), `stubborn-3000: rc=${r.code} freed=${await portFree(3000)}`);
        await run("npm", ["run", "restart"]);
        break;
      }
      case 6: {
        // SIGKILL the state machine mid-stream (active TTS client), then stop.
        const cfg = await configState();
        const ws = await holdWs(cfg?.ttsProxyUrl);
        await sleep(200);
        const ns = run("bash", ["-c", "pgrep -f 'next-server' | head -1"], {});
        if (ns.code === 0) {
          try {
            process.kill(Number(ns.output.trim()), "SIGKILL");
          } catch {}
        }
        r = run("npm", ["run", "stop"]);
        await killPid(ws ? 0 : 0); // noop guard
        note(n, r.code === 0 && (await portFree(3000)) && (await portFree(8200)), `sigi-kill-midstream stop rc=${r.code} wireFree=${await portFree(3000)}`);
        await run("npm", ["run", "restart"]);
        break;
      }
      case 7: {
        // Five rapid stop calls; every one must return in strict time.
        let allFast = true;
        let last = 0;
        for (let i = 0; i < 5; i++) {
          const t0 = Date.now();
          r = run("npm", ["run", "stop"]);
          allFast = allFast && r.code === 0 && !r.timedOut && Date.now() - t0 < 15_000;
          last = r.code;
        }
        note(n, allFast, `rapid×5 stops all-fast=${allFast} last=${last}`);
        await run("npm", ["run", "restart"]);
        break;
      }
      case 8: {
        // Kill while actively streaming TTS audio (the crime-scene condition).
        const cfg = await configState();
        const mid = await holdWs(cfg?.ttsProxyUrl);
        await sleep(100);
        run("npm", ["run", "stop"]);
        await sleep(250);
        const closed = !mid || mid.readyState === WebSocket.CLOSED;
        r = run("npm", ["run", "restart"]);
        const cfg2 = await configState();
        note(n, r.code === 0 && closed && !!cfg2 && cfg2.ttsProxyLive === true,
          `checkStop-mid-stream: restart rc=${r.code} clientClosed=${closed} live=${cfg2?.ttsProxyLive}`);
        break;
      }
      case 9: {
        // Stubborn holder ON the TTS port; stop must SIGKILL-escalate it.
        await run("npm", ["run", "stop"]);
        const holder = spawnHolder(8200, { ignoreSigterm: true });
        await sleep(500);
        r = run("npm", ["run", "stop"]);
        await killPid(holder);
        note(n, r.code === 0 && (await portFree(8200)), `stubborn-8200 rc=${r.code} freed=${await portFree(8200)}`);
        await run("npm", ["run", "restart"]);
        break;
      }
      case 10: {
        // Restart-while-something-running then full verify (audio + llm).
        r = run("npm", ["run", "restart"]);
        const cfg = await configState();
        const e = await ttsE2E(cfg.ttsProxyUrl, "cycle10");
        const llm = await llmCheck();
        note(n, r.code === 0 && e.ok && llm && cfg.language === "bn", `restart+tts(${e.bytes}B)+llm(${llm})`);
        break;
      }
      case 11: {
        // Simulate server started OUTSIDE the harness (manual `npm run dev`).
        await run("npm", ["run", "stop"]);
        const dev = spawn("npm", ["run", "dev"], { cwd: PROJECT, detached: true, stdio: "ignore" });
        dev.unref();
        await sleep(9000);
        r = run("npm", ["run", "restart"]);
        const cfg = await configState();
        note(n, r.code === 0 && !!cfg && cfg.language === "bn" && cfg.ttsProxyLive === true,
          `adopt-running-server restart rc=${r.code} live=${cfg?.ttsProxyLive}`);
        break;
      }
      case 12: {
        // Back-to-back restarts (no settle delay in the middle).
        r = run("npm", ["run", "restart"]);
        const r2 = run("npm", ["run", "restart"]);
        const cfg = await configState();
        note(n, r.code === 0 && r2.code === 0 && !!cfg && cfg.ttsProxyLive === true,
          `bb restart rc=${r.code}/${r2.code} hang=${r2.timedOut} live=${cfg?.ttsProxyLive}`);
        break;
      }
      case 13: {
        // Stubborn 3000 holder BEFORE restart: harness must still raise the server
        // (stop escalates first) or fail honestly — never 124/hang or worse: wedged ports.
        await run("npm", ["run", "stop"]);
        const holder = spawnHolder(3000, { ignoreSigterm: true });
        await sleep(500);
        r = run("npm", ["run", "restart"]);
        await killPid(holder);
        const cfg = await configState();
        const freed = (await portFree(3000)) ? "free" : "held";
        note(n, !r.timedOut && (r.code === 0 ? !!cfg && cfg.ttsProxyLive === true : true) && freed === "free",
          `stubborn-before-restart rc=${r.code} (hang=${r.timedOut}) port=${freed} live=${cfg?.ttsProxyLive ?? "-"}`);
        break;
      }
      case 14: {
        // Final recovery + strict audio assert + single real LLM stream.
        r = run("npm", ["run", "restart"]);
        const cfg = await configState();
        const e = await ttsE2E(cfg.ttsProxyUrl, "final");
        const llm = await llmCheck();
        const posts = run("bash", ["-c", "pgrep -c -f 'bin/next dev' || true"], {});
        const alive = Number((posts.output || "0").trim());
        const zombies = run("bash", ["-c", "ps -eo pid,stat,comm | awk '$2 ~ /Z/ && /node|next/ {print}'"], {});
        note(n, r.code === 0 && !!cfg && e.ok && llm && alive >= 1 && zombies.output.trim().length === 0,
          `final: restart rc=${r.code} tts=${e.ok}(${e.bytes}B) llm=${llm} nextDevProcs=${alive} zombies=${zombies.output.trim().length ? "YES" : "no"}`);
        break;
      }
      default:
        break;
    }
  };

  for (const n of CYCLE) if (n >= 0) await loop(n);

  const elapsed = Math.round((Date.now() - began) / 1000);
  clearInterval(beat);
  console.log(`\n# RESULT: ${pass} passed, ${fail} failed in ${elapsed}s`);
  for (const f of failures) console.log(`#   FAIL cycle ${f.cycle}: ${f.msg}`);

  // Ramp down for handoff.
  run("npm", ["run", "stop"]);
  process.exit(fail === 0 ? 0 : 1);
})();