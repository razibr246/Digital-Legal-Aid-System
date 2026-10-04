import type { IndigenousLanguage, IndigenousScenario, IndigenousTerm } from "../knowledge/indigenous-language-lexicon";

export interface SemanticMatch {
  term: string;
  matchedText: string;
  matchedVariant: string;
  score: number;
  glossBn: string;
  glossEn: string;
}

export interface SemanticBridgeResult {
  language: Exclude<IndigenousLanguage, "bn">;
  transcript: string;
  matched: boolean;
  matches: SemanticMatch[];
  scenario: IndigenousScenario | null;
  normalizedBangla: string;
  legalIntent: string | null;
  legalIntentBn: string | null;
  confidence: number;
  clarificationQuestionBn: string | null;
  sourceTerms: IndigenousTerm[];
}
