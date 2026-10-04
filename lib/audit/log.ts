/**
 * The system audit trail.
 *
 * Everything that changes money, access, a person's liberty, or what the public can
 * see is written here. Two rules make the log worth anything:
 *
 *  - `kind` is a stable, machine-readable constant from `AUDIT_KINDS`, never prose.
 *    An audit log that can only be grepped for sentences cannot be filtered, alerted
 *    on, or counted, which is the only reason to keep one.
 *  - It is append-only. There is no update or delete helper, and the admin API exposes
 *    no way to write to it, so a log that contradicts the data is at least a log that
 *    was not tampered with.
 *
 * A write is deliberately never allowed to fail the operation it describes. Losing an
 * audit line is bad; refusing a citizen's application because the audit insert failed
 * is worse. The failure is logged to the console so it is visible.
 */

import type { D1Database } from "@/lib/auth/d1-session";

/**
 * Every event kind, grouped by what it affects. The names are the contract: an
 * operator filters on them, so they must not drift.
 */
export const AUDIT_KINDS = {
  // Access
  login: "auth.login",
  login_failed: "auth.login_failed",
  logout: "auth.logout",
  session_denied: "auth.session_denied",
  // Accounts and roles
  user_created: "user.create",
  user_role_changed: "user.role_changed",
  user_status_changed: "user.status_changed",
  user_pin_reset: "user.pin_reset",
  // Case lifecycle
  case_created: "case.create",
  case_stage_changed: "case.stage_changed",
  case_viewed_sensitive: "case.viewed_sensitive",
  case_note_added: "case.note_added",
  // Legal aid
  application_filed: "application.filed",
  consultation_started: "consultation.started",
  consultation_viewed: "consultation.viewed",
  eligibility_decided: "eligibility.decided",
  lawyer_assigned: "lawyer.assign",
  lawyer_reassigned: "lawyer.reassign",
  complaint_filed: "complaint.filed",
  complaint_resolved: "complaint.resolved",
  // Lawyer accountability
  show_cause_issued: "lawyer.show_cause_issued",
  show_cause_resolved: "lawyer.show_cause_resolved",
  payment_frozen: "lawyer.payment_frozen",
  payment_unfrozen: "lawyer.payment_unfrozen",
  lawyer_flagged: "lawyer.flagged",
  flag_cleared: "lawyer.flag_cleared",
  sla_violation: "lawyer.sla_violation",
  // Money and mediation
  payment_approved: "payment.approved",
  mediation_scheduled: "mediation.scheduled",
  // Added for the ADR flow. Signing is auditable in its own right and is NOT the same
  // event as certifying: certification is the Chief's act and needs all three
  // signatures (certificationState in domain.ts), so recording a signature as
  // settlement.certified would have overstated what had happened.
  settlement_signed: "settlement.signed",
  // Drafting is auditable and distinct from signing and certifying. It also records WHAT
  // was left open, which is the part worth being able to review later.
  settlement_drafted: "settlement.drafted",
  settlement_certified: "settlement.certified",
  // Contact
  message_queued: "message.queued",
  message_blocked: "message.blocked",
  // Administration
  admin_viewed_audit: "admin.audit_viewed",
  roster_seeded: "admin.roster_seeded",
  config_changed: "admin.config_changed",
} as const;

export type AuditKind = (typeof AUDIT_KINDS)[keyof typeof AUDIT_KINDS];

export interface AuditEntry {
  kind: AuditKind;
  /** The thing acted on: a case id, user id, application id. */
  refId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  /** Short human summary, in the language the officer reads. */
  detail?: string | null;
  /** Why it happened — required in practice for anything adverse. */
  reason?: string | null;
}

function rid(): string {
  return `AUD-${crypto.randomUUID()}`;
}

export async function writeAudit(db: D1Database, entry: AuditEntry): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO audit_log (id, kind, ref_id, actor_id, actor_role, detail, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        rid(),
        entry.kind,
        entry.refId ?? null,
        entry.actorId ?? null,
        entry.actorRole ?? null,
        entry.detail ?? null,
        entry.reason ?? null,
      )
      .run();
  } catch (err) {
    // Deliberately swallowed. A missing audit line must not cost someone their case.
    console.error("[audit] write failed", entry.kind, err);
  }
}

/** Writes several entries where an operation produces more than one fact. */
export async function writeAuditBatch(db: D1Database, entries: AuditEntry[]): Promise<void> {
  for (const entry of entries) await writeAudit(db, entry);
}

export interface AuditRow {
  id: string;
  kind: string;
  refId: string | null;
  actorId: string | null;
  actorRole: string | null;
  detail: string | null;
  reason: string | null;
  at: string;
  /** Joined for display. */
  actorName: string | null;
  refLabel: string | null;
}

export interface AuditQuery {
  kind?: string;
  actorId?: string;
  refId?: string;
  since?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Reads the trail. `detail` is searched as well as the ids, because an officer
 * remembers "the cyber case" and not `CASE-8da105ce…`.
 */
export async function queryAudit(db: D1Database, q: AuditQuery): Promise<AuditRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (q.kind) {
    where.push("l.kind = ?");
    binds.push(q.kind);
  }
  if (q.actorId) {
    where.push("l.actor_id = ?");
    binds.push(q.actorId);
  }
  if (q.refId) {
    where.push("l.ref_id = ?");
    binds.push(q.refId);
  }
  if (q.since) {
    where.push("l.at >= ?");
    binds.push(q.since);
  }
  if (q.search) {
    where.push("(l.detail LIKE ? OR l.ref_id LIKE ? OR l.reason LIKE ? OR u.display_name LIKE ?)");
    const like = `%${q.search}%`;
    binds.push(like, like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 500);
  const offset = Math.max(q.offset ?? 0, 0);

  const result = await db
    .prepare(
      `SELECT l.id, l.kind, l.ref_id, l.actor_id, l.actor_role, l.detail, l.reason, l.at,
              u.display_name AS actor_name,
              COALESCE(c.docket_id, a.id) AS ref_label
       FROM audit_log l
       LEFT JOIN users u ON u.id = l.actor_id
       LEFT JOIN cases c ON c.id = l.ref_id
       LEFT JOIN applications a ON a.id = l.ref_id
       ${clause}
       ORDER BY l.at DESC, l.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...binds, limit, offset)
    .all<{
      id: string;
      kind: string;
      ref_id: string | null;
      actor_id: string | null;
      actor_role: string | null;
      detail: string | null;
      reason: string | null;
      at: string;
      actor_name: string | null;
      ref_label: string | null;
    }>();

  return (result.results ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    refId: r.ref_id,
    actorId: r.actor_id,
    actorRole: r.actor_role,
    detail: r.detail,
    reason: r.reason,
    at: r.at,
    actorName: r.actor_name,
    refLabel: r.ref_label,
  }));
}

/** Counts per kind, for the dashboard's summary tiles. */
export async function auditCounts(db: D1Database, since?: string): Promise<Record<string, number>> {
  const result = await db
    .prepare(
      `SELECT kind, COUNT(*) AS n FROM audit_log
       ${since ? "WHERE at >= ?" : ""}
       GROUP BY kind ORDER BY n DESC`,
    )
    .bind(...(since ? [since] : []))
    .all<{ kind: string; n: number }>();
  const out: Record<string, number> = {};
  for (const r of result.results ?? []) out[r.kind] = Number(r.n);
  return out;
}
