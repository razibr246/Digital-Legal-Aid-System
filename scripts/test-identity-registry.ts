/**
 * Unit checks for the simulated identity registry.
 *
 * These are pure functions, so they are asserted directly rather than through
 * the browser. The regression this guards against: the Bangla name used to be
 * built from the given name plus the FATHER's name, which produced a merged
 * "নাসরিন ইব্রাহিম" that never matched the Latin "Nasrin Akter" and so failed
 * the name check on every verification.
 */
import { compareNames } from "../lib/identity/identity";
import { simulateRegistryLookup } from "../lib/identity/lookup";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? `  ${detail}` : ""}`);
  }
}

const FATHER_TOKENS = ["আব্দুল করিম", "ইব্রাহিম", "আব্দুল হাকিম", "আনোয়ার হোসেন", "রফিকুল"];
const SURNAMES = ["বেগম", "ইসলাম", "আক্তার", "খাতুন", "সুলতানা", "হক", "চৌধুরী", "রহমান"];

const numbers: string[] = [];
for (let i = 0; i < 400; i += 1) numbers.push(String(1000000000 + i * 7919));

for (const documentNumber of numbers) {
  const record = simulateRegistryLookup("nid", documentNumber);
  const nameBnParts = record.nameBn.split(/\s+/);
  const nameEnParts = record.nameEn.split(/\s+/);
  const surnameBn = nameBnParts[nameBnParts.length - 1];

  check("Bangla name is a given name plus a surname", nameBnParts.length === 2, record.nameBn);
  check("Latin name is a given name plus a surname", nameEnParts.length === 2, record.nameEn);
  check("Bangla surname is a real surname", SURNAMES.includes(surnameBn), `${record.nameBn}`);
  check(
    "Bangla name does not splice in the father's name",
    !FATHER_TOKENS.some((token) => record.nameEn.includes(token) || record.nameBn.includes(token)),
    `nameBn=${record.nameBn} father=${record.fatherName}`,
  );
  check("mother's name is not part of the name", !record.nameBn.includes(record.motherName.split(/\s+/)[0]), record.nameBn);
  check("Latin name matches itself", compareNames(record.nameEn, [record.nameEn, record.nameBn]).match, record.nameEn);
  check("Bangla name matches itself", compareNames(record.nameBn, [record.nameEn, record.nameBn]).match, record.nameBn);
}

// The reported case: 1234567890 derived "নাসরিন ইব্রাহিম" and then failed.
const reported = simulateRegistryLookup("nid", "1234567890");
check("reported NID no longer yields a merged name", reported.nameBn !== "নাসরিন ইব্রাহিম", reported.nameBn);
check("reported NID agrees across scripts", compareNames(reported.nameEn, [reported.nameEn, reported.nameBn]).match, `${reported.nameEn} / ${reported.nameBn}`);

// A typed name in either script must clear verification.
const typedLatin = compareNames("Nasrin Akter", [reported.nameEn, reported.nameBn]);
const typedBangla = compareNames("নাসরিন আক্তার", [reported.nameEn, reported.nameBn]);
check("typed Latin name verifies", typedLatin.match, typedLatin.detail);
check("typed Bangla name verifies", typedBangla.match, typedBangla.detail);

console.log(failed === 0 ? "\nAll identity registry checks passed" : `\n${failed} checks FAILED`);
if (failed) process.exit(1);
