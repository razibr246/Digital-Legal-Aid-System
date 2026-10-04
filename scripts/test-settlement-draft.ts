/**
 * Settlement drafting.
 *
 * FREE — no network, no STT/TTS, no LLM. `npm run test:settlement-draft`
 *
 * The property under test is a safety property, not a formatting one: the drafter may
 * only state what the case record contains. A settlement is an enforceable instrument, so
 * an invented maintenance amount, handover date or property boundary would manufacture a
 * dispute the parties never agreed to. The test therefore feeds the drafter records that
 * are missing almost everything and asserts it comes back with the gaps still visible.
 */
import { draftSettlement, renderSettlementText, type SettlementDraftInput } from "../lib/case/settlement-draft";

let failures = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? " :: " + extra : ""}`);
}

const FULL: SettlementDraftInput = {
  docketId: "DLAS-2025-JYP-0141",
  problem: "আমার স্বামী আমাকে নিয়মিত মারধর করেন।",
  district: "জয়পুরহাট",
  applicantName: "মোয়ূরী আক্তার",
  mediatorName: "ফারহানা আক্তার",
  venue: "জেলা লিগ্যাল এইড অফিস, নিরাপ্ত কক্ষ",
  notes: "উভয় পক্ষ সম্মত হয়েছে।",
  settledAt: "2026-09-27T05:00:00.000Z",
  outcome: "settled",
};

console.log("a settlement is NEVER ready on the strength of a 'settled' note alone");

const draft = draftSettlement(FULL);
check("draft is produced", Boolean(draft));
check("it is explicitly NOT ready to sign", draft.readyToSign === false);
check("the operative terms clause is open", draft.openClauseIds.includes("terms"), draft.openClauseIds.join(","));
check("the enforcement clause is open", draft.openClauseIds.includes("enforcement"));
check("the deadline clause is open", draft.openClauseIds.includes("deadline"));
check("the blocking line says so in Bangla", draft.blockingBn.includes("নির্ধারিত হয়নি"), draft.blockingBn);
console.log(`    open clauses: ${draft.openClauseIds.join(", ")}`);

console.log("\nclauses that CAN be sourced from the record are filled in");

const parties = draft.clauses.find((c) => c.id === "parties");
check("the applicant is named from the record", parties?.bodyBn?.includes("মোয়ূরী আক্তার") === true, String(parties?.bodyBn));
check("the applicant's name is sourced, not invented", parties?.source === "party.applicant", String(parties?.source));

const record = draft.clauses.find((c) => c.id === "mediation_record");
check("the mediation record cites date and venue", record?.bodyBn?.includes("সালিশ") === false && Boolean(record?.bodyBn), String(record?.bodyBn));
check("the mediator is named from the mediation row", record?.bodyBn?.includes("ফারহানা আক্তার") === true, String(record?.bodyBn));

const background = draft.clauses.find((c) => c.id === "background");
check("the background is the applicant's own statement", background?.source === "case.problem");

console.log("\nthe opposite party is NEVER invented");

const opposite = draft.clauses.find((c) => c.id === "opposite_party");
check("the opposite party stays open", opposite?.bodyBn === null, String(opposite?.bodyBn));
check("and is marked open, not sourced", opposite?.source === "open", String(opposite?.source));
check("it asks for the name rather than supplying one", Boolean(opposite?.needsBn), String(opposite?.needsBn));

// Even a record that says nothing at all must not yield a named counterparty.
const bare = draftSettlement({
  docketId: "D-1", problem: "", district: null, applicantName: null,
  mediatorName: null, venue: null, notes: null, settledAt: null, outcome: "settled",
});
const bareText = renderSettlementText(bare);
console.log("\na completely empty record still cannot produce a signed instrument");
check("nothing is ready to sign", bare.readyToSign === false);
check("every clause is open or absent", bare.clauses.every((c) => c.bodyBn === null), bare.clauses.filter((c) => c.bodyBn).map((c) => c.id).join(",") || "none filled");
check("the rendered text is almost entirely placeholders", (bareText.match(/অনির্ধারিত/g) || []).length >= 4, String((bareText.match(/অনির্ধারিত/g) || []).length));
check("the rendered text ends with the blocking line", bareText.includes("অংশ এখনো নির্ধারিত হয়নি"), bareText.slice(-90));

console.log("\nthe rendered document shows the gaps rather than hiding them");

const text = renderSettlementText(draft);
check("an open clause is rendered as an explicit placeholder", text.includes("[সালিশের শর্ত — অনির্ধারিত"), "");
check("the document carries the blocking note", text.includes(draft.blockingBn.slice(0, 12)));
check("sourced content is present too", text.includes("মোয়ূরী আক্তার"));

console.log("\nthe drafter is deterministic");

const again = draftSettlement(FULL);
check("the same record yields the same draft", renderSettlementText(again) === text);
check("clause ids are stable", again.clauses.map((c) => c.id).join(",") === draft.clauses.map((c) => c.id).join(","));

console.log(failures === 0 ? "\nAll settlement-draft checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
