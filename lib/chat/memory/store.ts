import type { MemoryDocument, MemoryLanguage, RetrievedFact } from "./types";

/** Minimal structural type so tests can pass a stub without D1 typings. */
export interface ChatStatement {
  bind(...values: unknown[]): ChatStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface ChatDatabase {
  prepare(query: string): ChatStatement;
  batch(statements: ChatStatement[]): Promise<unknown>;
}

export function asChatDatabase(db: unknown): ChatDatabase | null {
  if (!db || typeof (db as ChatDatabase).prepare !== "function") return null;
  return db as ChatDatabase;
}

export async function hashContent(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function getMemoryVersion(db: ChatDatabase): Promise<number> {
  const row = await db
    .prepare("SELECT memory_version FROM chat_memory_state WHERE id = 1")
    .first<{ memory_version: number }>();
  return Number(row?.memory_version ?? 1);
}

export async function bumpMemoryVersion(db: ChatDatabase): Promise<number> {
  await db
    .prepare(
      "UPDATE chat_memory_state SET memory_version = memory_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
    )
    .run();
  return getMemoryVersion(db);
}

interface DocumentRow {
  id: string;
  source: string;
  external_id: string;
  scope: string;
  title: string;
  body: string;
  keywords: string;
  language: string;
  source_url: string | null;
  authority: string | null;
  is_core: number;
  enabled: number;
  content_hash: string;
  revision: number;
}

function toFact(row: DocumentRow, score: number): RetrievedFact {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    scope: row.scope,
    sourceUrl: row.source_url ?? null,
    authority: row.authority ?? null,
    language: (row.language as MemoryLanguage) || "bn",
    score,
  };
}

const SELECT_COLUMNS =
  "d.id, d.source, d.external_id, d.scope, d.title, d.body, d.keywords, d.language, d.source_url, d.authority, d.is_core, d.enabled, d.content_hash, d.revision";

/**
 * Always-on facts, ordered by id so the prompt prefix is byte-stable between
 * requests. Ordering by id (not by score or updated_at) is what lets the
 * provider's retained cache actually match.
 */
export async function getCoreFacts(db: ChatDatabase, limit = 24): Promise<RetrievedFact[]> {
  const { results } = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS}
       FROM chat_memory_documents d
       WHERE d.enabled = 1 AND d.is_core = 1
       ORDER BY d.id
       LIMIT ?`,
    )
    .bind(limit)
    .all<DocumentRow>();
  return results.map((row) => toFact(row, 1));
}

const FTS_SYNTAX_SAFE = /[^a-z0-9ঀ-৿]+/gi;

/** Turns free text into an FTS5 OR query with quoted, escaped terms. */
export function toFtsQuery(text: string, limit = 12): string {
  const terms = text
    .toLowerCase()
    .split(FTS_SYNTAX_SAFE)
    .filter((term) => term.length >= 2)
    .slice(0, limit);
  if (!terms.length) return "";
  return terms.map((term) => `"${term}"`).join(" OR ");
}

/**
 * Question-specific retrieval. Tries FTS5 first and falls back to a LIKE scan,
 * so a database without FTS5 (or a failed migration) degrades instead of
 * breaking the assistant.
 */
export async function searchFacts(
  db: ChatDatabase,
  query: string,
  limit = 6,
): Promise<RetrievedFact[]> {
  const ftsQuery = toFtsQuery(query);
  if (ftsQuery) {
    try {
      const { results } = await db
        .prepare(
          `SELECT ${SELECT_COLUMNS}, bm25(chat_memory_fts) AS rank
           FROM chat_memory_fts
           JOIN chat_memory_documents d ON d.rowid = chat_memory_fts.rowid
           WHERE chat_memory_fts MATCH ? AND d.enabled = 1 AND d.is_core = 0
           ORDER BY rank
           LIMIT ?`,
        )
        .bind(ftsQuery, limit)
        .all<DocumentRow & { rank: number }>();
      if (results.length) {
        return results.map((row, index) => toFact(row, 1 / (index + 1)));
      }
    } catch {
      // FTS unavailable: fall through to the LIKE scan.
    }
  }

  const like = `%${query.trim().slice(0, 60)}%`;
  try {
    const { results } = await db
      .prepare(
        `SELECT ${SELECT_COLUMNS}
         FROM chat_memory_documents d
         WHERE d.enabled = 1 AND d.is_core = 0
           AND (d.title LIKE ? OR d.keywords LIKE ? OR d.body LIKE ?)
         ORDER BY d.id
         LIMIT ?`,
      )
      .bind(like, like, like, limit)
      .all<DocumentRow>();
    return results.map((row, index) => toFact(row, 1 / (index + 1)));
  } catch {
    return [];
  }
}

export function normalizeDocument(
  source: string,
  document: MemoryDocument,
): Required<Pick<MemoryDocument, "scope" | "title" | "body" | "keywords" | "language" | "isCore" | "enabled">> & {
  externalId: string;
  sourceUrl: string | null;
  authority: string | null;
} {
  return {
    externalId: document.externalId,
    scope: (document.scope || "general").trim(),
    title: (document.title || "").trim(),
    body: (document.body || "").trim(),
    keywords: (document.keywords || "").trim(),
    language: document.language === "en" ? "en" : "bn",
    isCore: document.isCore === true,
    enabled: document.enabled !== false,
    sourceUrl: document.sourceUrl ?? null,
    authority: document.authority ?? null,
  };
}

export type { DocumentRow };
