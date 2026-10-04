/**
 * Scripted scenario simulations.
 *
 * These are NOT a mock of the classifier. Every caller turn below is fed to the real
 * `classifySeverity` at run time, and the panel shows whatever it actually derived —
 * severity, matched tags, the legal basis, the case reference. That is the whole point:
 * if the recognition were hardcoded to "Moyuri", a judge could retype a line and watch it
 * fail. Here the text is the only input, so similar cases are recognised the same way
 * the live 16699 agent would recognise them.
 *
 * The agent's spoken lines are pre-recorded WAVs (`audio` below). Replaying a clip costs
 * nothing, so a simulation can be run any number of times in front of judges without
 * touching the STT or TTS budgets. A clip that is missing simply degrades to a captioned
 * line rather than failing the run.
 *
 * The workflow steps are REAL API calls — safe contact, mediation booking — so what the
 * panel shows is what the system did, not what a script says it did.
 */

import type { PersonaId } from "./personas";

/**
 * Who is speaking.
 *
 * `moyuri` exists because Moyuri speaks for herself inside her own safe window, which is
 * the one turn in the whole story that comes from the applicant rather than from her
 * proxy. Filing it under `caller` — which is Ripon — would have the transcript attribute
 * her account to her brother, and the brief's entire claim is that the two records stay
 * separate.
 */
export type Speaker = "caller" | "agent" | "narrator" | "moyuri";

/**
 * A named stage of the story.
 *
 * Phases are what separate "a phone call that ended" from "what the system did next". The
 * stages a voice agent cannot show by itself — an officer reading a summary, a paralegal
 * inside a fifteen-minute window, an identity being registered, an agreement being
 * drafted — each get their own phase and their own narration clip.
 */
export interface SimulationPhase {
  id: string;
  n: number;
  titleBn: string;
  /** One line: what this stage is. */
  caption: string;
  narration: string;
  turns: SimulationTurn[];
}

export interface SimulationTurn {
  speaker: Speaker;
  /** Bangla. For `caller` this is what STT would return; for `agent` the spoken line. */
  text: string;
  /**
   * Agent lines only. A pre-recorded clip, relative to /audio. Optional on purpose:
   * a missing clip must degrade to a caption, never abort the simulation.
   */
  audio?: string;
  /** The intake step this turn belongs to, shown in the state readout. */
  step?: string;
  /**
   * Overrides the voice this turn is recorded in, for a turn that must not follow the
   * speaker default. Almost always unnecessary — `resolveVoice` handles the cast. It
   * exists for a line spoken by a specific person inside a scenario whose caller is
   * somebody else, which is exactly Moyuri's account in the Ripon proxy call.
   */
  voice?: string;
  /**
   * What this turn is meant to prove. Rendered in the proof panel so a judge can follow
   * the argument rather than just watch a transcript scroll.
   */
  proves: string;
}

export interface Simulation {
  id: string;
  personaId: PersonaId;
  title: string;
  /** The one-line claim this scenario makes. */
  premise: string;
  /** What the system ends up doing, stated up front so the demo has an arc. */
  outcome: string;
  /**
   * The story in stages. A scenario may be phases-only, flat-turns-only, or both — the
   * runtime flattens whichever is present, so adding phases never means rewriting the
   * turn list.
   */
  phases?: SimulationPhase[];
  turns: SimulationTurn[];
  /**
   * The TTS voice for THIS scenario's caller, and the only per-scenario casting input.
   *
   * Soniox voices are language-independent — one voice keeps its identity across every
   * language it speaks — so `voice` is what turns a speaker into a distinguishable person
   * rather than another reading of the same one.
   *
   * It is per-scenario because the caller is not one person. Three of the four secondary
   * scenarios have a female caller; a single shared `caller` voice had Nabila and Nuching
   * being read by the male proxy voice, which misrepresents two of the five personas in
   * exactly the way the brief is asking the system not to.
   */
  callerVoice?: string;
  /** Client-safe configuration the run needs (no secrets). */
  config?: {
    /**
     * Renders the safe-window panel: the fixed 15 minutes she can be reached, whether it
     * is open right now, and the DLAO reminder the system defers into it.
     */
    safeWindow?: { caseId: string; docketId: string };
    /** Renders the safe-contact / mediation flow after the call. */
    bookMediation?: { caseId: string; docketId: string; venue: string; mediatorName: string };
  };
}

export const VOICES = {
  /**
   * The 16699 agent. Deliberately the SAME voice the live agent uses, so the recording
   * and a real call are recognisably the same institution. "Clear female, natural Indian
   * accent, warm pacing, composed."
   */
  agent: "Priya",

  /**
   * The narrator is the institution reading its own record, not a person in the room.
   * "Deep, focused, crisp articulation, measured pacing, authoritative." Keeping it a
   * different register from the agent is what stops a narration beat reading as a reply.
   */
  narrator: "Adrian",

  /**
   * Moyuri. "Clear, patient, gentle and reassuring" — she speaks ONCE, inside her fifteen
   * minutes, so the voice has to carry that on its own. Measured at the highest HF energy
   * in the set, which is what makes it read as a different woman from the agent.
   */
  moyuri: "Iris",

  /** Ripon: deep, friendly, Indian accent — a man reporting calmly for his sister. */
  ripon: "Karan",
  /** Nabila: young, warm. She is frightened, and the voice should not be flat. */
  nabila: "Nina",
  /** Nuching: quiet, still, inward. She is reserved, speaks Marma, and cannot read. */
  nuching: "Mina",
  /** Malek: natural, conversational, Indian male — a shopkeeper who has waited 7 months. */
  malek: "Dev",
} as const;

/**
 * The Moyuri / Ripon story, in seven phases.
 *
 * `phases` is what makes this a story rather than a transcript. A flat turn list reads as
 * a phone call that ends; the brief's claim is about what happens AFTER the call — the
 * officer flags it, the fifteen-minute window governs contact, a paralegal goes out, the
 * identity is registered, mediation is booked, and the AI documents the settlement. Each of
 * those is a stage a voice agent cannot demonstrate by itself, so each gets its own phase
 * and its own narration clip.
 *
 * `caller: true` marks the lines that came from Ripon's mouth, and those carry a clip
 * too. He is blind, so his voice IS the channel — a demo of his case with no audible caller
 * would be a demo of a different system.
 */
const MOYURI_RIPON: Simulation = {
  id: "moyuri-ripon",
  personaId: "moyuri",
  title: "মোয়ূরীর হয়ে ভাই রিপনের কল — প্রতিনিধির মাধ্যমে জরুরি আবেদন",
  premise:
    "এক নারীকে নিরাপদে বাঁচাতে হলে তার কথা কেউ পেল না — কারণ স্বামী ফোন দেখেন। তাই ভাই কল করেছেন। প্রমাণ করতে হবে যে প্রতিনিধির কথা আর আবেদনকারীর নিজের কথা, নথিতে আলাদা থাকে।",
  outcome:
    "জরুরি শ্রেণিতে ফাইল, কিন্তু স্বামীর নম্বরে একটিও বার্তা যায় না; নিরাপদ সময়ে পরালেগাল পৌঁছান, পরিচয় নিবন্ধন হয়, মধ্যস্থতা নির্ধারিত হয় এবং সালিশ সনদের জন্য তিন পক্ষের স্বাক্ষর লাগে।",
  // Ripon, the brother. A deep male voice, because a blind man reporting a domestic-violence
  // case for his sister in the agent's female register made the one scenario the brief
  // says must be handled carefully sound like it was being read to him.
  callerVoice: VOICES.ripon,
  phases: [
    {
      id: "call",
      n: 1,
      titleBn: "১৬৬৯৯ এ কল",
      caption: "রিপন ভাই, মোয়ূরীর হয়ে",
      narration: "একজন প্রতিনিধি সিস্টেমে ফোন করেছেন — আবেদনকারী নিজে নয়।",
      turns: [
        { speaker: "agent", step: "greeting", text: "জাতীয় আইনগত সহায়তা প্রদান সংস্থা, ডিজিটাল লিগ্যাল এইড সিস্টেম। আপনার কথা রেকর্ড করা হচ্ছে। আপনি বাংলায় কথা বলবেন, নাকি মারমা বা চাকমায়?", audio: "moyuri_01_greeting.wav", proves: "এক ক্লিপেই ভাষা ও রেকর্ডিং-অবিজ্ঞপ্তা — রিপনের কথা ধরা পড়ে।" },
        { speaker: "caller", text: "বাংলায় কথা বলব।", audio: "moyuri_02_caller_lang.wav", step: "language", proves: "ভাষা নির্বাচিত; এখন সরাসরি সমস্যা বলার সুযোগ।" },
        { speaker: "agent", step: "ivr_menu", text: "আপনার জন্য কোন বিষয়ে সহায়তা চান? এক নম্বর সাধারণ তথ্য ও নিয়মাবলী, দুই নম্বর আপনার সমস্যা ও আবেদন, তিন নম্বর মামলা ট্র্যাকিং।", audio: "moyuri_03_menu.wav", proves: "মূল মেনু একবার, ভাষার প্রশ্নের সঙ্গে মিশিয়ে দেওয়া হয়নি।" },
        { speaker: "caller", text: "দুই।", audio: "moyuri_04_caller_route.wav", step: "root_menu", proves: "আবেদনের পথে প্রবেশ।" },
        { speaker: "agent", step: "problem", text: "আপনার সমস্যাটি বলুন, আমি শুনছি।", audio: "moyuri_05_problem_prompt.wav", proves: "সমস্যা বলার প্রশ্ন — এখানেই শ্রেণিবিভাগ হবে।" },
        {
          speaker: "caller",
          step: "problem",
          text: "আমার বোন মোয়ূরীর স্বামী তাকে নিয়মিত মারধর করেন, চড় মারেন, আর বাড়ি থেকে বের করে দিয়েছেন। মোয়ূরী এখন আমার কাছে আছে। আমি তার ভাই রিপন — আমি তার হয়ে ফোন করেছি, কারণ বাড়িতে স্বামী ফোন দেখেন, মোয়ূরী নিজে ফোন করতে পারে না। তার জাতীয় পরিচয়পত্রও নেই, কাগজপত্র স্বামীর কাছে। আমি চাই সে নিরাপদে থাকুক এবং আইনি সুরক্ষা পাক।",
          audio: "moyuri_06_problem.wav",
          proves: "একটি বাক্যেই চারটি সংকেত: পারিবারিক সহিংসতা, নিয়ন্ত্রিত যোগাযোগ, অনুপলব্ধ পরিচয়, এবং প্রতিনিধিত্ব।",
        },
        {
          speaker: "agent",
          step: "acknowledgement",
          text: "আপনার বোনের জন্য জরুরি সহায়তা নিশ্চিত করা হয়েছে। তবে একটি কথা পরিষ্কার করে নিই। মোয়ূরীর নিজের কথা এখনো নথিভুক্ত হয়নি। আপনি তার হয়ে আবেদন করতে পারেন, কিন্তু যেটুকু তিনি নিজে নিশ্চিত করেননি, সেটুকু আমরা তার কথা হিসেবে লিখব না।",
          audio: "moyuri_07_ack.wav",
          proves: "এটিই মূল প্রমাণ: দ্বিতীয়-হাত তথ্য আর আবেদনকারীর নিজের বক্তব্য নথিতে আলাদা থাকে।",
        },
        { speaker: "agent", step: "closing", text: "আবেদন নম্বর এবং পরবর্তী ধাপ এই কথায় আবার বলা হবে। মোয়ূরী নিরাপদ সময়ে আমাদের কল পেলে তার নিজের কথা যুক্ত হবে।", audio: "moyuri_08_closing.wav", proves: "কাজ শেষ হয়নি — মোয়ূরীর নিজের বক্তব্য এখনো অপেক্ষমাণ।" },
      ],
    },
    {
      id: "flagged",
      n: 2,
      titleBn: "কর্মকর্তার কনসোলে ফ্ল্যাগ",
      caption: "AI সারাংশ ও জরুরি চিহ্ন",
      narration: "কথোপকথন শেষ। কর্মকর্তার কনসোলে আবেদনটি জরুরি হিসেবে চিহ্নিত হয়েছে।",
      turns: [
        { speaker: "narrator", text: "কথোপকথন শেষ। কর্মকর্তার কনসোলে আবেদনটি জরুরি হিসেবে চিহ্নিত হয়েছে। সিস্টেম প্রতিটি বাক্য থেকে চারটি আলাদা সংকেত বের করেছে। পারিবারিক সহিংসতা, নিয়ন্ত্রিত যোগাযোগ, অনুপলব্ধ পরিচয়, এবং প্রতিনিধিত্ব।", audio: "moyuri_09_flagged.wav", proves: "শ্রেণিবিভাগ কোডে লেখা নয় — ট্রান্সক্রিপ্ট থেকে পাওয়া।" },
      ],
    },
    {
      id: "window",
      n: 3,
      titleBn: "নিরাপদ সময় — ১৫ মিনিট",
      caption: "যোগাযোগের নিয়ন্ত্রণ",
      narration: "মোয়ূরীর সঙ্গে যোগাযোগ কেবল এই পনেরো মিনিটে।",
      turns: [
        { speaker: "narrator", text: "স্বামী ফোন দেখেন বলে মোয়ূরীর সঙ্গে যোগাযোগ করা যায় শুধু প্রতিদিন সকাল এগারটা থেকে এগারটা পনেরো মিনিট। এই পনেরো মিনিট ছাড়া সিস্টেম কোনো কল বা বার্তা পাঠাবে না।", audio: "moyuri_10_window.wav", proves: "নিরাপদ সময় নথি হিসেবে সংরক্ষিত, কথা হিসেবে নয় — তাই কোড বাধ্য করতে পারে।" },
        { speaker: "narrator", text: "পরালেগাল আইনি সহায়তা কর্মকর্তা নিরাপদ সময়ে মোয়ূরীর কাছে পৌঁছেছেন। স্বামীর নম্বরে একটিও বার্তা যায়নি।", audio: "moyuri_11_para.wav", proves: "ব্রিফের পরীক্ষা — অনিরাপদ ব্যক্তি ফোন ধরলেও কিছু পৌঁছায় না।" },
        {
          speaker: "moyuri",
          text: "আমি এখন নিরাপদে আছি। আমার কথা লিখে রাখা হলে ভালো হয়। আমার নিজের মতে করতে পারলে আমি পড়তে পারি না, তাই আপনি লিখে দেবেন।",
          audio: "moyuri_11b_moyuri_voice.wav",
          step: "her_own_account",
          proves: "এই একটি ধাপেই তিনটি বাধা একসঙ্গে: নিরাপত্তা নিশ্চিত হয়েছে, তার নিজের কথা নথিতে ঢুকছে, এবং সে লিখতে পারে না — তাই সহায়তাকারী লিখছে।",
        },
      ],
    },
    {
      id: "identity",
      n: 4,
      titleBn: "পরিচয় নিবন্ধন",
      caption: "নিকটতম কেন্দ্র থেকে এনআইডি",
      narration: "পরিচয় ছাড়া আবেদন চলে না — তাই কাছের কেন্দ্র থেকে নিবন্ধন।",
      turns: [
        { speaker: "narrator", text: "নিকটতম নিবন্ধন কেন্দ্র থেকে মোয়ূরীর জাতীয় পরিচয়পত্র নিবন্ধন করা হয়েছে। প্রতিনিধির কথা আর মোয়ূরীর নিজের বক্তব্য নথিতে আলাদা ভাগে সংরক্ষিত।", audio: "moyuri_12_nid.wav", proves: "অসম্পূর্ণ পরিচয় সমস্যা ছিল, প্রক্রিয়া সেটি সমাধান করেছে।" },
      ],
    },
    {
      id: "mediation",
      n: 5,
      titleBn: "মধ্যস্থতা নির্ধারণ",
      caption: "কার্যদিবস ও নিরাপদ সময়",
      narration: "এখন জটিল সমস্যাটি একটি তারিখে।",
      turns: [
        { speaker: "narrator", text: "কর্মকর্তা মধ্যস্থতার তারিখ নির্ধারণ করেছেন। নির্বাচিত তারিখটি কার্যদিবস, এবং সময়টি মোয়ূরীর নিরাপদ সময়ের মধ্যে রাখা হয়েছে।", audio: "moyuri_13_mediation.wav", proves: "শুক্র ও শনি প্রত্যাখ্যান করে সার্ভারে বাধ্য — ক্যালেন্ডারে তা দেখা যায়।" },
        { speaker: "narrator", text: "বিশেষ মধ্যস্থতাকারী কেসটি গ্রহণ করেছেন। তিনি গ্রহণ না করলে ক্ষতিপূরণ বিবেচনা করা হতো না।", audio: "moyuri_14_mediator.wav", proves: "মধ্যস্থতাকারীর সম্মতি ছাড়া বিলিং আটকে — আলাদা নথি, আলাদা নিয়ম।" },
      ],
    },
    {
      id: "session",
      n: 6,
      titleBn: "মধ্যস্থতা ও ফলাফল",
      caption: "সালিশ হয়েছে",
      narration: "উভয় পক্ষের কথা নথিভুক্ত।",
      turns: [
        { speaker: "narrator", text: "মধ্যস্থতা অনুষ্ঠিত হয়েছে। উভয় পক্ষের কথা নথিভুক্ত এবং একটি অংশে সমঝোতা হয়েছে।", audio: "moyuri_15_session.wav", proves: "প্রতিটি চেষ্টা আলাদা নথি — ব্যর্থ হলেও আগের চেষ্টা মুছে যায় না।" },
        { speaker: "narrator", text: "সালিশ হয়েছে। সিস্টেম এখন সালিশ সনদ প্রস্তুত করছে।", audio: "moyuri_16_settled.wav", proves: "ফলাফল নথিভুক্ত হলে তিন পক্ষের স্বাক্ষরের রেকর্ড খোলে।" },
      ],
    },
    {
      id: "document",
      n: 7,
      titleBn: "AI সালিশ সনদ প্রস্তুত",
      caption: "নথি থেকে দলিল",
      narration: "প্রতিটি অংশের উৎস দেখানো হয়; যেটার উৎস নেই সেটি ফাঁকা থাকে।",
      turns: [
        { speaker: "narrator", text: "সালিশ সনদের প্রতিটি অংশ কেস নথি থেকে তৈরি হচ্ছে। যে অংশের উৎস নথিতে নেই, সেটি ফাঁকা রাখা হচ্ছে। কারণ সালিশ সনদ একটি বাস্তবায়নযোগ্য দলিল, তাই নথিতে না থাকা কোনো শর্ত বানিয়ে লেখা হবে না।", audio: "moyuri_17_draft.wav", proves: "নিরাপদ প্রস্তাবি — উৎসনেই না থাকা শর্ত বানিয়ে লেখা হয়নি।" },
        { speaker: "narrator", text: "চারটি অংশ এখনো নির্ধারিত হয়নি। এগুলো না ছাড়া কেউ স্বাক্ষর করবেন না। তিন পক্ষ স্বাক্ষর করলেই প্রধান কর্মকর্তা প্রতিপালন করবেন।", audio: "moyuri_18_sign.wav", proves: "তিন পক্ষের স্বাক্ষর ছাড়া প্রতিপালন হয় না — নিয়ম কোডেই।" },
        { speaker: "narrator", text: "মোয়ূরী নিরাপদে আছেন, তার কথা নথিতে নিজের মুখে যুক্ত হয়েছে, এবং আইনি সুরক্ষার প্রক্রিয়া শুরু হয়েছে।", audio: "moyuri_19_outcome.wav", proves: "শুরুটা হয়েছে আবেদন দিয়ে নয় — নিরাপত্তা নিশ্চিত করে।" },
      ],
    },
  ],
  turns: [],
  config: {
    safeWindow: { caseId: "DEMO-CASE-A1", docketId: "DLAS-2025-JYP-0141" },
    bookMediation: {
      caseId: "DEMO-CASE-A1",
      docketId: "DLAS-2025-JYP-0141",
      venue: "জেলা লিগ্যাল এইড অফিস, নিরাপ্ত কক্ষ",
      mediatorName: "ফারহানা আক্তার",
    },
  },
};

/** The other four, shorter but running through the same real classifier. */
const NABILA: Simulation = {
  id: "nabila",
  personaId: "nabila",
  title: "নাবিলা — ভুয়া ছবি ও ভয়, জরুরি শ্রেণিতে",
  premise: "ছড়িয়ে দেওয়া ছবি ও ভয়মূলক বার্তা: একটি শব্দ 'জরুরি' না বললেই জরুরি বলে চিহ্নিত হওয়া উচিত।",
  outcome: "জরুরি শ্রেণি, সংবেদনশীল প্রমাণ সীমিত, এবং অন্য কর্তৃপক্ষে ট্র্যাক করা রেফারেল।",
  callerVoice: VOICES.nabila,
  turns: [
    { speaker: "agent", step: "greeting", text: "জাতীয় আইনগত সহায়তা প্রদান সংস্থা। আপনার কথা রেকর্ড করা হচ্ছে। কোন ভাষায় কথা বলবেন?", audio: "sim/nabila_greeting.wav", proves: "এক ক্লিপে ভাষা ও রেকর্ডিং-অবিজ্ঞপ্তা।" },
    { speaker: "caller", text: "বাংলায়।", audio: "sim/nabila_caller_lang.wav", step: "language", proves: "ভাষা নির্বাচিত।" },
    { speaker: "agent", step: "problem", text: "আপনার সমস্যাটি বলুন, আমি শুনছি।", audio: "sim/nabila_problem.wav", proves: "সমস্যা বলার প্রশ্ন।" },
    {
      speaker: "caller",
      step: "problem",
      audio: "sim/nabila_caller_problem.wav",
      text: "আমার একজন পুরোনো সহপাঠী আমার ছবি বদলে অশ্লীল মেসেজ পাঠাচ্ছেন এবং আমাকে ভয় দিচ্ছেন। আমার ছবি অন্যদের কাছে ছড়িয়ে দেওয়া হচ্ছে। আমি খুব ভয় পাচ্ছি।",
      proves: "ছবি, ভয় ও ব্যক্তিগত ঝুঁকি — 'জরুরি' শব্দটি বলা হয়নি, তবু শ্রেণি বের হবে।",
    },
    { speaker: "agent", step: "acknowledgement", text: "আপনার আবেদনটি জরুরি হিসেবে চিহ্নিত হয়েছে। প্রমাণগুলো সীমিত অভিযোগীদের জন্য।", audio: "sim/nabila_ack.wav", proves: "সংবেদনশীল প্রমাণ সীমিত করা হলো, আবেদনকারী নিজে অবাধ।" },
  ],
  config: {
    bookMediation: {
      caseId: "DEMO-CASE-A3",
      docketId: "DLAS-2025-JHI-0088",
      venue: "জেলা লিগ্যাল এইড অফিস, সাইবার নিরাপত্তা কক্ষ",
      mediatorName: "সালমা খাতুন",
    },
  },
};

const RIPON: Simulation = {
  id: "ripon",
  personaId: "ripon",
  title: "রিপন — দৃষ্টিহীন আবেদনকারী, কোনো ভিজ্যুয়াল ধাপ নয়",
  premise: "দৃষ্টিহীন ব্যক্তি যেন ফর্ম, ক্যাপচা বা ভিজ্যুয়াল ওটিপি ছাড়াই একটি অর্থবহ কাজ শেষ করতে পারেন।",
  outcome: "ভয়েসেই আবেদন সম্পূর্ণ, কোনো ভিজ্যুয়াল ধাপ নেই।",
  callerVoice: VOICES.ripon,
  turns: [
    { speaker: "agent", step: "greeting", text: "জাতীয় আইনগত সহায়তা প্রদান সংস্থা। আপনার কথা রেকর্ড করা হচ্ছে। কোন ভাষায় কথা বলবেন?", audio: "sim/ripon_greeting.wav", proves: "ভাষা ও রেকর্ডিং-অবিজ্ঞপ্তা এক ক্লিপে।" },
    { speaker: "caller", text: "বাংলায় কথা বলব, আমি দৃষ্টিহীন।", audio: "sim/ripon_caller_lang.wav", step: "language", proves: "অ্যাক্সেসিবিলিটি প্রকাশ করেছেন — ধারাবাহিকতা ধরে রাখা হবে।" },
    { speaker: "agent", step: "problem", text: "আপনার সমস্যাটি বলুন, আমি শুনছি।", audio: "sim/ripon_problem.wav", proves: "সমস্যা বলার প্রশ্ন।" },
    {
      speaker: "caller",
      step: "problem",
      audio: "sim/ripon_caller_problem.wav",
      text: "আমি দৃষ্টিহীন, ফরম বা পিডিএফ আমি পড়তে পারি না, এবং ভিজ্যুয়াল ওটিপি ব্যবহার করতে পারি না। আমার পিতার রেখে যাওয়া জমি নিয়ে আমার ভাই আমাকে ঠকাতে চাইছেন। আমি চাই ভয়েস ও কলের মাধ্যমেই আবেদন করতে পারি।",
      proves: "অ্যাক্সেসিবিলিটি একটি প্রকাশিত বাধা হিসেবে ধরা পড়েছে, এটিকে 'সাধারণ তথ্য' ভাবা হয়নি।",
    },
    { speaker: "agent", step: "acknowledgement", text: "আপনার আবেদনটি গ্রহণ করা হয়েছে। কোনো ছবি, ওটিপি বা ফর্ম লাগবে না — সবকিছু কল ও ভয়েসের মাধ্যমে হবে।", audio: "sim/ripon_ack.wav", proves: "কোনো ভিজ্যুয়াল ধাপ নেই — এটিই প্রয়োজনীয়তা।" },
  ],
  config: {
    bookMediation: {
      caseId: "DEMO-CASE-A2",
      docketId: "DLAS-2025-JYP-0142",
      venue: "জেলা লিগ্যাল এইড অফিস, সালিস কক্ষ",
      mediatorName: "মোঃ সফিকুল ইসলাম",
    },
  },
};

const NUCHING: Simulation = {
  id: "nuching",
  personaId: "nuching",
  title: "নুচিং মারমা — ভাষা ও সহায়তাকারীর মধ্যে পার্থক্য ধরে রাখা",
  premise: "আবেদনকারী যিনি পড়তে পারেন না এবং মারমা বলেন, তাঁর কথা আর সহায়তাকারীর টাইপ করা অনুবাদ এক হতে পারে না।",
  outcome: "দুটি আলাদা নথি — নিজের কথা ও অনুবাদ — এবং অনুবাদের সম্মতির অনুপস্থিতি।",
  callerVoice: VOICES.nuching,
  turns: [
    { speaker: "agent", step: "greeting", text: "জাতীয় আইনগত সহায়তা প্রদান সংস্থা। আপনার কথা রেকর্ড করা হচ্ছে। কোন ভাষায় কথা বলবেন?", audio: "sim/nuching_greeting.wav", proves: "ভাষার প্রশ্ন — মারমা বললে ওই পথেই যাবে।" },
    { speaker: "caller", text: "মারমায় কথা বলি।", audio: "sim/nuching_caller_lang.wav", step: "language", proves: "আদিবাসিক ভাষা নির্বাচিত; প্রশ্নটি ভাষা-নির্ভর।" },
    { speaker: "agent", step: "problem", text: "আপনার সমস্যাটি বলুন, আমি শুনছি।", audio: "sim/nuching_problem.wav", proves: "সমস্যা বলার প্রশ্ন।" },
    {
      speaker: "caller",
      step: "problem",
      audio: "sim/nuching_caller_problem.wav",
      text: "আমার বাসার জমি আমার মা উইল্ট করে গেছেন। আমার ভাই আমাকে জমি থেকে বের করার চেষ্টা করছেন। আমি পড়তে পারি না, মারমায় কথা বলি। একজন ইউডিসি আমার হয়ে ফোন ধরে এসেছেন, আমার নিজের নম্বর নেই।",
      proves: "পড়তে না পারা, ভাষা এবং সহায়তাকারীর মাধ্যম — তিনটিই একসঙ্গে ধরা পড়ল।",
    },
    { speaker: "agent", step: "acknowledgement", text: "আপনার কথা আলাদা করে রাখা হবে, আর ইউডিসি যা লিখেছেন তা অনুবাদ হিসেবে আলাদা। অনুবাদটি আপনার সম্মতি ছাড়া চূড়ান্ত হবে না।", audio: "sim/nuching_ack.wav", proves: "নিজের কথা বনাম অনুবাদ — প্রমাণ হিসেবে সংরক্ষিত।" },
  ],
  config: {
    bookMediation: {
      caseId: "DEMO-CASE-A4",
      docketId: "DLAS-2025-KHG-0231",
      venue: "জেলা লিগ্যাল এইড অফিস, সালিস কক্ষ",
      mediatorName: "ফারহানা আক্তার",
    },
  },
};

const MALEK: Simulation = {
  id: "malek",
  personaId: "malek",
  title: "আব্দুল মালেক — সাত মাসের নিষ্ক্রিয় মামলা",
  premise: "দীর্ঘস্থায়ী মামলা, অস্থির যোগাযোগ এবং নিষ্ক্রিয় আইনি — অপেক্ষমাণ আইনির জবাবদিহি।",
  outcome: "বিলম্বিত আপডেট সামনে আসে এবং আইনির বিরুদ্ধে প্রক্রিয়া চালু হয়।",
  callerVoice: VOICES.malek,
  turns: [
    { speaker: "agent", step: "greeting", text: "জাতীয় আইনগত সহায়তা প্রদান সংস্থা। আপনার কথা রেকর্ড করা হচ্ছে। কোন ভাষায় কথা বলবেন?", audio: "sim/malek_greeting.wav", proves: "এক ক্লিপে ভাষা ও রেকর্ডিং-অবিজ্ঞপ্তা।" },
    { speaker: "caller", text: "বাংলায়।", audio: "sim/malek_caller_lang.wav", step: "language", proves: "ভাষা নির্বাচিত।" },
    { speaker: "agent", step: "problem", text: "আপনার সমস্যাটি বলুন, আমি শুনছি।", audio: "sim/malek_problem.wav", proves: "সমস্যা বলার প্রশ্ন।" },
    {
      speaker: "caller",
      step: "problem",
      audio: "sim/malek_caller_problem.wav",
      text: "দোকান থেকে ভাড়ায় দেওয়া টাকা পাওনা যায়নি। আমি সাত মাস ধরে মামলা করেছি, কিন্তু কোনো খবর পাইনি। আমার স্মার্টফোন নেই, নথি দোকানের ফোনে থাকে, আর ঘুরে আসতে মজুরি লাগে।",
      proves: "দীর্ঘস্থায়ীত্ব, অস্থির যোগাযোগ ও আইনি নিষ্ক্রিয়তা একসঙ্গে ধরা পড়ল।",
    },
    { speaker: "agent", step: "acknowledgement", text: "আপনার মামলাটি সাত মাস ধরে আইনির কাছে আছে এবং কোনো আপডেট নেই। এটি নথিভুক্ত হয়েছে।", audio: "sim/malek_ack.wav", proves: "সময়সীমা উত্তীর্ণ — ব্যর্থ যোগাযোগ লগড, আইনির বিরুদ্ধে প্রক্রিয়া চালু।" },
  ],
  config: {
    bookMediation: {
      caseId: "DEMO-CASE-A5",
      docketId: "DLAS-2025-0992",
      venue: "জেলা লিগ্যাল এইড অফিস, সালিস কক্ষ",
      mediatorName: "অ্যাডভোকেট হারুন আলী",
    },
  },
};

export const SIMULATIONS: Simulation[] = [MOYURI_RIPON, NABILA, RIPON, NUCHING, MALEK];

export function getSimulation(id: string): Simulation | null {
  return SIMULATIONS.find((s) => s.id === id) ?? null;
}

/** Every turn in a scenario, in order — phases flattened, or the flat list. */
export function allTurns(sim: Simulation): SimulationTurn[] {
  if (sim.phases?.length) return sim.phases.flatMap((phase) => phase.turns);
  return sim.turns;
}

/**
 * The pre-recorded clip for a turn, resolved to a URL.
 *
 * Clips live in `public/audio/sim`, so the stored name is the filename only. Resolving
 * here rather than at each call site means a missing clip is one `null`, not a broken
 * `<audio src="/audio/sim/undefined">` — and the simulation deliberately degrades to a
 * caption instead of failing, because a silent line is better than a broken demo.
 */
export function clipUrl(turn: SimulationTurn): string | null {
  if (!turn.audio) return null;
  return `/audio/sim/${turn.audio.replace(/^sim\//, "")}`;
}

/**
 * The voice a turn is recorded in.
 *
 * A turn's own `voice` wins so a specific line can be re-cast; otherwise it follows the
 * speaker, and a caller follows its own scenario. The agent and the narrator are
 * deliberately scenario-independent — one institution, one voice, every time.
 *
 * `moyuri` is listed explicitly rather than falling through to `callerVoice`. Falling
 * through would cast her in Ripon's voice, which is precisely the error the speaker
 * exists to prevent: the whole point of that turn is that her account is not his.
 */
export function resolveVoice(sim: Simulation, turn: SimulationTurn): string {
  if (turn.voice) return turn.voice;
  switch (turn.speaker) {
    case "agent":
      return VOICES.agent;
    case "narrator":
      return VOICES.narrator;
    case "moyuri":
      return VOICES.moyuri;
    default:
      return sim.callerVoice ?? VOICES.ripon;
  }
}

export interface AudioClip {
  /** Filename under /audio/sim — exactly what `clipUrl` will ask for. */
  file: string;
  text: string;
  voice: string;
  speaker: Speaker | string;
  simId: string;
}

/**
 * Every clip the recordings need, derived from the scenarios themselves.
 *
 * This exists because the clip list was duplicated as a hand-maintained array of copied
 * text. It drifted: the four secondary scenarios referenced `nabila_greeting.wav` while
 * the generator wrote `nabila_01_greeting.wav`, so every one of those clips 404'd and
 * three of the five personas played back completely silent. A second copy of the script
 * is a second chance to be wrong, and nothing was checking. Deriving the plan from the
 * turns means a clip cannot exist under a name no turn asks for.
 */
export function audioClipPlan(): AudioClip[] {
  const out: AudioClip[] = [];
  for (const sim of SIMULATIONS) {
    for (const turn of allTurns(sim)) {
      if (!turn.audio) continue;
      out.push({
        file: turn.audio.replace(/^sim\//, ""),
        text: turn.text,
        voice: resolveVoice(sim, turn),
        speaker: turn.speaker,
        simId: sim.id,
      });
    }
  }
  return out;
}
