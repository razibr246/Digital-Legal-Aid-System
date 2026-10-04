/**
 * Audit trail for anything that gates access or money.
 *
 * The guide's checklist item 5 is the one most easily skipped and the most
 * expensive to retrofit: "sensitive-case opens, ID verification methods,
 * AI-assist overrides, misconduct actions, payment decisions, message sends
 * (including blocked/delayed safe-contact attempts) — all need an immutable log
 * entry, not just a state flag."
 *
 * `sensitive: true` rows hide the applicant's name behind a lock. Opening one
 * requires confirming that the access will be logged, and that the applicant may
 * request that log. That is a legal exposure, so it is modelled as a first-class
 * record with its own append-only API rather than a flag on the case.
 */

export type AuditKind =
  | "sensitive_case_opened"
  | "identity_verified"
  | "assist_overridden"
  | "assist_accepted"
  | "application_accepted"
  | "application_rejected"
  | "payment_approved"
  | "payment_rejected"
  | "misconduct_actioned"
  | "message_sent"
  | "message_blocked"
  | "message_delayed"
  | "transfer_accepted"
  | "transfer_returned"
  | "settlement_certified"
  | "lawyer_changed";

export interface AuditEntry {
  id: string;
  kind: AuditKind;
  /** What it happened to: a case id, application id, payment id, etc. */
  refId: string;
  /** Who did it. */
  actorId: string;
  actorRole: string;
  /** When, ISO-8601. */
  at: string;
  /** What they were allowed to see or do, when the kind gates access. */
  detail?: string;
  /** Stated reason, required for terminal or overriding actions. */
  reason?: string;
}

export function createAuditEntry(
  input: Omit<AuditEntry, "id" | "at"> & { at?: string; now?: Date },
): AuditEntry {
  const { now, at, ...rest } = input;
  return {
    ...rest,
    id: `AUD-${input.refId}-${input.kind}-${(now ?? new Date()).getTime()}`,
    at: at ?? (now ?? new Date()).toISOString(),
  };
}

/**
 * Safe-contact rules. A GBV survivor's number is often the abuser's phone, so the
 * guide requires per-channel send permission with a *stated reason*, and every
 * attempt — including the blocked and delayed ones — to be logged.
 */
export type Channel = "sms" | "voice" | "portal" | "rep";
export type SendRule = "allow" | "window" | "block";

export interface SafeContactDestination {
  channel: Channel;
  /** Whose phone it is, e.g. "আবেদনকারীর নম্বর". */
  kindBn: string;
  toBn: string;
  rule: SendRule;
  /** Why this rule — the guide requires the reason to be shown, not implied. */
  whyBn: string;
}

export interface SafeContactProfile {
  ref: string;
  /** Elevated risk: name hidden in lists, opens audited. */
  riskHigh: boolean;
  /** Only neutral channels (portal, in person) may be used. */
  neutralOnly: boolean;
  /** Safe calling window, when one is declared. */
  windowBn?: string;
  destinations: SafeContactDestination[];
}

export interface SendDecision {
  allowed: boolean;
  rule: SendRule;
  whyBn: string;
  destination?: SafeContactDestination;
  /** True when the send must wait for the declared window rather than be refused. */
  deferred: boolean;
}

/**
 * The single decision point for "may we contact this applicant on this channel?".
 * Every screen that sends anything must go through this — that is the only way the
 * blocked-attempt log stays complete.
 */
export function decideSend(
  profile: SafeContactProfile | null | undefined,
  channel: Channel,
): SendDecision {
  if (!profile) {
    // No profile recorded: fail closed rather than risk messaging an abuser's phone.
    return { allowed: false, rule: "block", whyBn: "নিরাপদ যোগাযোগের প্রোফাইল নেই।", deferred: false };
  }
  const dest = profile.destinations.find((d) => d.channel === channel);
  if (!dest) {
    return { allowed: false, rule: "block", whyBn: "এই মাধ্যমে যোগাযোগের অনুমতি নেই।", deferred: false };
  }
  if (dest.rule === "block") {
    return { allowed: false, rule: "block", whyBn: dest.whyBn, destination: dest, deferred: false };
  }
  if (profile.neutralOnly && (channel === "sms" || channel === "voice")) {
    return { allowed: false, rule: "block", whyBn: "উচ্চ ঝুঁকি প্রোফাইল — কেবল নিরপেক্ষ মাধ্যম।", destination: dest, deferred: false };
  }
  if (dest.rule === "window") {
    return { allowed: true, rule: "window", whyBn: dest.whyBn, destination: dest, deferred: true };
  }
  return { allowed: true, rule: "allow", whyBn: dest.whyBn, destination: dest, deferred: false };
}

/** Copy the confirmation dialog must state, per the guide. */
export function sensitiveOpenNotice(actorName: string, caseId: string): { en: string; bn: string } {
  return {
    en: `Opening this sensitive case is recorded against your name (${actorName}), with the time and case number ${caseId}. The applicant may request a copy of that access log.`,
    bn: `এই সংবেদনশীল কেসটি খোলা আপনার নামে (${actorName}), সময় ও কেস নম্বর ${caseId} সহ রেকর্ড করা হবে। আবেদনকারী চাইলে ওই অ্যাক্সেস লগের একটি অনুলিপি পেতে পারবেন।`,
  };
}

/** The AI queue assist only ever ranks. It can never decide eligibility. */
export function assistVerdict(level: "high" | "normal"): { level: "high" | "normal"; ranksOnly: true } {
  return { level, ranksOnly: true };
}
