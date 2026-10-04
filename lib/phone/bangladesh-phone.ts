export type BangladeshOperator = "Grameenphone" | "Robi" | "Banglalink" | "Airtel" | "Robi/Airtel" | "Unknown";

export interface PhoneValidationResult {
  valid: boolean;
  normalized: string;
  operator: BangladeshOperator | null;
  reasonBn: string | null;
}

const OPERATOR_PREFIXES: Array<{ prefix: string; operator: BangladeshOperator }> = [
  { prefix: "013", operator: "Grameenphone" },
  { prefix: "017", operator: "Grameenphone" },
  { prefix: "018", operator: "Robi" },
  { prefix: "016", operator: "Robi/Airtel" },
  { prefix: "019", operator: "Banglalink" },
  { prefix: "014", operator: "Banglalink" },
  { prefix: "015", operator: "Airtel" },
];

export function normalizeBengaliDigits(input: string): string {
  return input.replace(/[০-৯]/g, (digit) => String("০১২৩৪৫৬৭৮৯".indexOf(digit)));
}

export function extractPhoneDigits(input: string): string {
  return normalizeBengaliDigits(input).replace(/\D/g, "");
}

export function appendPhoneDigits(current: string, input: string): string {
  return `${current}${extractPhoneDigits(input)}`.slice(0, 11);
}

export function normalizeBangladeshPhone(input: string): string {
  let digits = extractPhoneDigits(input);
  if (digits.startsWith("880") && digits.length === 13) digits = digits.slice(3);
  return digits;
}

export function getBangladeshOperator(phone: string): BangladeshOperator | null {
  const normalized = normalizeBangladeshPhone(phone);
  if (!/^01[3-9]\d{8}$/.test(normalized)) return null;
  return OPERATOR_PREFIXES.find(({ prefix }) => normalized.startsWith(prefix))?.operator || "Unknown";
}

export function generateRandomBangladeshPhone(): string {
  const operatorPrefix =
    OPERATOR_PREFIXES[Math.floor(Math.random() * OPERATOR_PREFIXES.length)]?.prefix || "017";
  const subscriberDigits = Array.from(
    { length: 8 },
    () => Math.floor(Math.random() * 10),
  ).join("");
  return `${operatorPrefix}${subscriberDigits}`;
}


export function validateBangladeshPhone(input: string): PhoneValidationResult {
  const normalized = normalizeBangladeshPhone(input);
  if (!/^\d{11}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      operator: null,
      reasonBn: "ফোন নম্বরটি ১১ সংখ্যার হতে হবে।",
    };
  }
  if (!/^01[3-9]\d{8}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      operator: null,
      reasonBn: "এটি বাংলাদেশের মোবাইল নম্বর হিসেবে শুরু হচ্ছে না। ০১ দিয়ে শুরু করুন।",
    };
  }
  const operator = getBangladeshOperator(normalized);
  if (!operator) {
    return {
      valid: false,
      normalized,
      operator: null,
      reasonBn: "বাংলাদেশের মোবাইল অপারেটরের প্রিফিক্স মিলছে না।",
    };
  }
  return { valid: true, normalized, operator, reasonBn: null };
}
