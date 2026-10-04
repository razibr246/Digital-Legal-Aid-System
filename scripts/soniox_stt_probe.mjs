import WebSocket from "ws";
import { readFileSync as _rf } from "fs"; const realKey = _rf(".env.local","utf8").match(/SONIOX_API_KEY=(.*)/)[1].trim();


// use real key from env instead


// --- TTS: synthesize PCM 16k for STT probe ---
const text = "আমি ঢাকা থেকে বলছি, আমার নাম রহিম। আমাকে বিনা কারণে পুলিশ গ্রেপ্তার করেছে, জামিন পাওয়ার উপায় কী?";
const tts = new WebSocket("wss://tts-rt.soniox.com/tts-websocket");
const audioChunks = [];
tts.on("open", () => {
  tts.send(JSON.stringify({
    api_key: realKey, stream_id: "probe", model: "tts-rt-v2",
    language: "bn", voice: "Daniel", audio_format: "pcm_s16le", sample_rate: 16000,
  }));
  tts.send(JSON.stringify({ text, text_end: false, stream_id: "probe" }));
  tts.send(JSON.stringify({ stream_id: "probe", text: "", text_end: true }));
});
tts.on("message", (d) => {
  let m; try { m = JSON.parse(d.toString()); } catch { return; }
  if (typeof m.audio === "string") audioChunks.push(Buffer.from(m.audio, "base64"));
  if (m.terminated || m.audio_end) {
    tts.close();
    startStt();
  }
});
tts.on("error", (e) => console.error("TTS err", e.message));
tts.on("close", () => startStt());

let started = false;
function startStt() {
  if (started || audioChunks.length === 0) return;
  started = true;
  const pcm = Buffer.concat(audioChunks);
  console.log(`TTS produced ${pcm.length} bytes of 16k PCM`);

  const stt = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket");
  let respCount = 0;
  stt.on("open", () => {
    stt.send(JSON.stringify({
      api_key: realKey,
      model: "stt-rt-v3",
      audio_format: "s16le",
      num_channels: 1,
      sample_rate: 16000,
      language_hints: ["bn"],
      enable_endpoint_detection: true,
      max_endpoint_delay_ms: 1500,
    }));
    // stream in 400ms chunks (12.8k bytes) with real-time-ish gap 20ms
    let off = 0;
    const chunk = 12800;
    const iv = setInterval(() => {
      if (off >= pcm.length) {
        clearInterval(iv);
        console.log("---- audio fully sent; sending finalize ----");
        stt.send(JSON.stringify({ type: "finalize" }));
        return;
      }
      stt.send(pcm.subarray(off, Math.min(off + chunk, pcm.length)));
      off += chunk;
    }, 200);
  });
  stt.on("message", (d, isBin) => {
    if (isBin) return console.log("BIN", d.length);
    let m; try { m = JSON.parse(d.toString()); } catch { return console.log("TXT", d.toString().slice(0, 100)); }
    respCount++;
    if (m.error_code !== undefined) return console.log("ERROR", JSON.stringify(m));
    const toks = (m.tokens || []).map(t => `${t.is_final ? "F" : "-"}:${m.tokens.map(x=>x.text).reduce((a,b)=>a+b,"")}`).slice(0,0);
    const seg = (m.tokens || []).map(t => (t.is_final ? "[F]" : "[-]") + t.text).join(" ");
    console.log(`resp#${respCount} audio_proc=${m.total_audio_proc_ms} finished=${m.finished || false} tokens: ${seg||"(none)"}`);
  });
  stt.on("close", (c) => console.log("STT closed", c));
  stt.on("error", (e) => console.log("STT err", e.message));
  setTimeout(() => process.exit(0), 30000);
}
