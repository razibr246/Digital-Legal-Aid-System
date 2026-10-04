/**
 * Proves the simulation's recognition claim without spending a credit.
 *
 * `classifySeverity` is pure and deterministic, so the whole "the AI recognises this
 * case, it is not hardcoded" argument can be checked here in milliseconds. If a scenario's
 * caller text stopped matching its rules, this fails before anyone reaches a browser.
 *
 * Free — no network, no STT, no TTS, no LLM. `npm run test:simulations`
 */
import { SIMULATIONS, allTurns } from "../lib/demo/simulations";
import { classifySeverity } from "../lib/agent/knowledge/severity-classification";
import { isSensitiveClassification } from "../lib/agent/knowledge/severity-classification";

let failures = 0;
function check(label: string, ok: boolean, extra = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? " :: " + extra : ""}`);
}

console.log("severity recognition — the simulation must not hardcode its answer\n");

for (const sim of SIMULATIONS) {
  console.log(`--- ${sim.id}: ${sim.title}`);
  const callerTurns = allTurns(sim).filter((t) => t.speaker === "caller");
  // The problem statement is the turn that must carry the classification. Short
  // navigation turns ("বাংলায় কথা বলব") are deliberately not expected to escalate.
  const problem = callerTurns.find((t) => t.step === "problem") ?? callerTurns[callerTurns.length - 1];
  if (!problem) {
    check(`${sim.id} has a caller problem turn`, false);
    continue;
  }

  const result = classifySeverity(problem.text);
  console.log(
    `    severity=${result.severity} category=${result.categoryBn || result.category} ` +
      `tags=${(result.matchedTags ?? []).join(",") || "-"} ref=${result.caseReference ?? "-"}`,
  );

  // Nobody is a general inquiry in their own scenario. A "standard" result here would
  // mean the text no longer matches the rules that were written for it.
  check(`${sim.id} is recognised as a real case`, result.severity !== "standard", result.severity);
  check(`${sim.id} matches at least one rule`, (result.matchedTags ?? []).length > 0, (result.matchedTags ?? []).join(","));
  check(
    `${sim.id} names a reference scenario`,
    typeof result.caseReference === "string" && result.caseReference.length > 0,
    String(result.caseReference),
  );
  check(`${sim.id} yields a Bangla acknowledgement`, Boolean(result.acknowledgmentBn?.trim()));
  console.log("");
}

console.log("the emergency cases must be treated as sensitive, not just 'high'");

for (const id of ["moyuri-ripon", "nabila"]) {
  const sim = SIMULATIONS.find((s) => s.id === id);
  // `speaker === "caller"` matters: several scenarios use step "problem" for the
  // agent's prompt to speak as well, and selecting the first match classified the
  // question "আপনার সমস্যাটি বলুন" instead of the applicant's answer.
  // Read through allTurns() because the story scenarios keep their turns in `phases`,
  // and the guard comes first because `sim` is optional from `find`.
  if (!sim) continue;
  const problem = allTurns(sim).find((t) => t.step === "problem" && t.speaker === "caller");
  if (!problem) continue;
  const result = classifySeverity(problem.text);
  check(`${id} is sensitive (restricted to DLAO/Chief)`, isSensitiveClassification(result), result.severity);
}

console.log("\nMoyuri's own barrier must be recognised from proxy words alone");

// The point of A1/A2: a person who is NOT the victim is reporting. If only first-person
// violence language were recognised, Ripon's call would file as a general inquiry.
const proxyOnly =
  "আমার বোনকে তার স্বামী মারধর করেন এবং বাড়ি থেকে বের করে দিয়েছেন। আমি তার ভাই, তার হয়ে ফোন করেছি। বাড়ির ফোন দেখা হয় বলে সে নিজে ফোন করতে পারে না।";
const proxyResult = classifySeverity(proxyOnly);
check(
  "a third-party report is still escalated",
  proxyResult.severity !== "standard",
  `${proxyResult.severity} / ${(proxyResult.matchedTags ?? []).join(",")}`,
);

const contactOnly =
  "আমার স্বামী আমার ফোন দেখেন এবং আমি নিরাপদে কথা বলতে পারি না। আমার জাতীয় পরিচয়পত্র আমার কাছে নেই।";
const contactResult = classifySeverity(contactOnly);
check(
  "restricted contact is recognised",
  (contactResult.matchedTags ?? []).length > 0,
  `${contactResult.severity} / ${(contactResult.matchedTags ?? []).join(",")}`,
);

const blind =
  "আমি দৃষ্টিহীন, ফরম বা পিডিএফ আমি পড়তে পারি না এবং ভিজ্যুয়াল ওটিপি ব্যবহার করতে পারি না। আমি ভয়েসের মাধ্যমে আবেদন করতে চাই।";
const blindResult = classifySeverity(blind);
check(
  "an accessibility need is recognised",
  (blindResult.matchedTags ?? []).length > 0,
  `${blindResult.severity} / ${(blindResult.matchedTags ?? []).join(",")}`,
);

console.log(
  failures === 0
    ? "\nAll simulation recognition checks passed."
    : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
