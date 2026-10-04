# speech/

Pre-recorded voice prompts, generated with Soniox TTS through the deployed worker's
`/v1/tts` proxy (no local API key needed).

## Regenerate

```bash
node scripts/generate_audio_prompts.mjs <name-filter>
```

`<name-filter>` is a substring match on the prompt name — `greeting_language`,
`ivr_menu`, `intake_complete`, and so on. With no filter it regenerates every prompt.

## The clips the app actually plays

| File | Duration | Notes |
|---|---|---|
| `greeting_language.wav` | 10.6s | The whole opening: welcome + recording notice + the language question. One clip, played once. |

## Rules that keep the audio and the code honest

- The text in `scripts/generate_audio_prompts.mjs` is the source of truth, and
  `MERGED_GREETING_PROMPT` in `lib/voice-sdk/direct/direct_session.ts` must match it
  **character for character**. Editing the string does **not** change what callers hear
  — the audio is pre-recorded — so a text-only edit is a lie to whoever debugs it next.
  Re-synthesize, or the code and the recording disagree.
- Only static prompts are pre-recorded. Anything embedding a live value (a remaining
  attempts count, a docket number) stays on TTS, because a fixed clip would drop that
  value on every replay.
- The opening is deliberately **one** clip. It was once `greeting.wav` plus
  `language_select.wav`, which totalled 19.6s before a caller could act on anything.
- `ivr_menu.wav` is separate and played exactly once, after the language is known. It
  must never be merged into the opening: the language keys and the menu keys are both
  1/2/3, so one breath asking for a language *and* announcing the menu is genuinely
  ambiguous.
