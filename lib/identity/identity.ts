export type DocumentType = "nid" | "passport";
export type VerificationMethod = "number" | "photo";
export type VerificationStatus = "verified" | "review" | "rejected";

export interface ExtractedIdentity {
  documentType: DocumentType | "unknown";
  documentNumber: string | null;
  nameEn: string | null;
  nameBn: string | null;
  fatherName: string | null;
  motherName: string | null;
  dateOfBirth: string | null;
  address: string | null;
  confidence: number;
  isReadable: boolean;
}

export interface IdentityVerificationRecord {
  id: string;
  method: VerificationMethod;
  documentType: DocumentType;
  documentNumberMasked: string;
  /** Full number, returned only to the owner and revealed on request. */
  documentNumber?: string | null;
  nameEn: string | null;
  nameBn: string | null;
  fatherName: string | null;
  motherName: string | null;
  dateOfBirth: string | null;
  address: string | null;
  ocrConfidence: number | null;
  ocrEngine: string | null;
  ocrModel: string | null;
  source: string;
  simulated: boolean;
  status: VerificationStatus;
  nameMatch: boolean | null;
  /** False when a photo OCR produced a number that fails format validation. */
  documentNumberValid: boolean;
  /** True when the profile name was just set from the document. */
  nameUpdatedFromDocument: boolean;
  profileName: string;
  nameMismatchDetail: string | null;
  createdAt: string;
  /** Set once the citizen explicitly saves the result. */
  acceptedAt: string | null;
  acceptedDisplayName: string | null;
}

export const OCR_ENGINE = "deepinfra";
export const OCR_MODEL = "Qwen/Qwen3-VL-30B-A3B-Instruct";

/** Bangladesh NID: 10, 13 or 17 digits. */
export function isValidNid(value: string): boolean {
  return /^\d{10}$|^\d{13}$|^\d{17}$/.test(normalizeDigits(value));
}

/** Passport: 1-2 letters, optional separator, then 7-9 digits. */
export function isValidPassport(value: string): boolean {
  return /^[A-Za-z]{1,2}[\s-]?\d{7,9}$/.test(value.trim());
}

export function detectDocumentType(value: string): DocumentType | "unknown" {
  const trimmed = value.trim();
  if (isValidNid(trimmed)) return "nid";
  if (isValidPassport(trimmed)) return "passport";
  return "unknown";
}

/** Bangla and Arabic-Indic digits both appear on real documents. */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, "");
}

export function maskDocumentNumber(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return trimmed;
  return `${"•".repeat(Math.max(0, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

/**
 * Compares the profile name against the document name. Bangla and Latin names
 * are compared independently because a card often prints one script while the
 * portal stores the other, and a match in either is a match.
 */
export function compareNames(
  profileName: string | null | undefined,
  documentNames: Array<string | null | undefined>,
): { match: boolean; matchedOn: string | null; detail: string } {
  const profile = (profileName ?? "").trim();
  if (!profile) return { match: false, matchedOn: null, detail: "প্রোফাইলে নাম নেই" };

  const normalizeLatin = (s: string) =>
    s
      .toLowerCase()
      .replace(/[.,\u2019'`]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const normalizeBangla = (s: string) =>
    s
      .replace(/[।\s]+/g, " ")
      .replace(/[a-zA-Z]/g, "")
      .trim();

  const candidates = documentNames.filter((n): n is string => Boolean(n && n.trim()));
  if (candidates.length === 0) {
    return { match: false, matchedOn: null, detail: "পত্রে নাম পড়া যায়নি" };
  }

  for (const candidate of candidates) {
    if (normalizeLatin(candidate) === normalizeLatin(profile)) {
      return { match: true, matchedOn: "latin", detail: "" };
    }
  }
  for (const candidate of candidates) {
    if (
      normalizeBangla(candidate).length >= 2 &&
      normalizeBangla(candidate) === normalizeBangla(profile)
    ) {
      return { match: true, matchedOn: "bangla", detail: "" };
    }
  }
  return {
    match: false,
    matchedOn: null,
    detail: `প্রোফাইলের নাম "${profile}" এবং পত্রের নাম "${candidates.filter(Boolean).join(" / ")}" মিলছে না`,
  };
}

/** Vision models like to wrap JSON in a code fence; pull out the object. */
export function parseModelJson<T>(raw: string): T | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export function normalizeExtraction(value: unknown): ExtractedIdentity | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const str = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const trimmed = v.trim();
    if (!trimmed || trimmed.toLowerCase() === "null" || trimmed.toLowerCase() === "unknown") return null;
    return trimmed;
  };
  const documentTypeRaw = str(raw.documentType)?.toLowerCase();
  const documentType: DocumentType | "unknown" =
    documentTypeRaw === "passport" ? "passport" : documentTypeRaw === "nid" ? "nid" : "unknown";

  const confidence = Number(raw.confidence);
  return {
    documentType,
    documentNumber: str(raw.documentNumber),
    nameEn: str(raw.nameEn),
    nameBn: str(raw.nameBn),
    fatherName: str(raw.fatherName),
    motherName: str(raw.motherName),
    dateOfBirth: str(raw.dateOfBirth),
    address: str(raw.address),
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    isReadable: raw.isReadable !== false,
  };
}

export const OCR_PROMPT = `You read Bangladesh identity documents (NID cards and passports). Extract every field and reply with ONLY a JSON object (no prose, no markdown fence) using exactly these keys:
{"documentType":"nid|passport|unknown","documentNumber":"","nameEn":"","nameBn":"","fatherName":"","motherName":"","dateOfBirth":"YYYY-MM-DD","address":"","confidence":0.0,"isReadable":true}
Rules:
- Copy values exactly as printed, including Bangla text.
- motherName is the MOTHER's name (মাতার নাম) and is required on NID cards. It is not the same as fatherName (পিতার নাম).
- address must be the complete printed address (ঠিকানা), including house, road and district.
- Use null for any field that is genuinely not visible.
- confidence is your own certainty between 0 and 1.`;
