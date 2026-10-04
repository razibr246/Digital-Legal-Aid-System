-- What the appointed lawyer is required to do, and whether they have done it.
--
-- A panel lawyer being "assigned" tells the applicant nothing. Without a record of
-- the expected steps and how long each has been outstanding, "nothing is happening"
-- and "this is the next step" look identical from the outside, and the applicant has
-- no basis to complain even when the lawyer has genuinely gone quiet.
--
-- Rows are created when the lawyer is appointed, from the plan in
-- `lib/case/lawyer-tracker.ts` — the same module the applicant-facing tracker reads,
-- so the deadlines shown are the deadlines that were recorded.
--
-- `due_at` is computed from the appointment date, not from when the row happened to
-- be inserted, so a late appointment cannot buy extra time.

CREATE TABLE IF NOT EXISTS lawyer_action_log (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
  assignment_id TEXT REFERENCES panel_assignments(id) ON DELETE SET NULL,
  panel_lawyer_id TEXT,
  action_code TEXT NOT NULL,
  label_bn TEXT NOT NULL,
  due_at DATETIME,
  done_at DATETIME,
  note_bn TEXT,
  updated_by_user_id TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lawyer_action_log_case ON lawyer_action_log(case_id);
CREATE INDEX IF NOT EXISTS idx_lawyer_action_log_assignment ON lawyer_action_log(assignment_id);
CREATE INDEX IF NOT EXISTS idx_lawyer_action_log_pending ON lawyer_action_log(done_at);

-- One row per action per appointment. The appointment seeds the plan, so a re-visit
-- or a second callback must not duplicate it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lawyer_action_log_unique
  ON lawyer_action_log(assignment_id, action_code) WHERE assignment_id IS NOT NULL;
