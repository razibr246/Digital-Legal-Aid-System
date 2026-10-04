/**
 * Generates the pre-recorded clips for the simulation story.
 *
 * Separate from `generate_audio_prompts.mjs` on purpose: that file owns the live 16699
 * prompts, and the simulation needs BOTH sides of a conversation (a blind caller speaks,
 * so his voice IS the channel) plus narration for the stages that happen off-call. Mixing
 * the two sets would make the filter argument ambiguous and risk regenerating a live
 * prompt.
 *
 * Borrows the deployed worker's /v1/tts proxy, so no local SONIOX_API_KEY is needed.
 * THIS SPENDS SONIOX CREDITS — one synthesis per clip, once. After that the simulation
 * replays local files and costs nothing, which is what makes it safe to run in front of
 * judges repeatedly.
 *
 *   node scripts/generate_sim_audio.mjs            # all clips
 *   node scripts/generate_sim_audio.mjs moyuri     # only the Moyuri/Ripon story
 */
import fs from "fs";
import path from "path";
import { WebSocket } from "ws";

const TTS_URL = "wss://legal-voice-agent.adribmahmud.workers.dev/v1/tts";
const outDir = path.join(process.cwd(), "public", "audio", "sim");

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

async function synthesizeToFile(text, outPath, voice) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(TTS_URL);
    ws.binaryType = "arraybuffer";
    const chunks = [];
    let settled = false;

    const save = () => {
      if (!chunks.length) return false;
      const wav = createWavBuffer(chunks);
      fs.writeFileSync(outPath, wav);
      const seconds = (wav.length - 44) / 48000;
      console.log(`   saved ${path.basename(outPath)} — ${seconds.toFixed(1)}s, ${(wav.length / 1024).toFixed(0)}KB`);
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
      if (save()) resolve();
      else reject(new Error(`timeout: ${outPath}`));
    }, 45000);

    ws.onopen = () => {
      // The voice is part of the cast. Omitting it means the agent's default, which
      // makes every speaker sound like the agent.
      ws.send(JSON.stringify({ type: "Speak", text, ...(voice ? { voice } : {}) }));
      ws.send(JSON.stringify({ type: "Flush" }));
    };
    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer || Buffer.isBuffer(event.data)) {
        const chunk = Buffer.from(event.data);
        if (chunk.length) chunks.push(chunk);
        return;
      }
      try {
        const msg = JSON.parse(event.data.toString());
        if (msg.type === "Flushed" || msg.type === "Finished" || msg.done) finish();
      } catch {
        /* control frames we do not need */
      }
    };
    ws.onerror = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    };
  });
}

/**
 * Loads the scenario definitions, so the clip plan comes from the same source the runtime
 * plays back from.
 *
 * jiti is already a devDependency (every `test:*` script uses it), so this needs no new
 * toolchain and no build step before the generator can run.
 */
async function loadScenarios() {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  return jiti.import("../lib/demo/simulations.ts");
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  // The clip list is DERIVED from the scenarios, not copied alongside them.
  //
  // It used to be a hand-maintained array of duplicated Bangla text, and it drifted: the
  // four secondary scenarios asked for `nabila_greeting.wav` while this file wrote
  // `nabila_01_greeting.wav`, so every one of those clips 404'd and three of the five
  // personas played back silent. A second copy of the script is a second chance to be
  // wrong and nothing was checking. Reading the plan off the turns means a clip can no
  // longer exist under a filename no turn asks for.
  const { audioClipPlan } = await loadScenarios();

  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const filters = args.filter((a) => !a.startsWith("--"));
  let selected = audioClipPlan();
  if (filters.length) {
    selected = selected.filter((c) => filters.some((f) => c.file.includes(f) || c.simId.includes(f)));
  }
  if (!selected.length) {
    console.error(`No clips matched "${filters.join(", ")}". The plan has:`);
    for (const c of audioClipPlan()) console.error(`   ${c.file}  [${c.voice}]  (${c.simId})`);
    process.exit(1);
  }

  console.log(`${selected.length} clip(s) from the scenario plan, via the deployed TTS proxy.\n`);
  for (const clip of selected) {
    const target = path.join(outDir, clip.file);
    // --force regenerates even when the file exists, which is what a voice change needs:
    // the filename is unchanged, so existence is no evidence the voice is still right.
    if (!force && fs.existsSync(target) && fs.statSync(target).size > 1000) {
      console.log(`   skip ${clip.file} (already present)`);
      continue;
    }
    try {
      await synthesizeToFile(clip.text, target, clip.voice);
    } catch (err) {
      console.error(`   FAILED ${clip.file} (${clip.voice}): ${err?.message ?? err}`);
      process.exitCode = 1;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // Every clip a turn references must exist on disk. A missing file degrades to a caption
  // at runtime — which is exactly how three of five personas ended up silently passing —
  // so the drift is caught here, at generation time, instead of in a demo.
  const missing = audioClipPlan().filter((c) => {
    const f = path.join(outDir, c.file);
    return !fs.existsSync(f) || fs.statSync(f).size <= 1000;
  });
  if (missing.length) {
    console.error(`\n${missing.length} clip(s) referenced by a turn but NOT on disk:`);
    for (const c of missing) console.error(`   ${c.file}  [${c.voice}]  (${c.simId})`);
    process.exitCode = 1;
  } else {
    console.log("\nEvery clip referenced by a turn is on disk.");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
