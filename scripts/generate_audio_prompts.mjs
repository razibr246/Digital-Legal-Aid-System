import fs from 'fs';
import path from 'path';

// Load API key from environment — set SONIOX_API_KEY before running
// OR this script auto-connects to the deployed worker at /v1/tts (no key needed)
const apiKey = process.env.SONIOX_API_KEY || "";

function createWavBuffer(pcmBuffers, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const totalPcmLength = pcmBuffers.reduce((sum, b) => sum + b.length, 0);
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + totalPcmLength, 4);
  header.write("WAVE", 8);

  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  header.writeUInt16LE(bitsPerSample, 34);

  header.write("data", 36);
  header.writeUInt32LE(totalPcmLength, 40);

  return Buffer.concat([header, ...pcmBuffers]);
}

async function synthesizeToFile(text, outPath) {
  console.log(`Synthesizing: "${text}" -> ${outPath}`);
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("wss://legal-voice-agent.adribmahmud.workers.dev/v1/tts");
    ws.binaryType = "arraybuffer";
    const pcmChunks = [];
    let settled = false;

    const save = () => {
      if (pcmChunks.length === 0) return false;
      const wav = createWavBuffer(pcmChunks);
      fs.writeFileSync(outPath, wav);
      console.log(`Saved ${outPath} (${wav.length} bytes, duration: ${(wav.length - 44) / 48000}s)`);
      return true;
    };

    const finish = () => {
      if (settled) return;
      if (!save()) return;
      settled = true;
      clearTimeout(timeout);
      ws.close();
      resolve();
    };

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.close();
      if (!save()) reject(new Error("Timeout synthesizing audio"));
    }, 30000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "Speak", text }));
      ws.send(JSON.stringify({ type: "Flush" }));
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer || Buffer.isBuffer(event.data)) {
        const chunk = Buffer.from(event.data);
        if (chunk.length > 0) pcmChunks.push(chunk);
        return;
      }
      try {
        const msg = JSON.parse(event.data.toString());
        if (msg.type === "Flushed") finish();
        if (msg.type === "error") {
          settled = true;
          clearTimeout(timeout);
          ws.close();
          reject(new Error(msg.message || "TTS synthesis failed"));
        }
      } catch {}
    };

    ws.onclose = () => {
      if (!settled) finish();
    };

    ws.onerror = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    };
  });
}

async function main() {
  const audioDir = path.join(process.cwd(), "public", "audio");
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

  const prompts = [
    {
      name: "inactivity_app_query.wav",
      text: "আপনি কি সরকারি আইনি সহায়তার জন্য কোনো আবেদন বা অভিযোগ নথিভুক্ত করতে চান? হ্যাঁ অথবা না বলুন, অথবা আপনার অন্য কোনো প্রশ্ন থাকলে করতে পারেন।"
    },
    {
      name: "inactivity_no_ack.wav",
      text: "ঠিক আছে, আমি শুনছি। আপনার যেকোনো আইনি প্রশ্ন বা পরামর্শের প্রয়োজন হলে নির্দ্বিধায় বলুন, আমি সাহায্য করছি।"
    },
    {
      name: "inactivity_hangup.wav",
      text: "দীর্ঘক্ষণ কোনো সাড়া না পাওয়ায় কলটি শেষ করা হচ্ছে। যেকোনো আইনি তথ্যের জন্য ১৬৬৯৯ নম্বরে আবার কল করুন। বাংলাদেশ লিগ্যাল এইডের সাথে থাকার জন্য ধন্যবাদ।"
    },
    {
      name: "intake_complete.wav",
      text: "আপনার আইনি অভিযোগ ও তথ্যাবলী সফলভাবে নথিভুক্ত করা হয়েছে। আপনার ডকেট নম্বরটি কথোপকথনের রেকর্ডে সংরক্ষিত আছে। জাতীয় আইনগত সহায়তা প্রদান সংস্থা থেকে আমাদের প্যানেল আইনজীবী দ্রুত আপনার সাথে যোগাযোগ করবেন। আপনাকে ধন্যবাদ। আপনার কলটি এখানেই শেষ করা হচ্ছে।"
    },
    {
      name: "greeting_language.wav",
      text: "আইনি সহায়তায় স্বাগতম। আপনার কথোপকথনটি রেকর্ড হচ্ছে। ভাষা: বাংলা ১, মারমা ২, চাকমা ৩ — চাপুন, অথবা মুখে বলুন।"
    },,,
    {
      name: "ivr_menu.wav",
      text: "সাধারণ তথ্য জানতে ১ চাপুন, কোনো সমস্যা বা অভিযোগ জানাতে ২ চাপুন, আর আপনার নথির অবস্থা জানতে কেস ট্র্যাকিংয়ের জন্য ৩ চাপুন।"
    },
    {
      name: "option3_tracking.wav",
      text: "কেস ট্র্যাকিংয়ের জন্য আপনার চার সংখ্যার ভয়েস লগইন পিনটি ডায়ালপ্যাডে লিখুন। প্রতিটি সংখ্যার পর কোনো কাজ করতে হবে না।"
    },
    {
      name: "case_pin_locked.wav",
      text: "তিনবার ভুল পিন দেওয়া হয়েছে। নিরাপত্তার জন্য কলটি এখানেই শেষ করা হচ্ছে। সঠিক পিন সম্পর্কে জানতে ভয়েস ইনটেকের সময় যে বার্তা পেয়েছিলেন তা দেখুন, অথবা ১৬৬৯৯ এ কল করুন।"
    },
  ];

  // Optional filter: `node scripts/generate_audio_prompts.mjs language` regenerates only matching prompts.
  const filter = process.argv[2];
  const selected = filter
    ? prompts.filter((item) => item.name.includes(filter))
    : prompts;
  if (selected.length === 0) {
    console.error(`No prompts matched filter "${filter}"`);
    process.exit(1);
  }

  for (const item of selected) {
    const targetFile = path.join(audioDir, item.name);
    await synthesizeToFile(item.text, targetFile);
    await new Promise(r => setTimeout(r, 600));
  }

  console.log("All audio prompts generated successfully!");
}

main().catch(err => {
  console.error("Error generating audio:", err);
  process.exit(1);
});
