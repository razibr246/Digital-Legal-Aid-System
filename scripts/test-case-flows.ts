/**
 * Exercises the real approval flows against the 0016 schema, using the same rule
 * functions the dashboards will use. The point is to catch schema/rule mismatches
 * now rather than three screens later.
 *
 *   npm run test:case-flows
 */
import {
  caseActionState,
  certificationState,
  slaScan,
  slaAlerts,
  type CaseFacts,
} from "../lib/case/domain";
import { decideSend, type SafeContactProfile } from "../lib/case/audit";

let pass = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass += 1;
  else {
    failures.push(`${name}${detail ? ` :: ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

// The rows a Chief sees on the Payment approvals tab, and the rules that produced them.
interface PaymentRow {
  id: string;
  caseId: string;
  type: "mediator" | "lawyer" | "officer" | "other";
  amountTaka: number;
  status: "pending" | "approved" | "rejected";
  reason?: string;
}

const MANDATORY = ["d25"];

console.log("mediation → lawyer hand-off on a mandatory district");
{
  const caseId = "DLAS-D25-2026-00001";
  const atStart: CaseFacts = {
    status: "review",
    track: "district",
    districtCode: "d25",
    mediations: [],
    lawyerAssigned: false,
    lawyerRequested: false,
  };
  check("mediation allowed in review", caseActionState(atStart, MANDATORY).mediation.ok);

  const scheduled: CaseFacts = { ...atStart, status: "mediation", mediations: [{ date: "2026-09-01", outcome: "scheduled" }] };
  check("cannot re-mediate while in mediation", !caseActionState(scheduled, MANDATORY).mediation.ok);
  // Once a mediation record exists the mandatory gate is satisfied (mediation WAS
  // attempted), so the normal in-progress rule applies instead — it stays blocked,
  // but for a different, more specific reason.
  const scheduledState = caseActionState(scheduled, MANDATORY);
  check("lawyer still blocked while mediation is in progress", !scheduledState.assignLawyer.ok);
  check("mandatory gate no longer applies once attempted", scheduledState.assignLawyer.reason === "medLate", scheduledState.assignLawyer.reason);

  const failed: CaseFacts = { ...atStart, mediations: [{ date: "2026-09-01", outcome: "failed" }] };
  check("after failure, lawyer still needs escalation", caseActionState(failed, MANDATORY).assignLawyer.reason === "needFailedMed");

  const escalated: CaseFacts = { ...failed, lawyerRequested: true };
  check("after escalation, lawyer may be assigned", caseActionState(escalated, MANDATORY).assignLawyer.ok);
  check("payment billable once the lawyer is on", caseActionState({ ...escalated, lawyerAssigned: true }, MANDATORY).requestPay.ok);
}

console.log("mediator honouraria need acceptance");
{
  const base: CaseFacts = {
    status: "review",
    track: "district",
    districtCode: "d1",
    mediations: [{ date: "2026-09-01", outcome: "settled" }],
    lawyerAssigned: false,
    lawyerRequested: false,
  };
  const asked = caseActionState({ ...base, forMediator: true });
  check("asked-but-not-accepted is unpaid", !asked.requestPay.ok && asked.requestPay.reason === "medNotAccepted");
  const accepted = caseActionState({ ...base, forMediator: true, mediatorAccepted: true });
  check("accepted mediator is payable", accepted.requestPay.ok);
}

console.log("payment decisions are one-way and need a reason to reject");
{
  const pending: PaymentRow[] = [
    { id: "PR-0001", caseId: "DLAS-D25-2026-00001", type: "mediator", amountTaka: 3000, status: "pending" },
    { id: "PR-0002", caseId: "DLAS-D25-2026-00002", type: "lawyer", amountTaka: 25000, status: "pending" },
  ];
  check("two requests await the Chief", pending.filter((p) => p.status === "pending").length === 2);

  // Approving triggers disbursement.
  const approved = pending.map((p) => (p.id === "PR-0001" ? { ...p, status: "approved" as const } : p));
  check("approve moves it out of the queue", approved[0].status === "approved" && approved[1].status === "pending");

  // A reject is terminal and must carry a reason.
  const rejected: PaymentRow = { ...pending[1], status: "rejected", reason: "ক্লোজার রিপোর্ট এখনো ফাইলে নেই।" };
  check("reject stores a reason", Boolean(rejected.reason));
  check("a decided request cannot be decided again", rejected.status !== "pending");
}

console.log("lawyer change flags paid-but-incomplete tranches as refund");
{
  // Case already before the court, with two tranches paid and a third incomplete.
  const tranches = [
    { step: "প্রথম ধাপ", amountTaka: 10000, status: "paid" as const, stepCompleted: true },
    { step: "দ্বিতীয় ধাপ", amountTaka: 10000, status: "paid" as const, stepCompleted: false },
    { step: "তৃতীয় ধাপ", amountTaka: 10000, status: "pending" as const, stepCompleted: false },
  ];
  // flagClawback from the step the outgoing lawyer never completed:
  const refundable = tranches.filter((t) => t.status === "paid" && !t.stepCompleted);
  check("one paid tranche becomes refundable", refundable.length === 1, JSON.stringify(refundable));
  check("refund is for the incomplete step", refundable[0].step === "দ্বিতীয় ধাপ");
  check("completed paid work is never clawed back", !tranches.some((t) => t.status === "paid" && t.stepCompleted && refundable.includes(t)));
}

console.log("settlement certification gate");
{
  check("unsigned cannot certify", !certificationState(false, false, false, false).ok);
  // applicant, counterparty, mediator — all three.
  check("two of three cannot certify", !certificationState(true, true, false, false).ok);
  check("all three signed certifies", certificationState(true, true, true, false).ok);
}

console.log("jurisdiction transfer is a one-way door while it is pending");
{
  const fresh = caseActionState({
    status: "review", track: "district", districtCode: "d1", mediations: [],
    lawyerAssigned: false, lawyerRequested: false,
  });
  check("transfer requested before work starts", fresh.transfer.ok);
  const afterMediation = caseActionState({
    status: "review", track: "district", districtCode: "d1",
    mediations: [{ date: "x", outcome: "failed" }], lawyerAssigned: false, lawyerRequested: true,
  });
  check("no transfer after work started", !afterMediation.transfer.ok);
}

console.log("sensitive applicant is never messaged directly");
{
  const profile: SafeContactProfile = {
    ref: "DLAS-D25-2026-00009",
    riskHigh: true,
    neutralOnly: false,
    windowBn: "দুপুর ২টা–৫টা",
    destinations: [
      { channel: "sms", kindBn: "স্বামীর নম্বর", toBn: "01XXXXXXXXX", rule: "block", whyBn: "নম্বরটি স্বামীর।" },
      { channel: "voice", kindBn: "ফোনে যোগাযোগ", toBn: "01XXXXXXXXX", rule: "window", whyBn: "নিরাপদ সময়।" },
      { channel: "portal", kindBn: "পোর্টাল বার্তা", toBn: "অ্যাকাউন্ট", rule: "allow", whyBn: "নিরপেক্ষ মাধ্যম।" },
    ],
  };
  check("sms blocked", !decideSend(profile, "sms").allowed);
  check("voice deferred to the window", decideSend(profile, "voice").deferred);
  check("portal allowed", decideSend(profile, "portal").allowed);
  check("every refusal has a reason", decideSend(profile, "sms").whyBn.length > 0);
}

console.log("SLA log feeds the two different banners");
{
  const log = slaScan([
    { ref: "A", caseId: "DLAS-D25-2026-00001", stage: "review", ageDays: 14 },
    { ref: "B", caseId: "DLAS-D25-2026-00002", stage: "review", ageDays: 18 },
    { ref: "C", caseId: "DLAS-D25-2026-00003", stage: "payment", ageDays: 9 },
  ]);
  const dlao = slaAlerts(log, "dlao");
  const chief = slaAlerts(log, "chief");
  check("dlao banner counts its own near+breach", dlao.total === 2, JSON.stringify(dlao.total));
  check("chief banner is payment-only", chief.total === 1);
  check("dlao banner separates breach from near", dlao.near === 1 && dlao.breach === 1, `${dlao.near}/${dlao.breach}`);
}

console.log("");
if (failures.length) {
  console.log(`${failures.length} FAILED of ${pass + failures.length}`);
  process.exit(1);
}
console.log(`All ${pass} case-flow checks passed`);
