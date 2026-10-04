/**
 * Generates a realistic panel-lawyer roster.
 *
 * The roster was five hand-written rows, which made the search box and the
 * recommendation look broken: there was nothing to search and no load to spread, so
 * "least loaded lawyer first" always answered "the same four people".
 *
 * The output is committed as migrations/0025_panel_roster.sql so the database is
 * reproducible, but it is generated rather than typed so it can be regenerated at a
 * larger size without hand-authoring rows. Deterministic by seed: the same seed always
 * produces the same roster, which matters because the rows are referenced by id from
 * assignments and a regenerated roster must not reshuffle live appointments.
 *
 *   npx tsx scripts/generate-panel-roster.ts            # write the migration
 *   npx tsx scripts/generate-panel-roster.ts --count 200
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BD_DISTRICTS } from "../lib/legal/districts";

function argValue(flag: string, fallback: number): number {
  // Explicitly, because the previous `||` chain treated argv[0] — the executable
  // path — as a value when the flag was absent, and Number("/path/to/tsx") is NaN.
  // That silently produced a zero-row roster rather than failing.
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) {
    const n = Number(process.argv[i + 1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const inline = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (inline) {
    const n = Number(inline.split("=")[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

const COUNT = Math.trunc(argValue("--count", 140));
if (!Number.isFinite(COUNT) || COUNT <= 0) {
  throw new Error(`--count did not parse; got ${JSON.stringify(COUNT)}`);
}

// Mulberry32: small, fast, and deterministic from a seed.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_M = ["আব্দুল", "মোহাম্মদ", "মো. ", "কামাল", "রফিক", "সাইফুল", "নাজিম", "শাহিন", "আরিফ", "তানভীর", "খালেক", "আনিস", "জাহাঙ্গীর", "রফতা", "সোহেল", "আশফাক", "মতিন", "শফিক", "বেলাল", "ওবায়দুর"];
const FIRST_F = ["ফাতেমা", "রহিমা", "সালমা", "নাসরিন", "শারমিন", "তাসনিম", "জান্নাত", "রুবিনা", "মেরিয়া", "আয়েশা", "নাজমা", "শারলা", "ফেরদৌস", "বেলি", "সাব্বিরা"];
const SURNAMES = ["খাতুন", "হাসান", "আহমেদ", "ইসলাম", "আক্তার", "রহমান", "সরকার", "মিয়া", "মোহাম্মদ", "বসু", "চৌধুরী", "মন্দির", "দাস", "তালুক", "বেগম", "উদ্দিন", "মিয়া"];

/**
 * Specialisation pools. Each maps onto one or more taxonomy categories so the
 * recommendation in lib/case/lawyer-recommendation.ts can actually match, and every
 * pool is a plausible real practice area.
 */
const POOLS = [
  { name: "সাইবার, ডিজিটাল নিরাপত্তা, তথ্য প্রযুক্তি", weight: 14 },
  { name: "ডিজিটাল নিরাপত্তা ও নারী অধিকার", weight: 8 },
  { name: "পারিবারিক বিষয়, ভরণপোষণ, হেফাজত", weight: 14 },
  { name: "দাম্পত্য, তালাক, যৌতুক", weight: 10 },
  { name: "জমি, সম্পত্তি ও ভূমি অপরাধ", weight: 14 },
  { name: "নিবন্ধিত সম্পত্তি ও উত্তরাধিকার", weight: 8 },
  { name: "শ্রম আইন, বেতন আদায়, কর্মঘাত", weight: 12 },
  { name: "নারী ও শিশু নির্যাতন", weight: 9 },
  { name: "চেক অনাদায়, ঋণ আদায়", weight: 8 },
  { name: "মধ্যস্থতা, সালিশ", weight: 6 },
  { name: "ফৌজদারি মামলা ও জামিন", weight: 7 },
];

if (!Number.isFinite(COUNT) || COUNT <= 0) {
  throw new Error(`--count did not parse; got ${JSON.stringify(COUNT)}`);
}
const total = POOLS.reduce((n, p) => n + p.weight, 0);
const districts = BD_DISTRICTS.map((d) => d.bn);
const random = rng(20260926);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(random() * arr.length)]!;

const rows = [];
const used = new Set();
for (let i = 0; i < COUNT; i += 1) {
  // Weighted pool choice.
  let r = random() * total;
  let pool = POOLS[0];
  for (const p of POOLS) {
    r -= p.weight;
    if (r <= 0) {
      pool = p;
      break;
    }
  }

  const female = random() < 0.32;
  const name = `${female ? pick(FIRST_F) : pick(FIRST_M)}${random() < 0.5 ? " " : ""}${pick(SURNAMES)}`.trim();
  const district = pick(districts);

  // Two specialisations some of the time, so a case can match on either.
  const extra = random() < 0.35 ? `, ${pick(POOLS).name.split(",")[0]}` : "";
  const specialisations = pool.name + extra;

  let id = `PL-${String(1000 + i).padStart(4, "0")}`;
  while (used.has(id)) id = `PL-${String(1000 + Math.floor(random() * 8999)).padStart(4, "0")}`;
  used.add(id);

  // A small share are proposed or removed, so the "assignable" gate has something to
  // actually exclude rather than every row being assignable.
  const roll = random();
  const listStatus = roll < 0.86 ? "on_panel" : roll < 0.95 ? "proposed" : "removed";

  rows.push({
    id,
    kind: pool.name === "মধ্যস্থতা, সালিশ" && random() < 0.5 ? "mediator" : "lawyer",
    name: `অ্যাডভোকেট ${name}`,
    barRegistration: `A-${1000 + Math.floor(random() * 8999)}`,
    enrolmentYear: String(2005 + Math.floor(random() * 20)),
    enrolmentNumber: `E-${2005 + Math.floor(random() * 20)}-${String(1000 + Math.floor(random() * 8999))}`,
    certificateNumber: `BC-${70000 + Math.floor(random() * 29999)}`,
    jurisdiction: district,
    specialisations,
    phone: `0171${String(Math.floor(random() * 10000000)).padStart(7, "0")}`,
    email: `advocate.${id.toLowerCase()}@example.org`,
    listStatus,
  });
}

const esc = (v: unknown): string => String(v).replace(/'/g, "''");
const body = rows
  .map(
    (r) =>
      `  ('${esc(r.id)}', '${esc(r.kind)}', '${esc(r.name)}', '${esc(r.name)}', '${esc(r.barRegistration)}', '${esc(r.enrolmentYear)}', '${esc(r.enrolmentNumber)}', '${esc(r.certificateNumber)}', '${esc(r.jurisdiction)}', '${esc(r.specialisations)}', '${esc(r.phone)}', '${esc(r.email)}', '${esc(r.listStatus)}')`,
  )
  .join(",\n");

const sql = `-- GENERATED FILE — do not hand-edit.
--
-- Produced by scripts/generate-panel-roster.ts (seed 20260926, ${rows.length} lawyers).
-- Regenerate with:  npx tsx scripts/generate-panel-roster.ts
--
-- The roster was five hand-written rows, which made the DLAO's search box and the
-- lawyer recommendation look broken: nothing to search, and no workload to spread, so
-- "least loaded lawyer first" always returned the same few names.
--
-- Generated rather than typed so the size can change without hand-authoring rows, and
-- seeded so a regeneration never reshuffles a live appointment. Fixed ids plus
-- INSERT OR IGNORE mean re-running never duplicates a lawyer or overwrites a real
-- roster entry added later.
--
-- ${rows.length} lawyers across ${new Set(rows.map((r) => r.jurisdiction)).size} districts, with
-- specialisation pools that map onto the taxonomy categories the recommendation
-- engine matches on. A share are 'proposed' or 'removed' so the assignable gate has
-- something to exclude.

INSERT OR IGNORE INTO panel_lawyers
  (id, kind, name_bn, name_en, bar_registration, enrolment_year, enrolment_number,
   certificate_number, jurisdiction_district_name, specialisations, phone, email, list_status)
VALUES
${body};
`;

const target = resolve("migrations/0025_panel_roster.sql");
writeFileSync(target, sql, "utf8");
const districtsCovered = new Set(rows.map((r) => r.jurisdiction)).size;
console.log(
  `wrote ${target}: ${rows.length} lawyers across ${districtsCovered} districts ` +
    `(${rows.filter((r) => r.listStatus === "on_panel").length} on panel, ` +
    `${rows.filter((r) => r.listStatus === "proposed").length} proposed, ` +
    `${rows.filter((r) => r.listStatus === "removed").length} removed)`,
);
