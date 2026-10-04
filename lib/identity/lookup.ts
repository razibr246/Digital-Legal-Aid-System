import { normalizeDigits, type DocumentType } from "./identity";

/**
 * SIMULATED registry lookup.
 *
 * There is no connection to any government database. A deterministic record is
 * derived from the document number so the flow is reproducible and testable.
 * Every response is flagged `simulated: true` and must be confirmed by a human
 * DLAO officer before it is treated as proof of identity.
 */
export interface SimulatedRegistryRecord {
  documentType: DocumentType;
  documentNumber: string;
  nameEn: string;
  nameBn: string;
  fatherName: string;
  motherName: string;
  dateOfBirth: string;
  address: string;
  confidence: number;
  simulated: true;
  source: "simulated";
}

const FIRST_EN = ["Rumana", "Shahana", "Nasrin", "Rehana", "Farida", "Shirin", "Maliha", "Tania"];
const LAST_EN = ["Begum", "Islam", "Akter", "Khatun", "Sultana", "Haque", "Chowdhury", "Rahman"];
const FIRST_BN = ["রুমানা", "শাহানা", "নাসরিন", "রেহানা", "ফরিদা", "শিরিন", "মালিহা", "তানিয়া"];
// Same surnames as LAST_EN, in the same order. The Bangla name must be the same
// person as the Latin one, so both are built from one index. Deriving the Bangla
// name from the father's name instead produced a first+father mash that read as
// a merged name and could never match the Latin form.
const LAST_BN = ["বেগম", "ইসলাম", "আক্তার", "খাতুন", "সুলতানা", "হক", "চৌধুরী", "রহমান"];
const FATHER_BN = ["আব্দুল করিম", "মোঃ ইব্রাহিম", "আব্দুল হাকিম", "আনোয়ার হোসেন", "মোঃ রফিকুল"];
const MOTHER_BN = ["সালমা বেগম", "রহিমা খাতুন", "নাজমা সুলতানা", "ফাতেমা খান", "রহিমা বেগম"];
const DISTRICT_BN = ["চট্টগ্রাম সদর", "ঢাকা সদর", "রাজশাহী সদর", "খুলনা সদর", "সিলেট সদর"];

function hash(value: string): number {
  let out = 0;
  for (let i = 0; i < value.length; i += 1) {
    out = (out * 31 + value.charCodeAt(i)) % 1000003;
  }
  return out;
}

export function simulateRegistryLookup(
  documentType: DocumentType,
  documentNumber: string,
): SimulatedRegistryRecord {
  const seed = hash(`${documentType}:${documentNumber}`);
  const firstIdx = seed % FIRST_EN.length;
  const lastIdx = (seed >> 3) % LAST_EN.length;
  const fatherIdx = (seed >> 7) % FATHER_BN.length;
  const motherIdx = (seed >> 13) % MOTHER_BN.length;
  const districtIdx = (seed >> 11) % DISTRICT_BN.length;

  const year = 1970 + (seed % 30);
  const month = 1 + ((seed >> 5) % 12);
  const day = 1 + ((seed >> 9) % 28);

  return {
    documentType,
    documentNumber,
    nameEn: `${FIRST_EN[firstIdx]} ${LAST_EN[lastIdx]}`,
    nameBn: `${FIRST_BN[firstIdx]} ${LAST_BN[lastIdx]}`,
    fatherName: FATHER_BN[fatherIdx],
    motherName: MOTHER_BN[motherIdx],
    dateOfBirth: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    address: DISTRICT_BN[districtIdx],
    confidence: 0.72 + ((seed % 20) / 100),
    simulated: true,
    source: "simulated",
  };
}

export function normalizeNidForLookup(value: string): string {
  return normalizeDigits(value);
}
