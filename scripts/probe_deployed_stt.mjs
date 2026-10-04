import WebSocket from "ws";
import { readFileSync } from "fs";

const realKey = readFileSync(".env.local", "utf8").match(/SONIOX_API_KEY=(.*)/)[1].trim();
const text = "আমি ঢাকা থেকে বলছি, আমার নাম রহিম। জামিন পাওয়ার উপায় কী?";

const tts = new WebSocket("wss://tts-rt.soniox.com/tts-websocket");
const audioChunks = [];
tts.on("open", () => {
  tts.send(JSON.stringify({ api_key: realKey, stream_id: "p3", model: "tts-rt-v2", language: "bn", voice: "Daniel", audio_format: "pcm_s16le", sample_rate: 16000 }));
  tts.send(JSON.stringify({ text, text_end: false, stream_id: "p3" }));
  tts.send(JSON.stringify({ stream_id: "p3", text: "", text_end: true }));
});
tts.on("message", (d) => {
  let m; try { m = JSON.parse(d.toString()); } catch { return; }
  if (typeof m.audio === "string") audioChunks.push(Buffer.from(m.audio, "base64"));
  if (m.terminated || m.audio_end) tts.close();
});
tts.on("close", () => startStt());

let started = false;
function startStt() {
  if (started || !audioChunks.length) return;
  started = true;
  const pcm = Buffer.concat(audioChunks);
  const stt = new WebSocket("wss://legal-voice-agent.adribmahmud.workers.dev/v1/stt?language=bn");
  stt.binaryType = "arraybuffer";
  let n = 0; let committed = "";
  stt.on("open", () => {
    let off = 0; const chunk = 12800;
    const iv = setInterval(() => {
      if (off >= pcm.length) { clearInterval(iv); console.log("AUDIO DONE; sending finalize"); stt.send(JSON.stringify({ type: "finalize" })); return; }
      stt.send(pcm.subarray(off, Math.min(off + chunk, pcm.length)));
      off += chunk;
    }, 200);
  });
  stt.on("message", (d, bin) => {
    if (bin) return;
    let m; try { m = JSON.parse(d.toString()); } catch { return; }
    if (m.type === "dbg") { console.log("DBG", m.str, m.ctor, m.bytes, m.head); return; }
    if (m.error_code !== undefined) { console.log("ERR", JSON.stringify(m)); process.exit(3); }
    n++;
    const toks = m.tokens || [];
    console.log(`resp#${n} tokens: ${toks.map(t=>(t.is_final?"[F]":"-")+t.text).join(" ")||"(none)"} proc=${m.total_audio_proc_ms}`);
    for (const t of toks) {
      if (t.is_final && t.text !== "<end>" && t.text !== "<fin>") committed += t.text;
      if (t.text === "<end>" || t.text === "<fin>") console.log(`>> TURN END committed="${committed.trim()}"`);
    }
  });
  stt.on("close", () => console.log("closed — FINAL:", committed.trim()));
  // send keepalive like the real client does during idle
  let ka = setInterval(() => stt.readyState === 1 && stt.send(JSON.stringify({ type: "keepalive" })), 4000);
  stt.on('close', () => clearInterval(ka));
  setTimeout(() => process.exit(0), 60000);
}
