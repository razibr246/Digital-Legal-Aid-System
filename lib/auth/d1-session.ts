import type { AppRole, SessionUser } from "./roles";

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
}

interface SessionRow {
  id: string;
  role: AppRole;
  /** Canonical DBLA role; NULL for rows created before migration 0015. */
  role_key: string | null;
  display_name: string;
  status: SessionUser["status"];
  verification_status: SessionUser["verificationStatus"];
  is_mock: number | boolean;
}

export async function hashD1SessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function getD1SessionUser(db: D1Database | null, token: string | undefined): Promise<SessionUser | null> {
  if (!token || !db) return null;
  const row = await db
    .prepare(
      `SELECT u.id, u.role, u.role_key, u.display_name, u.status, u.verification_status, u.is_mock
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
    )
    .bind(await hashD1SessionToken(token))
    .first<SessionRow>();
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    // role_key is the real role when the row carries one; otherwise the legacy
    // users.role is still authoritative, so untouched accounts behave exactly as
    // they did before the registry existed.
    role: (row.role_key as AppRole) ?? row.role,
    status: row.status,
    verificationStatus: row.verification_status,
    isMock: Boolean(row.is_mock),
  };
}

export async function createD1Session(db: D1Database, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = `sess-${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db
    .prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await hashD1SessionToken(token), userId, expiresAt.toISOString())
    .run();
  return { token, expiresAt };
}
