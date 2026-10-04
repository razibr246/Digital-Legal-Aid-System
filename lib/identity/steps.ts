export type VerificationStepId = "document" | "face" | "signature";
export type VerificationStepStatus = "pending" | "complete";

export interface VerificationStepDefinition {
  id: VerificationStepId;
  order: number;
  titleBn: string;
  titleEn: string;
  descriptionBn: string;
  descriptionEn: string;
  href: string;
}

export interface VerificationStepState {
  id: VerificationStepId;
  status: VerificationStepStatus;
  completedAt: string | null;
  result: Record<string, unknown> | null;
}

export interface VerificationProgress {
  steps: VerificationStepState[];
  completed: number;
  total: number;
  percent: number;
  allComplete: boolean;
}

export const VERIFICATION_STEPS: VerificationStepDefinition[] = [
  {
    id: "document",
    order: 1,
    titleBn: "পরিচয়পত্র যাচাই",
    titleEn: "Verify NID / passport",
    descriptionBn: "জাতীয় পরিচয়পত্র বা পাসপোর্ট নম্বর দিন, অথবা পত্রের ছবি তুলে যাচাই করুন।",
    descriptionEn: "Submit an NID or passport number, or photograph the document.",
    href: "/citizen/verify",
  },
  {
    id: "face",
    order: 2,
    titleBn: "মুখ পরীক্ষা",
    titleEn: "Face check",
    descriptionBn: "পরিচয়পত্রের ছবির সাথে আপনার মুখ মিলিয়ে দেখা হবে।",
    descriptionEn: "Your face is compared against the photo on your document.",
    href: "/citizen/verify/face",
  },
  {
    id: "signature",
    order: 3,
    titleBn: "ই-স্বাক্ষর",
    titleEn: "E-signature",
    descriptionBn: "কাগজে স্বাক্ষর করার বদলে ডিজিটাল স্বাক্ষর দিন।",
    descriptionEn: "Draw and save your digital signature.",
    href: "/citizen/verify/signature",
  },
];

export function buildProgress(states: VerificationStepState[]): VerificationProgress {
  const byId = new Map(states.map((state) => [state.id, state]));
  const steps = VERIFICATION_STEPS.map(
    (definition) =>
      byId.get(definition.id) ?? {
        id: definition.id,
        status: "pending" as VerificationStepStatus,
        completedAt: null,
        result: null,
      },
  );
  const completed = steps.filter((step) => step.status === "complete").length;
  return {
    steps,
    completed,
    total: steps.length,
    percent: Math.round((completed / steps.length) * 100),
    allComplete: completed === steps.length,
  };
}

/** Marks a step complete. Idempotent so retries do not create duplicates. */
export function upsertStepStatement(
  env: { DB: { prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } } } },
  userId: string,
  step: VerificationStepId,
  result: Record<string, unknown>,
  source: "simulated" | "self_service" = "self_service",
) {
  return env.DB.prepare(
    `INSERT INTO verification_steps (id, user_id, step, status, result_json, source, completed_at, updated_at)
     VALUES (?1, ?2, ?3, 'complete', ?4, ?5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, step) DO UPDATE SET
       status = 'complete',
       result_json = excluded.result_json,
       source = excluded.source,
       completed_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(`VS-${crypto.randomUUID()}`, userId, step, JSON.stringify(result), source);
}
