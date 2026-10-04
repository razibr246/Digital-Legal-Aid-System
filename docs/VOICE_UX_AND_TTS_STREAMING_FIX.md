# Bangladesh Legal Aid Portal: Illiterate Voice-First UX & Gapless TTS Architecture

This document describes the design, implementation, and technical optimizations for:
1. **The Official Bangladesh Legal Portal Landing Page Port** (`components/portal-view.tsx`, `app/portal.css`)
2. **Illiterate & Non-Technical Caller Voice-First UX**
3. **Softphone Telephony Modal & Accidental Drop Protection** (`components/softphone-modal.tsx`, `app/page.tsx`)
4. **WebAudio Sample-Accurate Gapless Streaming TTS Player** (`lib/voice-sdk/direct/direct_session.ts`)

---

## 1. Landing Page Port & Illiterate Voice-First UX

### Context
Many individuals seeking legal aid through the National Legal Aid Services Organization (NLASO - ১৬৬৯৯) in Bangladesh are illiterate or non-technical rural citizens who cannot read or write, or navigate complex online government forms.

### Design Principles:
1. **Voice-First Accessibility Callout**:
   - Right above the Supreme Court hero section, a prominent accessibility banner is placed:
     > *"🎙️ পড়তে বা লিখতে পারেন না? কোনো সমস্যা নেই! সরাসরি বাংলায় মুখে বলুন। কোনো ফর্ম পূরণ বা টাইপ করতে হবে না — বাটনে চাপ দিয়ে সরাসরি ১৬৬৯৯-এ কথা বলুন।"*
   - Badges: `🔊 মুখে বলুন` • `🆓 ১০০% বিনামূল্যে` • `♿ প্রতিবন্ধী ও বয়স্কদের জন্য সহজ`.
   - Large pulsing green button: `📞 ১৬৬৯৯-এ এখনই কথা বলুন (১০০% বিনামূল্যে)`.
2. **Single-Tap Voice Connection**:
   - Tapping any of the hotline buttons across the portal (Header Hotline, Emergency Hero CTA, Illiterate Callout Banner, or Persistent Floating Call Button) directly launches the Softphone Telephony window and starts the call immediately.
3. **Preserved Government Identity**:
   - Complete portal design with official government crest, date widget, breaking notice ticker, 24/7 emergency helplines (999, 109, 1098, 16699), mediation (ADR) appointments, panel lawyers directory for 64 districts, and 5-step online legal aid wizard.

---

## 2. Softphone Popup Modal & Accidental Call Drop Protection

### Architecture (`components/softphone-modal.tsx`, `app/page.tsx`):
- **Popup Dialog**:
  - The softphone is rendered in an accessible overlay modal with backdrop blur.
  - Large caller actions: Green `কল শুরু করুন` (Start Call), Red `কল শেষ করুন` (Hang Up), and Mute toggles.
  - Real-time animated audio waveform, Bengali call state indicators, and live call timer.
- **5-Step Case Intake Stepper Banner**:
  - Visual tracking for each step: `১. সমস্যা` ➔ `২. সুবিধা` ➔ `৩. লিঙ্গ` ➔ `৪. নাম` ➔ `৫. ঠিকানা` ➔ `নথিভুক্তি সম্পন্ন`.
- **Dual-Modal Dialpad**:
  - When in Option 2 intake mode, dialpad keys dynamically change their labels to help the user:
    - Step 2 (Disability): `1: হ্যাঁ (সুবিধা প্রযোজ্য)`, `2: না`
    - Step 3 (Gender): `1: পুরুষ`, `2: নারী`, `3: অন্যান্য`
- **Accidental Drop Prevention (Floating Mini Pill)**:
  - If a user accidentally closes or minimizes the modal while a call is active, **the audio session is not dropped**.
  - Instead, the modal minimizes into a sleek bottom floating pill:
    `🟢 ১৬৬৯৯ কল চলছে (০০:২৩) • উইন্ডো খুলুন ↗ • কেটে দিন ✕`
  - Clicking "উইন্ডো খুলুন" restores the full softphone modal instantly.

---

## 3. Mathematical Diagnosis & Fix of TTS Stammering/Stuttering

### The Root Cause:
When streaming TTS audio from Soniox, audio chunks arrive in small frames of ~1,024 samples (~42.6ms at 24kHz).
In the previous implementation of `StreamingAudioPlayer`:
1. `targetThreshold` switched dynamically:
   - When idle: `targetThreshold = 1200` samples.
   - Once playing: `targetThreshold = 2400` samples (100ms).
2. Because incoming chunks were ~1,024 samples, the player refused to schedule the incoming chunk until a second chunk arrived to cross the 2,400 sample threshold.
3. In the meantime, the previously scheduled 42ms chunk had already finished playing, leaving the WebAudio timeline idle (`activeSources.length === 0`).
4. When the next chunk was finally scheduled in `schedulePcm`:
   ```ts
   // BROKEN LOGIC:
   if (this.nextPlayTime > now + 0.005) {
     startTime = this.nextPlayTime;
   } else {
     startTime = now + INITIAL_LEAD_SEC; // Injected 45ms (0.045s) of silence!
   }
   ```
5. Because the audio had starved, `this.nextPlayTime <= now + 0.005`, so the player took the `else` branch and inserted **45ms of dead silence between every single incoming chunk**! This created the characteristic broken stammering/stuttering audio output.

### The Solution (`lib/voice-sdk/direct/direct_session.ts`):
1. **Initial Pre-buffering to Absorb Jitter**:
   - `INITIAL_BUFFER_SAMPLES = 2400` (100ms) is accumulated *only* when the player is idle, absorbing initial network jitter.
2. **Immediate Draining While Playing**:
   - `MIN_STREAM_CHUNK = 960` (40ms): Once playback begins, incoming chunks of >= 960 samples are scheduled immediately into the WebAudio timeline without waiting for 2,400 samples.
3. **Sample-Accurate Gapless Concatenation**:
   ```ts
   // FIXED LOGIC:
   const now = this.audioCtx.currentTime;
   const startTime = (this.nextPlayTime > now) ? this.nextPlayTime : now + 0.012;
   this.nextPlayTime = startTime + buffer.duration;
   ```
   WebAudio's hardware audio clock is sample-accurate. When `this.nextPlayTime > now`, setting `startTime = this.nextPlayTime` seamlessly stitches the new buffer to the very next audio sample of the preceding buffer with zero gap and zero latency.
4. **Natural Bengali Clause Chunking**:
   - Improved sentence and clause boundary chunking in `executeLlmTurn` so natural breath pauses align with punctuation (।, ?, !, এবং, কিন্তু) without fracturing phrases mid-sentence.
5. **Byte Boundary Safety**:
   - Handled odd `byteLength` on `Uint8Array` to `Int16Array` conversion using `slice(0, Math.floor(bytes.byteLength / 2) * 2)` to eliminate audio pops.

---

## 4. Verification & Testing

Both Playwright automated verification suites run against the live Cloudflare Workers deployment:
- `scripts/verify_landing_and_softphone.mjs`:
  - Validates government portal elements & Bengali brand identity.
  - Validates illiterate voice-first banner and 1-tap call button.
  - Validates modal popup, dialpad rendering, and minimize-to-pill behavior.
- `scripts/verify_dialpad_intake.mjs`:
  - Validates the 5-step intake chain end-to-end on live deployment.
  - Validates short-word detection ("হ্যাঁ", "নারী").
  - Validates live structured Case Docket and `DLAS-2025-XXXX` token generation.
  - Confirms zero stammering or broken chunking in TTS audio streaming.
