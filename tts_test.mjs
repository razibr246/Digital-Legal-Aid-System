import WebSocket from "ws";

const ws = new WebSocket("ws://127.0.0.1:8200/v1/tts", {
  headers: { origin: "http://localhost:3000" },
});

let gotAudio = false;
let bytes = 0;
const started = Date.now();

ws.on("open", () => {
  console.log("local proxy connected");
  ws.send(JSON.stringify({ type: "Speak", text: "হ্যালো, এটি একটি পরীক্ষা।", textId: "t1" }));
  ws.send(JSON.stringify({ type: "Flush", textId: "t1" }));
});

ws.on("message", (data, isBinary) => {
  if (isBinary) {
    gotAudio = true;
    bytes += data.length;
    return;
  }
  try {
    const m = JSON.parse(data.toString());
    if (m.type === "error") {
      console.log("ERROR from proxy:", m.message, `audio=${gotAudio} bytes=${bytes}`);
      ws.close();
      process.exit(3);
    }
    if (m.type === "Flushed") {
      console.log(`Flushed after ${Date.now() - started}ms, audio=${gotAudio} bytes=${bytes}`);
      ws.close();
      process.exit(gotAudio && bytes > 0 ? 0 : 2);
    }
  } catch {}
});

ws.on("error", (e) => {
  console.log("WS error:", e.message);
  process.exit(1);
});

setTimeout(() => {
  console.log("TIMEOUT waiting for audio/Flushed");
  console.log(`gotAudio=${gotAudio} bytes=${bytes}`);
  ws.close();
  process.exit(gotAudio ? 0 : 4);
}, 20000);