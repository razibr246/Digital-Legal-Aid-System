import WebSocket from "ws";
import { readFileSync } from "fs";

const KEY = process.env.SONIOX_API_KEY;
const lines = ["হ্যালো, এটি একটি পরীক্ষা।", "This is a direct Soniox test."];

const ws = new WebSocket("wss://tts-rt.soniox.com/tts-websocket");
let gotAudio = false;
let bytes = 0;
const started = Date.now();

ws.on("open", () => {
  console.log("CONNECTED to Soniox directly");
  ws.send(JSON.stringify({
    api_key: KEY,
    stream_id: "direct-test-sep23",
    model: "tts-rt-v2",
    language: "bn",
    voice: "Daniel",
    audio_format: "pcm_s16le",
    sample_rate: 24000,
  }));
  for (const l of lines) ws.send(JSON.stringify({ text: l, text_end: false, stream_id: "direct-test-sep23" }));
  ws.send(JSON.stringify({ text: "", text_end: true, stream_id: "direct-test-sep23" }));
});

ws.on("message", (d) => {
  let m;
  try { m = JSON.parse(d.toString()); } catch { return; }
  if (m.error_code !== undefined) {
    console.log("UPSTREAM ERROR:", m.error_type, m.error_message, "code", m.error_code);
    console.log("full:", JSON.stringify(m));
    process.exit(3);
  }
  if (typeof m.audio === "string") {
    gotAudio = true;
    bytes += Buffer.from(m.audio, "base64").length;
  }
  if (m.terminated) {
    console.log(`TERMINATED after ${Date.now() - started}ms  audio=${gotAudio} bytes=${bytes}`);
    ws.close();
    process.exit(gotAudio && bytes > 0 ? 0 : 2);
  }
  if (m.audio_end) console.log("(audio_end)");
});

ws.on("error", (e) => { console.log("WS error:", e.message); process.exit(1); });
setTimeout(() => {
  console.log(`TIMEOUT 60s  audio=${gotAudio} bytes=${bytes}`);
  ws.close();
  process.exit(gotAudio ? 0 : 4);
}, 60000);