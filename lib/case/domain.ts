/**
 * Case domain — the part every dashboard reads from.
 *
 * The guide is explicit that the two things worth carrying over are (a) one shared
 * store modelled before any screen, and (b) business rules living in ONE pure
 * function rather than re-derived per screen. This file is (b): `caseActionState`
 * is the single answer to "which case actions are legal right now", and `slaScan`
 * is the single answer to "what is overdue".
 *
 * Deliberately dependency-free and pure. No React, no D1, no fetch. That is what
 * makes the rules testable without a browser and reusable from an API route, a
 * server component, or a client component without caring which.
 */

// ---------------------------------------------------------------------------
// Lifecycle

export const CASE_STATUSES = [
  "submitted",
  "review",
  "mediation",
  "lawyer",
  "court",
  "settled",
  "unresolved",
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

/** Terminal states: no case action is legal once a case is closed. */
export const TERMINAL_STATUSES: readonly CaseStatus[] = ["settled", "unresolved"];

export function isClosed(status: CaseStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Plain-language labels for the citizen. Never show a citizen an internal code. */
export const CITIZEN_STATUS_LABELS: Record<CaseStatus, { bn: string; en: string }> = {
  submitted: { bn: "জমা হয়েছে", en: "Submitted" },
  review: { bn: "পর্যালোচনাধীন", en: "Under review" },
  mediation: { bn: "মধ্যস্থতা নির্ধারিত", en: "Mediation scheduled" },
  lawyer: { bn: "আইনজীবী নিয়োগ হয়েছে", en: "Lawyer assigned" },
  court: { bn: "আদালতে চলছে", en: "In court" },
  settled: { bn: "সমাধা হয়েছে", en: "Closed — settled" },
  unresolved: { bn: "সমাধা হয়নি", en: "Closed — unresolved" },
};

// ---------------------------------------------------------------------------
// Tracks

/**
 * Appellate (sclao) and Labour (labour) tracks skip mediation entirely, and their
 * lawyer gate is an eligibility check rather than a failed mediation. Per the
 * guide these roles must NOT inherit a district persona.
 */
export type CaseTrack = "district" | "appellate" | "labour" | "chowki";

export function trackForRole(role: string): CaseTrack {
  if (role === "sclao") return "appellate";
  if (role === "labour") return "labour";
  if (role === "chowki") return "chowki";
  return "district";
}

/** Only appellate and labour skip mediation. */
export function trackSkipsMediation(track: CaseTrack): boolean {
  return track === "appellate" || track === "labour";
}

// ---------------------------------------------------------------------------
// The facts a case carries that the rules depend on

export interface CaseFacts {
  status: CaseStatus;
  track: CaseTrack;
  /** District code, e.g. "d25". Checked against the mandatory-mediation list. */
  districtCode: string;
  /** Any mediation attempt recorded, with its outcome. */
  mediations: Array<{ date: string; outcome?: "scheduled" | "settled" | "failed" }>;
  /** True once a lawyer is on the case. */
  lawyerAssigned: boolean;
  /** The applicant escalated after mediation (asked for a lawyer). */
  lawyerRequested: boolean;
  /** Eligibility check, required in lieu of mediation on appellate/labour. */
  eligibilityPassed?: boolean;
  /** A payment request is already in flight. */
  paymentPending?: boolean;
  /** The payment would be for a Special Mediator. */
  forMediator?: boolean;
  /** That mediator has accepted the case. */
  mediatorAccepted?: boolean;
  /** A jurisdiction transfer is already in flight. */
  transferPending?: boolean;
}

export type ActionKey = "advise" | "mediation" | "assignLawyer" | "referOut" | "requestPay" | "transfer";

export interface ActionVerdict {
  ok: boolean;
  /** Machine-readable rule key. Stable, so screens and tests can branch on it. */
  reason: string;
  /** Optional Bangla sentence for the UI. Screens should not invent their own. */
  noteBn?: string;
}

export type CaseActionState = Record<ActionKey, ActionVerdict>;

const ALLOWED = (reason = "allowed"): ActionVerdict => ({ ok: true, reason });
const BLOCKED = (reason: string, noteBn?: string): ActionVerdict => ({ ok: false, reason, noteBn });

/**
 * THE canonical rule set. Every "can I do X yet?" question in every dashboard must
 * call this rather than re-deriving the rule — that centralisation is the single
 * most valuable architectural property in the guide.
 */
export function caseActionState(facts: CaseFacts, mandatoryDistricts: readonly string[] = []): CaseActionState {
  const closed = isClosed(facts.status);
  const skipMediation = trackSkipsMediation(facts.track);
  const lastMediation = facts.mediations[facts.mediations.length - 1];
  const anyMediation = facts.mediations.length > 0;
  const mediationSettled = lastMediation?.outcome === "settled";
  const mediationFailed = lastMediation?.outcome === "failed";
  const workStarted = anyMediation || facts.lawyerAssigned;

  if (closed) {
    const all = BLOCKED("closed", "কেসটি বন্ধ, আর কোনো কাজ করা যাবে না।");
    return { advise: all, mediation: all, assignLawyer: all, referOut: all, requestPay: all, transfer: all };
  }

  // ---- Advise (queue/AI-assist priority) is always legal; it only ranks.
  const advise = ALLOWED();

  // ---- Mediation
  let mediation: ActionVerdict;
  if (facts.status === "mediation") {
    mediation = BLOCKED("inMediation", "মধ্যস্থতা ইতিমধ্যে নির্ধারিত।");
  } else if (skipMediation) {
    mediation = BLOCKED("trackSkips", "এই ট্র্যাকে মধ্যস্থতা প্রযোজ্য নয়।");
  } else if (mediationSettled) {
    mediation = BLOCKED("alreadySettled", "মধ্যস্থতায় ইতিমধ্যে সমধান হয়েছে।");
  } else {
    mediation = ALLOWED();
  }

  // ---- Assign a lawyer
  let assignLawyer: ActionVerdict;
  if (facts.lawyerAssigned) {
    assignLawyer = BLOCKED("lawyerAlready", "আইনজীবী ইতিমধ্যে নিয়োগ করা হয়েছে।");
  } else if (skipMediation) {
    // Appellate/labour substitute the eligibility check for a failed mediation.
    assignLawyer = facts.eligibilityPassed
      ? ALLOWED()
      : BLOCKED("needEligibility", "আগে যোগ্যতা যাচাই সম্পন্ন করতে হবে।");
  } else if (mandatoryDistricts.includes(facts.districtCode) && !anyMediation) {
    // Mandatory-mediation district: mediation must be attempted before a lawyer.
    assignLawyer = BLOCKED("mandatory", "এই জেলায় আগে মধ্যস্থতা করা বাধ্যতামূলক।");
  } else if (mediationSettled) {
    assignLawyer = BLOCKED("settled", "মধ্যস্থতায় সমাধান হওয়ায় আইনজীবী প্রয়োজন নেই।");
  } else if (anyMediation && !mediationFailed) {
    // Mediation is in progress and has not failed — the applicant has not escalated.
    assignLawyer = BLOCKED("medLate", "মধ্যস্থতা বাকি আছে, আবেদনকারীর আইনজীবী চাওয়ার অনুরোধ দেখা যাচ্ছে না।");
  } else if (mediationFailed && !facts.lawyerRequested) {
    assignLawyer = BLOCKED("needFailedMed", "মধ্যস্থতা ব্যর্থ হয়েছে; আবেদনকারীর অনুরোধের জন্য অপেক্ষা করছে।");
  } else {
    assignLawyer = ALLOWED();
  }

  // ---- Refer out to another office. Legal at any point before a case closes;
  // the transfer *request* has its own narrower rule below.
  const referOut = ALLOWED();

  // ---- Request a payment
  let requestPay: ActionVerdict;
  if (facts.paymentPending) {
    requestPay = BLOCKED("pending", "একটি পেমেন্ট অনুরোধ ইতিমধ্যে বিচারাধীন আছে।");
  } else if (!mediationSettled && !facts.lawyerAssigned) {
    requestPay = BLOCKED("nothingBillable", "এখনো কোনো বিলযোগ্য কাজ হয়নি।");
  } else if (facts.forMediator && !facts.mediatorAccepted) {
    // Special Mediators are not paid for merely being asked.
    requestPay = BLOCKED("medNotAccepted", "মধ্যস্থতাকারী কেসটি গ্রহণ করার আগে হনোরারিয়াম প্রযোজ্য নয়।");
  } else {
    requestPay = ALLOWED();
  }

  // ---- Transfer jurisdiction. Only before any work has started.
  let transfer: ActionVerdict;
  if (facts.transferPending) {
    transfer = BLOCKED("transferPending", "একটি হস্তান্তর অনুরোধ ইতিমধ্যে বিচারাধীন আছে।");
  } else if (workStarted) {
    transfer = BLOCKED("workStarted", "কাজ শুরু হয়ে গেছে, এখন হস্তান্তর করা যাবে না।");
  } else {
    transfer = ALLOWED();
  }

  return { advise, mediation, assignLawyer, referOut, requestPay, transfer };
}

/** Convenience: the subset a case *list* row needs to render an action button. */
export function isCaseActionable(facts: CaseFacts, key: ActionKey, mandatory?: readonly string[]): boolean {
  return caseActionState(facts, mandatory)[key].ok;
}

// ---------------------------------------------------------------------------
// SLA

export interface SlaStageDefinition {
  stage: "review" | "mediation" | "payment";
  limitDays: number;
  /** Days-before-limit at which the badge turns amber. */
  warnDays: number;
  role: "dlao" | "chief";
  labelBn: string;
  labelEn: string;
  /** Mediation may be extended by this many days once. */
  extendableBy?: number;
}

export const SLA_STAGES: SlaStageDefinition[] = [
  { stage: "review", limitDays: 15, warnDays: 3, role: "dlao", labelBn: "পর্যালোচনা", labelEn: "Review" },
  {
    stage: "mediation",
    limitDays: 60,
    warnDays: 10,
    role: "dlao",
    labelBn: "মধ্যস্থতা",
    labelEn: "Mediation",
    extendableBy: 30,
  },
  { stage: "payment", limitDays: 10, warnDays: 2, role: "chief", labelBn: "পেমেন্ট অনুমোদন", labelEn: "Payment approval" },
];

export function slaStage(stage: SlaStageDefinition["stage"]): SlaStageDefinition {
  const found = SLA_STAGES.find((s) => s.stage === stage);
  if (!found) throw new Error(`Unknown SLA stage: ${stage}`);
  return found;
}

export type SlaLevel = "ok" | "near" | "breach";

export interface SlaAssessment {
  level: SlaLevel;
  ageDays: number;
  limitDays: number;
  warnDays: number;
  remainingDays: number;
  /** True once an extension has been applied and the base limit no longer binds. */
  extended: boolean;
}

export function assessSla(
  stage: SlaStageDefinition["stage"],
  ageDays: number,
  extensionDays = 0,
): SlaAssessment {
  const def = slaStage(stage);
  const allowedExtension = def.extendableBy ?? 0;
  const applied = Math.min(Math.max(0, extensionDays), allowedExtension);
  const effectiveLimit = def.limitDays + applied;
  const remainingDays = effectiveLimit - ageDays;
  const level: SlaLevel = remainingDays < 0 ? "breach" : remainingDays <= def.warnDays ? "near" : "ok";
  return {
    level,
    ageDays,
    limitDays: effectiveLimit,
    warnDays: def.warnDays,
    remainingDays,
    extended: applied > 0,
  };
}

/**
 * The generic case-table colour rule from the guide: amber at 14 days, red at 30.
 * Mediation ages against its own 60/90-day timeline instead.
 */
export function daysInStageTone(days: number, stage?: SlaStageDefinition["stage"]): SlaLevel {
  if (stage === "mediation") {
    return days >= 90 ? "breach" : days >= 60 ? "near" : "ok";
  }
  if (days >= 30) return "breach";
  if (days >= 14) return "near";
  return "ok";
}

/**
 * Computed once per load and then written as permanent notifications — the guide is
 * emphatic that badges count log rows rather than recomputing per render, so a case
 * that breached while nobody was looking still shows as breached.
 */
export interface SlaCandidate {
  ref: string;
  caseId: string;
  stage: SlaStageDefinition["stage"];
  ageDays: number;
  extensionDays?: number;
}

export interface SlaLogEntry extends SlaCandidate {
  id: string;
  level: Exclude<SlaLevel, "ok">;
  role: "dlao" | "chief";
  at: string;
}

export function slaScan(candidates: readonly SlaCandidate[], now: Date = new Date()): SlaLogEntry[] {
  const entries: SlaLogEntry[] = [];
  for (const c of candidates) {
    const a = assessSla(c.stage, c.ageDays, c.extensionDays ?? 0);
    if (a.level === "ok") continue;
    entries.push({
      ...c,
      id: `SLA-${c.caseId}-${c.stage}`,
      level: a.level,
      role: slaStage(c.stage).role,
      at: now.toISOString(),
    });
  }
  return entries;
}

export interface SlaAlerts {
  near: number;
  breach: number;
  total: number;
  items: SlaLogEntry[];
}

export function slaAlerts(log: readonly SlaLogEntry[], role?: "dlao" | "chief"): SlaAlerts {
  const scoped = role ? log.filter((e) => e.role === role) : log;
  const near = scoped.filter((e) => e.level === "near").length;
  const breach = scoped.filter((e) => e.level === "breach").length;
  return { near, breach, total: near + breach, items: [...scoped] };
}

// ---------------------------------------------------------------------------
// Mandatory mediation districts — configuration, not code.

export const DEFAULT_MANDATORY_DISTRICTS: readonly string[] = [
  "d3", "d5", "d8", "d11", "d14", "d17", "d19", "d22", "d25", "d28",
  "d31", "d34", "d37", "d40", "d43", "d46", "d49", "d52", "d56", "d61",
];

export function isMandatoryDistrict(code: string, list: readonly string[] = DEFAULT_MANDATORY_DISTRICTS): boolean {
  return list.includes(code);
}

// ---------------------------------------------------------------------------
// Application → Case graduation. The guide is strict that an application is not a
// case until acceptApp, and that nothing may leak it into counts before then.

export function caseIdFor(districtCode: string, year: number, serial: number): string {
  return `DLAS-${districtCode.toUpperCase()}-${year}-${String(serial).padStart(5, "0")}`;
}

export function applicationToCase(app: { appId: string; districtCode: string }, year = new Date().getFullYear()): string {
  const serial = Number(app.appId.replace(/\D/g, "").slice(-5) || 1);
  return caseIdFor(app.districtCode, year, serial);
}

// ---------------------------------------------------------------------------
// Settlement certification: all three parties must e-sign before the Chief acts.

/**
 * The certification gate: all three parties must have signed.
 *
 * Applicant, the opposite party and the mediator — three, not two. The signature check
 * originally took two booleans, which let a settlement through with the counterparty or
 * the mediator still unsigned, and a certified settlement is a court decree waiting to
 * happen. `settlements` stores all three, so the rule now reads all three.
 */
export function certificationState(
  signedA: boolean,
  signedB: boolean,
  signedC: boolean,
  certified: boolean,
): ActionVerdict {
  if (certified) return BLOCKED("alreadyCertified", "ইতিমধ্যে প্রত্যায়িত।");
  if (!signedA || !signedB || !signedC) {
    const outstanding = [
      !signedA ? "আবেদনকারী" : null,
      !signedB ? "বিপরীত পক্ষ" : null,
      !signedC ? "মধ্যস্থতাকারী" : null,
    ].filter(Boolean);
    return BLOCKED(
      "unsigned",
      `সব পক্ষ স্বাক্ষর করার আগে প্রত্যায়ন করা যাবে না। বাকি: ${outstanding.join(", ")}।`,
    );
  }
  return ALLOWED();
}
