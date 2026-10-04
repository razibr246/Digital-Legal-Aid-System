import {
  getScenariosForLanguage,
  type IndigenousLanguage,
  type IndigenousScenario,
  type IndigenousTerm,
} from "../knowledge/indigenous-language-lexicon";
import { isWordBoundary, normalizeText, similarity } from "./normalize";
import type { SemanticBridgeResult, SemanticMatch } from "./types";

const MIN_MATCH_SCORE = 0.74;
const SHORT_FORM_PENALTY = 0.55;
const AMBIGUOUS_SHORT_TERMS = new Set(["না", "মা", "ঘর", "চা", "ধার"]);

function findBestTermMatch(transcript: string, term: IndigenousTerm): SemanticMatch | null {
  const normalizedTerm = normalizeText(term.term);
  const forms = [term.term, ...term.variants].map((form) => ({
    form,
    normalized: normalizeText(form),
  }));

  let best: SemanticMatch | null = null;
  for (const candidate of forms) {
    if (!candidate.normalized) continue;
    let start = transcript.indexOf(candidate.normalized);
    while (start !== -1) {
      const boundaryMatch = isWordBoundary(transcript, start, candidate.normalized.length);
      if (!boundaryMatch && candidate.normalized.length <= 3) {
        start = transcript.indexOf(candidate.normalized, start + 1);
        continue;
      }
      const exactScore = candidate.normalized === normalizedTerm ? 0.99 : 0.94;
      const score = boundaryMatch ? exactScore : exactScore - 0.12;
      if (score >= MIN_MATCH_SCORE && (!best || score > best.score)) {
        best = {
          term: term.term,
          matchedText: transcript.slice(start, start + candidate.normalized.length),
          matchedVariant: candidate.form,
          score,
          glossBn: term.glossBn,
          glossEn: term.glossEn,
        };
      }
      start = transcript.indexOf(candidate.normalized, start + 1);
    }
  }

  if (best) return best;

  const tokens = transcript.split(" ").filter(Boolean);
  for (const token of tokens) {
    for (const candidate of forms) {
      if (candidate.normalized.length < 3 || token.length < 3) continue;
      if (candidate.normalized.length <= 3 && token.length > candidate.normalized.length) continue;
      const lengthDifference = Math.abs(token.length - candidate.normalized.length);
      if (lengthDifference > Math.max(2, Math.floor(candidate.normalized.length * 0.4))) continue;
      const score = similarity(token, candidate.normalized);
      if (score >= MIN_MATCH_SCORE && (!best || score > best.score)) {
        best = {
          term: term.term,
          matchedText: token,
          matchedVariant: candidate.form,
          score,
          glossBn: term.glossBn,
          glossEn: term.glossEn,
        };
      }
    }
  }

  return best;
}

function contextMatchBonus(transcript: string, scenario: IndigenousScenario): number {
  const terms = scenario.legalIntentBn
    .split(/[\s,।]+/)
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 4);
  const hits = terms.filter((term) => transcript.includes(term)).length;
  return Math.min(0.12, hits * 0.04);
}

function scoreScenario(transcript: string, scenario: IndigenousScenario): {
  matches: SemanticMatch[];
  confidence: number;
} {
  const matches = scenario.terms
    .map((term) => findBestTermMatch(transcript, term))
    .filter((match): match is SemanticMatch => match !== null)
    .sort((left, right) => right.score - left.score);

  if (matches.length === 0) return { matches, confidence: 0 };
  const distinctTerms = new Set(matches.map((match) => match.term)).size;
  const bestScore = matches[0].score;
  const shortOnly = matches.every((match) => match.term.length < 3);
  if (shortOnly && distinctTerms === 1) {
    const term = matches[0].term;
    if (AMBIGUOUS_SHORT_TERMS.has(term)) {
      return { matches, confidence: Math.min(bestScore, SHORT_FORM_PENALTY) };
    }
    return { matches, confidence: Math.min(0.82, 0.62 + bestScore * 0.2) };
  }
  const phraseBonus = matches.some((match) => match.matchedText.includes(" ")) ? 0.08 : 0;
  const confidence = Math.min(0.98, 0.55 + bestScore * 0.25 + Math.min(distinctTerms, 3) * 0.06 + phraseBonus + contextMatchBonus(transcript, scenario));
  return { matches, confidence };
}

function buildNormalizedBangla(scenario: IndigenousScenario, matches: SemanticMatch[]): string {
  const meanings = Array.from(new Set(matches.map((match) => match.glossBn))).slice(0, 4);
  const meaningText = meanings.length > 0 ? meanings.join(", ") : "সংশ্লিষ্ট আইনি বিষয়";
  return `আপনার কথায় ${meaningText} শনাক্ত হয়েছে। মনে হচ্ছে আপনি ${scenario.legalIntentBn} সম্পর্কে কথা বলছেন।`;
}

export function interpretSemanticBridge(
  transcript: string,
  language: IndigenousLanguage,
): SemanticBridgeResult {
  const normalizedTranscript = normalizeText(transcript);
  const emptyResult: SemanticBridgeResult = {
    language: language === "bn" ? "marma" : language,
    transcript,
    matched: false,
    matches: [],
    scenario: null,
    normalizedBangla: "",
    legalIntent: null,
    legalIntentBn: null,
    confidence: 0,
    clarificationQuestionBn: null,
    sourceTerms: [],
  };
  if (language === "bn" || !normalizedTranscript) return emptyResult;

  const ranked = getScenariosForLanguage(language)
    .map((scenario) => ({ scenario, ...scoreScenario(normalizedTranscript, scenario) }))
    .filter((candidate) => candidate.matches.length > 0 && candidate.confidence >= 0.6)
    .sort((left, right) => right.confidence - left.confidence);

  const best = ranked[0];
  if (!best) return emptyResult;

  return {
    language,
    transcript,
    matched: true,
    matches: best.matches,
    scenario: best.scenario,
    normalizedBangla: buildNormalizedBangla(best.scenario, best.matches),
    legalIntent: best.scenario.legalIntent,
    legalIntentBn: best.scenario.legalIntentBn,
    confidence: Number(best.confidence.toFixed(2)),
    clarificationQuestionBn: `আমি বুঝতে পেরেছি আপনি ${best.scenario.legalIntentBn} সম্পর্কে কথা বলছেন। আপনি কি এটাই বলেছেন?`,
    sourceTerms: best.scenario.terms,
  };
}
