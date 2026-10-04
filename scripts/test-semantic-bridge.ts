import assert from "node:assert/strict";
import { getScenariosForLanguage, INDIGENOUS_SCENARIOS } from "../lib/agent/knowledge/indigenous-language-lexicon";
import { interpretSemanticBridge } from "../lib/agent/semantic-bridge/match-lexicon";
import { normalizeText, similarity } from "../lib/agent/semantic-bridge/normalize";

let passed = 0;

function check(name: string, assertion: () => void) {
  try {
    assertion();
    passed += 1;
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

check("dataset has 9 scenarios per indigenous language", () => {
  assert.equal(getScenariosForLanguage("marma").length, 9);
  assert.equal(getScenariosForLanguage("chakma").length, 9);
  assert.equal(INDIGENOUS_SCENARIOS.length, 18);
});

check("normalization handles Bengali digits, punctuation, and joiners", () => {
  assert.equal(normalizeText("  ১৬৬৯৯\u200c-আবেদন!  "), "16699 আবেদন");
});

check("Levenshtein similarity is symmetric and bounded", () => {
  assert.equal(similarity("ঘর", "ঘর"), 1);
  assert.equal(similarity("ঘর", "ঘরে"), similarity("ঘরে", "ঘর"));
  assert.ok(similarity("ঘর", "ঘর") >= 0);
  assert.ok(similarity("ঘর", "ঘর") <= 1);
});

check("Marma exact land-partition terms resolve", () => {
  const result = interpretSemanticBridge("বাবার রেখে যাওয়া ম্রে অং চাক্ নিয়ে বিরোধ", "marma");
  assert.equal(result.matched, true);
  assert.equal(result.legalIntent, "land_partition");
  assert.ok(result.confidence >= 0.8);
  assert.ok(result.matches.length >= 2);
  assert.match(result.normalizedBangla, /জমি/);
  assert.match(result.clarificationQuestionBn || "", /আপনি কি এটাই বলেছেন/);
});

check("Marma variants resolve rent disputes", () => {
  const result = interpretSemanticBridge("আমার ইম ঙা লুই সমস্যা হচ্ছে", "marma");
  assert.equal(result.matched, true);
  assert.equal(result.legalIntent, "rent_control");
  assert.ok(result.matches.some((match) => match.matchedVariant === "ইম্ম" || match.term === "ইম"));
});

check("Chakma exact family terms resolve", () => {
  const result = interpretSemanticBridge("জামেই ছারাছারি দিতে চায়, গুরোর কাস্টডি নিয়ে সমস্যা", "chakma");
  assert.equal(result.matched, true);
  assert.equal(result.legalIntent, "family_law");
  assert.ok(result.matches.length >= 2);
});

check("Chakma variants resolve agricultural pre-emption", () => {
  const result = interpretSemanticBridge("ভূঁই আগর ঘিনানা অধিকার নিয়ে সমস্যা", "chakma");
  assert.equal(result.matched, true);
  assert.equal(result.legalIntent, "agricultural_preemption");
  assert.ok(result.matches.length >= 2);
});

check("cross-language terms are isolated", () => {
  const marma = interpretSemanticBridge("জামেই ছারাছারি গুরো", "marma");
  const chakma = interpretSemanticBridge("মিয়াং মাচাং খ্রো", "chakma");
  assert.equal(marma.matched, false);
  assert.equal(chakma.matched, false);
});

check("Bangla mode never activates the indigenous bridge", () => {
  const result = interpretSemanticBridge("ম্রে অং চাক্", "bn");
  assert.equal(result.matched, false);
  assert.equal(result.scenario, null);
  assert.equal(result.confidence, 0);
});

check("unrelated and malformed input is rejected", () => {
  assert.equal(interpretSemanticBridge("", "marma").matched, false);
  assert.equal(interpretSemanticBridge("আমি আজ ভালো আছি", "marma").matched, false);
  assert.equal(interpretSemanticBridge("   ,.;!  ", "chakma").matched, false);
});

check("substring boundaries prevent false positives inside longer words", () => {
  assert.equal(interpretSemanticBridge("আমি আজ ভালো আছি", "marma").matched, false);
  assert.equal(interpretSemanticBridge("না", "marma").matched, false);
});

check("short ambiguous terms do not create a semantic interpretation", () => {
  const result = interpretSemanticBridge("না", "marma");
  assert.equal(result.matched, false);
  assert.equal(result.confidence, 0);
});

check("fuzzy STT spelling changes remain within the selected language", () => {
  const exact = interpretSemanticBridge("ম্রে অং চাক্", "marma");
  const fuzzy = interpretSemanticBridge("ম্রেয় অংহ চাক্", "marma");
  assert.equal(exact.legalIntent, fuzzy.legalIntent);
  assert.equal(fuzzy.matched, true);
  assert.ok(fuzzy.confidence <= exact.confidence);
});

check("every matched result returns a bounded, non-empty interpretation", () => {
  for (const language of ["marma", "chakma"] as const) {
    for (const scenario of getScenariosForLanguage(language)) {
      const result = interpretSemanticBridge(scenario.examples[0], language);
      assert.equal(result.matched, true);
      assert.equal(result.scenario?.id, scenario.id);
      assert.ok(result.confidence > 0.6 && result.confidence <= 0.98);
      assert.ok(result.normalizedBangla.length > 20);
      assert.ok((result.clarificationQuestionBn || "").length > 10);
    }
  }
});

process.stdout.write(`\n${passed} semantic validation checks passed\n`);
