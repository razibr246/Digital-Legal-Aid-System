/**
 * Re-screen existing applications with the current severity classifier.
 *
 * Needed because severity was originally derived from free-text keywords only, so
 * an application whose stored problem statement is the category-derived Bangla
 * question could be filed as "General Inquiry" even when the case plainly
 * belonged to Category A of the severity spec. The classifier now also takes the
 * taxonomy selection, so old rows have to be brought in line.
 *
 * Read-only against D1, then prints the statements to apply. It never edits the
 * database itself: run it, read the diff, then apply deliberately.
 *
 *   node scripts/backfill-severity.mjs
 */
import { execFileSync } from "node:child_process";
import {
  classifySeverity,
  priorityForSeverity,
  tagForSelection,
  urgencyForSeverity,
} from "../lib/agent/knowledge/severity-classification.ts";
import { PROBLEM_CATEGORIES } from "../lib/legal/problem-taxonomy.ts";

const REMOTE = process.argv.includes("--remote");

function d1(sql) {
  const args = ["wrangler", "d1", "execute", "legal-voice-db", "--json", ...(REMOTE ? ["--remote"] : []), "--command", sql];
  const out = execFileSync("npx", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  const parsed = JSON.parse(out);
  return Array.isArray(parsed) ? parsed[0].results : parsed.results;
}

/** The route stores "<category.bn>: <subcategory.bn>", so both are recoverable. */
function deriveSelection(statement) {
  const colon = statement.indexOf(":");
  if (colon < 0) return { categoryId: null, subcategoryId: null };
  const category = PROBLEM_CATEGORIES.find((c) => statement.startsWith(c.bn));
  if (!category) return { categoryId: null, subcategoryId: null };
  const subText = statement.slice(colon + 1).trim();
  const sub = category.subcategories.find((s) => subText === s.bn || subText.startsWith(s.bn));
  return { categoryId: category.id, subcategoryId: sub ? sub.id : null };
}

const rows = d1(
  "SELECT a.id, a.problem_statement, a.severity_level, a.severity_category, a.severity_factors_json, a.urgency, a.priority FROM applications a ORDER BY a.created_at DESC",
);

let changed = 0;
for (const row of rows) {
  const statement = String(row.problem_statement || "").trim();
  if (!statement) continue;
  const selection = deriveSelection(statement);
  if (selection.categoryId && selection.subcategoryId) {
    // Keep the escape hatch out of the forced-tag path.
    selection.subcategoryId = selection.subcategoryId;
  }
  // Only genuine applications. The identity/face-capture suites also write rows
  // here (their "problem statement" is literally "নাম যাচাই পরীক্ষা"), and there
  // is no category to screen them against, so leave them untouched.
  if (!selection.categoryId && !row.severity_level) continue;

  const result = classifySeverity(statement, selection);
  const factors = JSON.stringify(result.factors);
  // Reuse the route's own mappings; inventing a second vocabulary here is how
  // "emergency_danger" silently degrades into "urgent".
  const urgency = urgencyForSeverity(result.severity);
  const priority = priorityForSeverity(result.severity);

  const differs =
    row.severity_level !== result.severity ||
    row.severity_category !== result.category ||
    row.severity_factors_json !== factors ||
    row.urgency !== urgency ||
    row.priority !== priority;
  if (!differs) continue;

  changed += 1;
  console.log(`\n${row.id}  [${selection.categoryId ?? "?"}/${selection.subcategoryId ?? "?"}] tag=${tagForSelection(selection.categoryId, selection.subcategoryId) ?? "none"}`);
  console.log(`  severity : ${row.severity_level} -> ${result.severity}`);
  console.log(`  category : ${row.severity_category} -> ${result.category}`);
  console.log(`  urgency  : ${row.urgency} -> ${urgency}`);
  console.log(`  priority : ${row.priority} -> ${priority}`);
  const esc = (s) => String(s).replace(/'/g, "''");
  console.log(
    `  UPDATE applications SET severity_level='${esc(result.severity)}', severity_category='${esc(result.category)}', severity_factors_json='${esc(factors)}', urgency='${esc(urgency)}', priority='${esc(priority)}' WHERE id='${esc(row.id)}';`,
  );
}

console.log(`\n${changed} of ${rows.length} application(s) would change.`);
