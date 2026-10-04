/**
 * Smart Turn — End-of-Turn & Conversational Boundary Analyzer
 * Evaluates syntax, semantic completeness, and pause timing to distinguish
 * thinking pauses from completed user turns.
 */

export interface SmartTurnPrediction {
  isComplete: boolean;
  confidence: number;
}

export class SmartTurnAnalyzer {
  // Incomplete connector words that suggest the user is mid-thought
  private readonly incompleteEndings = new Set([
    "and", "or", "but", "so", "because", "if", "when", "that", "the", "a", "an",
    "with", "to", "for", "of", "in", "at", "by", "from", "as", "like", "um", "uh",
    "well", "though", "although", "since", "while", "where", "which", "who", "whom",
    "এবং", "বা", "কিন্তু", "সুতরাং", "কারণ", "যদি", "যে", "আর", "অথবা", "মানে",
    "তার", "তাই", "আচ্ছা", "থেকে",
  ]);

  // Bengali interrogative words: a sentence starting with these is a question
  private readonly bnQuestionStarters = /^(কী|কি|কেন|কিভাবে|কীভাবে|কোথায়|কখন|কত|কেস|কেমন|হ্যালো)/;

  public predict(transcript: string, silenceDurationMs: number): SmartTurnPrediction {
    const text = transcript.trim().toLowerCase();
    if (text.length === 0) {
      return { isComplete: false, confidence: 0.0 };
    }

    const words = text.split(/\s+/).filter(Boolean);
    const lastWord = words[words.length - 1] || "";

    // 1. If ending with an incomplete conjunction/filler word: user is pausing to think
    if (this.incompleteEndings.has(lastWord)) {
      // Only complete if silence exceeds long fallback threshold (e.g. 1500ms)
      const isComplete = silenceDurationMs >= 1500;
      return { isComplete, confidence: isComplete ? 0.6 : 0.2 };
    }

    // 2. Strong terminal punctuation signals completion (. ! ? ।)
    if (/[.!?।]$/.test(transcript.trim())) {
      return { isComplete: true, confidence: 0.95 };
    }

    // 3. Question structure (English + Bengali interrogatives)
    const firstWord = words[0] || "";
    const isQuestionStarter =
      this.bnQuestionStarters.test(firstWord) ||
      /^(who|what|when|where|why|how|can|could|would|should|is|are|do|does|did|will|may)/.test(firstWord);
    if (isQuestionStarter && words.length >= 3) {
      return { isComplete: true, confidence: 0.88 };
    }

    // 4. Default threshold: silence >= 450ms on a multi-word thought
    if (words.length >= 2 && silenceDurationMs >= 450) {
      return { isComplete: true, confidence: 0.8 };
    }

    return { isComplete: silenceDurationMs >= 700, confidence: 0.5 };
  }
}