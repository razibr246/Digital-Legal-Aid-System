/**
 * Transcription must be *visible* fast, and the turn must commit fast.
 *
 * Two distinct failures are guarded here, and they are easy to confuse:
 *
 *  1. Perceived latency. Soniox streams partial tokens continuously, but the
 *     session used to swallow them (`handleSttInterim` only assigned a field and
 *     emitted nothing) and the transcript panel sits behind a tab whose default
 *     view is the docket, which shows only "waiting" placeholders. So a caller
 *     watching the softphone saw nothing at all until their entire sentence
 *     appeared at once — accurate, but "very late". The live strip is asserted
 *     because of exactly that.
 *
 *  2. Real commit latency. The local VAD decides "speech stopped" from spectral
 *     energy against an adaptive noise floor, so in a crowded room the noise
 *     floor rises, the silence detector never fires, and every turn waited on it
 *     even after the engine had already emitted <end>/<fin>. That added seconds.
 *     Both the clean and the 0 dB case are asserted, because the whole point is
 *     that a loud room must not change the number.
 *
 * Fixtures are synthesised through the deployed worker's TTS proxy (no local
 * key needed) and given a long silent tail: a clip that never goes quiet never
 * lets a turn close, so the commit assertion would measure nothing.
 *
 * Costs a little Soniox STT + one short TTS clip. Free of Groq.
 */
import fs from 'fs';
import { chromium } from 'playwright-core';

const site = process.env.SITE_URL || 'https://legal-voice-agent.adribmahmud.workers.dev/';
const UTTERANCE = 'আমার জমি নিয়ে প্রতিবেশীর সাথে বিরোধ হচ্ছে, আমি খতিয়ান নিয়ে সাহায্য চাই।';
const SILENCE_TAIL_S = 8;

// Budgets. Interim is what the caller perceives, so it is tight; commit is
// bounded by the engine endpoint plus a short grace, and must not drift with noise.
const INTERIM_BUDGET_MS = 600;
const COMMIT_BUDGET_MS = 2200;

const results = {};
const check = (k, v, extra = '') => {
  results[k] = v;
  console.log(`${v ? 'PASS' : 'FAIL'} ${k}${extra ? ' :: ' + extra : ''}`);
};

function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function synth() {
  const pcm = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`${site.replace(/^http/, 'ws').replace(/\/$/, '')}/v1/tts`);
    ws.binaryType = 'arraybuffer';
    const chunks = [];
    const t = setTimeout(() => reject(new Error('tts timeout')), 30000);
    ws.onopen = () => { ws.send(JSON.stringify({ type: 'Speak', text: UTTERANCE })); ws.send(JSON.stringify({ type: 'Flush' })); };
    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) { if (e.data.byteLength) chunks.push(Buffer.from(e.data)); return; }
      try {
        const m = JSON.parse(e.data.toString());
        if (m.type === 'Flushed') { clearTimeout(t); ws.close(); resolve(Buffer.concat(chunks)); }
        if (m.type === 'error') reject(new Error(m.message));
      } catch {}
    };
    ws.onerror = reject;
  });
  return Buffer.concat([pcm, Buffer.alloc(24000 * SILENCE_TAIL_S * 2)]);
}

/** Crowd-like broadband + rumble at 0 dB SNR. */
function noisy(speech) {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const n = speech.length / 2;
  const out = Buffer.alloc(speech.length);
  const sp = new Int16Array(n);
  for (let i = 0; i < n; i++) sp[i] = speech.readInt16LE(i * 2);
  const nz = new Float64Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) { const w = rnd(); lp = 0.85 * lp + 0.15 * w; nz[i] = 0.6 * w + 0.8 * lp; }
  const rms = (a) => { let s = 0; for (const v of a) s += v * v; return Math.sqrt(s / a.length); };
  const k = rms(sp) / rms(nz);
  for (let i = 0; i < n; i++) out.writeInt16LE(Math.max(-32768, Math.min(32767, sp[i] + k * nz[i])), i * 2);
  return out;
}

const speech = await synth();
const cleanPath = '/tmp/opencode/_lat_clean.wav';
const noisyPath = '/tmp/opencode/_lat_noisy.wav';
fs.writeFileSync(cleanPath, wav(speech));
fs.writeFileSync(noisyPath, wav(noisy(speech)));
console.log(`fixture: ${(speech.length / 48000).toFixed(1)}s speech+silence\n`);

async function run(label, path) {
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${path}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const ctx = await browser.newContext({ permissions: ['microphone'] });
  const page = await ctx.newPage();

  let firstToken = 0, endTok = 0, llm = 0, interim = 0;
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/v1/stt')) return;
    ws.on('framereceived', (f) => {
      if (typeof f.payload !== 'string') return;
      let j; try { j = JSON.parse(f.payload); } catch { return; }
      for (const tk of j.tokens || []) {
        if (tk.text === '<end>' || tk.text === '<fin>') { if (!endTok) endTok = Date.now(); continue; }
        if ((tk.text || '').trim() && !firstToken) firstToken = Date.now();
      }
    });
  });
  page.on('request', (r) => { if (r.url().includes('/api/llm') && !llm) llm = Date.now(); });
  await page.exposeFunction('__interimSeen', () => { if (!interim) interim = Date.now(); });
  await page.addInitScript(() => {
    setInterval(() => {
      const el = document.querySelector('[data-testid="live-transcript-strip"] p');
      if (el && el.innerText.trim() && el.innerText.trim() !== 'শুনছি…') window.__interimSeen?.();
    }, 100);
  });

  await page.goto(site, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /কল করুন/ }).first().click();
  await page.waitForTimeout(14000);
  await page.waitForFunction(() => Boolean(window.__voiceAgent), null, { timeout: 30000 });
  await page.evaluate(() => window.__voiceAgent.sendUserMessage('১'));
  await page.waitForTimeout(42000);
  await browser.close();

  check(`${label} produced speech tokens`, firstToken > 0);
  const interimLag = interim && firstToken ? interim - firstToken : null;
  check(
    `${label} live interim visible within ${INTERIM_BUDGET_MS}ms`,
    interimLag !== null && interimLag <= INTERIM_BUDGET_MS,
    interimLag !== null ? `${interimLag}ms` : 'never shown',
  );
  const commitLag = endTok && llm ? llm - endTok : null;
  check(
    `${label} commits within ${COMMIT_BUDGET_MS}ms of the engine endpoint`,
    commitLag !== null && commitLag <= COMMIT_BUDGET_MS,
    commitLag !== null ? `${commitLag}ms` : 'no commit',
  );
  check(`${label} no page errors`, errs.length === 0, errs.join(' | '));
  return { interimLag, commitLag };
}

const a = await run('clean', cleanPath);
const b = await run('crowded 0dB', noisyPath);

if (a.commitLag !== null && b.commitLag !== null) {
  const skew = Math.abs(a.commitLag - b.commitLag);
  check(
    `a loud room does not change commit latency (skew ${skew}ms)`,
    skew <= 700,
    `clean ${a.commitLag}ms vs crowded ${b.commitLag}ms`,
  );
}

const failed = Object.entries(results).filter(([, v]) => !v);
console.log(failed.length ? `\n${failed.length} FAILED: ${failed.map(([k]) => k).join(', ')}` : '\nTRANSCRIPTION IS VISIBLE AND FAST');
process.exit(failed.length ? 1 : 0);
