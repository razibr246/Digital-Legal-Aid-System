/** Shapes for the chatbot memory store and the data control center contract. */

export type MemoryLanguage = "bn" | "en";

/** A single fact the assistant is allowed to rely on. */
export interface MemoryDocument {
  /** Stable id within the source system. Combined with `source` it is idempotent. */
  externalId: string;
  scope: string;
  title: string;
  body: string;
  keywords?: string;
  language?: MemoryLanguage;
  sourceUrl?: string | null;
  /** e.g. "Bangladesh Gazette", "NLASO". Shown to the citizen as provenance. */
  authority?: string | null;
  /**
   * Core documents are small, always-on facts (helpline numbers, eligibility
   * rules). They form the stable prompt prefix and are therefore the part that
   * benefits from prompt cache retention.
   */
  isCore?: boolean;
  enabled?: boolean;
}

export interface MemoryBatch {
  source: string;
  note?: string;
  documents: MemoryDocument[];
  /**
   * When true, documents in this source that are absent from `documents` are
   * disabled. Use for full-snapshot pushes; leave false for partial updates.
   */
  pruneMissing?: boolean;
}

export interface IngestResult {
  batchId: string;
  source: string;
  received: number;
  inserted: number;
  updated: number;
  unchanged: number;
  disabled: number;
  memoryVersion: number;
}

export interface RetrievedFact {
  id: string;
  title: string;
  body: string;
  scope: string;
  sourceUrl: string | null;
  authority: string | null;
  language: MemoryLanguage;
  score: number;
}

export interface MemoryBlock {
  version: number;
  /** Always-included facts. Stable ordering so the cached prefix stays byte-identical. */
  core: RetrievedFact[];
  /** Question-specific facts. Placed after the cache breakpoint. */
  retrieved: RetrievedFact[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface WebSource {
  title: string;
  url: string;
  snippet: string;
}

export interface ChatAnswer {
  answer: string;
  usedWeb: boolean;
  sources: WebSource[];
  memoryIds: string[];
  memoryVersion: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    cacheWriteTokens: number;
  };
}
