/**
 * The applicant's view of their lawyer's progress: the recorded actions, graded, plus
 * the elapsed time since appointment.
 *
 * The grading lives in `lib/case/lawyer-tracker.ts` so the numbers an applicant sees
 * come from the same rules that decided the deadlines. Nothing is recomputed here
 * beyond joining rows.
 */

import {
  describeTracker,
  gradeAction,
  summariseTracker,
  type TrackedAction,
  type TrackerSummary,
} from "@/lib/case/lawyer-tracker";
import type { D1Database } from "@/lib/auth/d1-session";

export interface LawyerTrackerView {
  assignedAt: string;
  assignedByName: string | null;
  lawyerName: string;
  summary: TrackerSummary;
  actions: TrackedAction[];
  headlineBn: string;
  /** Phased for the applicant, not for the officer. */
  noteBn: string;
}

export async function lawyerTrackerView(
  db: D1Database,
  citizenUserId: string,
  caseId: string,
  now: Date = new Date(),
): Promise<LawyerTrackerView | null> {
  const assignment = await db
    .prepare(
      `SELECT p.id, p.assigned_at, p.assigned_by_name_bn, p.lawyer_name_bn, p.panel_lawyer_id
       FROM panel_assignments p
       WHERE p.case_id = ? AND p.citizen_user_id = ? AND p.status = 'active'
       LIMIT 1`,
    )
    .bind(caseId, citizenUserId)
    .first<{
      id: string;
      assigned_at: string;
      assigned_by_name_bn: string | null;
      lawyer_name_bn: string | null;
      panel_lawyer_id: string | null;
    }>();
  if (!assignment) return null;

  const rows = await db
    .prepare(
      `SELECT action_code, label_bn, due_at, done_at, note_bn
       FROM lawyer_action_log
       WHERE assignment_id = ?
       ORDER BY COALESCE(due_at, created_at) ASC, action_code ASC`,
    )
    .bind(assignment.id)
    .all<{
      action_code: string;
      label_bn: string;
      due_at: string | null;
      done_at: string | null;
      note_bn: string | null;
    }>();

  const actions = rows.results.map((r) =>
    gradeAction(
      {
        code: r.action_code,
        labelBn: r.label_bn,
        dueAt: r.due_at,
        doneAt: r.done_at,
        noteBn: r.note_bn,
      },
      assignment.assigned_at,
      now,
    ),
  );
  const summary = summariseTracker(actions, assignment.assigned_at, now);

  return {
    assignedAt: assignment.assigned_at,
    assignedByName: assignment.assigned_by_name_bn,
    lawyerName: assignment.lawyer_name_bn ?? "প্যানেল আইনজীবী",
    summary,
    actions,
    headlineBn: describeTracker(summary),
    noteBn:
      summary.overdue > 0
        ? "এই ধাপগুলোর সময় পেরিয়ে গেছে। আপনি নিচের বাটনে জেলা লিগ্যাল এইড অফিসকে জানাতে পারেন।"
        : "সময়মতো হলে আলাদা কিছু জানার দরকার নেই। ধাপ আটকে থাকলে জানাবেন।",
  };
}
