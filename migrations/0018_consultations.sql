-- DLAO <-> applicant consultation.
--
-- The consultation is the point where an application becomes a case: the officer
-- confirms identity and means on a recorded call, the eligibility rules decide
-- whether a free panel lawyer follows, and the transcript is kept because a
-- refusal has to be explainable and an appeal has to be able to read it back.
--
-- Strictly additive, like 0016. Nothing is dropped or re-typed, and the tables are
-- all CREATE ... IF NOT EXISTS, so this cannot break a live query.

-- One row per consultation. Kept separate from `cases` because a case can be
-- consulted more than once (a second call after new facts) and because a
-- consultation is meaningful before a case exists.
CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY,
  application_id TEXT,
  case_id TEXT,
  citizen_user_id TEXT,
  dlao_user_id TEXT,
  district TEXT,
  channel TEXT NOT NULL DEFAULT 'callback' CHECK (channel IN ('callback','voice','web')),
  phase TEXT NOT NULL DEFAULT 'connect',
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('queued','in_progress','completed','failed')),
  outcome TEXT NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending','eligible','ineligible','conditional')),
  eligibility_basis TEXT,
  act_bn TEXT,
  transcript_json TEXT NOT NULL DEFAULT '[]',
  summary_bn TEXT,
  started_at DATETIME,
  ended_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_consultations_citizen ON consultations(citizen_user_id);
CREATE INDEX IF NOT EXISTS idx_consultations_case ON consultations(case_id);
CREATE INDEX IF NOT EXISTS idx_consultations_application ON consultations(application_id);
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);

-- Individual turns, so the conversation is queryable and an officer can find the
-- exact exchange that decided a case. `transcript_json` above is a denormalised copy
-- for fast playback; this table is the record of truth.
CREATE TABLE IF NOT EXISTS consultation_turns (
  id TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  phase TEXT NOT NULL,
  speaker TEXT NOT NULL CHECK (speaker IN ('dlao','applicant','system')),
  text_bn TEXT NOT NULL,
  event TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_consultation_turns_consultation
  ON consultation_turns(consultation_id, seq);

-- Who was assigned to whom, for which case, by which officer.
--
-- This is the "panel lawyer entity" the assignment creates. It is deliberately its
-- own table rather than a column on `cases`: an applicant can have a panel lawyer
-- across several cases, a case can change lawyer, and the officer who made the
-- assignment has to be recorded independently of who holds the case now.
CREATE TABLE IF NOT EXISTS panel_assignments (
  id TEXT PRIMARY KEY,
  case_id TEXT,
  consultation_id TEXT,
  citizen_user_id TEXT NOT NULL,
  panel_lawyer_id TEXT,
  lawyer_name_bn TEXT,
  assigned_by_user_id TEXT,
  assigned_by_name_bn TEXT,
  district TEXT,
  eligibility_basis TEXT,
  act_bn TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','withdrawn','reassigned','completed')),
  note_bn TEXT,
  assigned_at DATETIME NOT NULL DEFAULT (datetime('now')),
  ended_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_panel_assignments_case ON panel_assignments(case_id);
CREATE INDEX IF NOT EXISTS idx_panel_assignments_citizen ON panel_assignments(citizen_user_id);
CREATE INDEX IF NOT EXISTS idx_panel_assignments_lawyer ON panel_assignments(panel_lawyer_id);

-- The application -> case promotion, kept as an explicit record so the handover is
-- auditable. `cases` already carries the operational columns (stage, sensitivity,
-- eligibility_passed, lawyer_requested); this is the history of how it got there.
CREATE TABLE IF NOT EXISTS application_case_links (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  consultation_id TEXT,
  promoted_by_user_id TEXT,
  promoted_by_name_bn TEXT,
  reason TEXT NOT NULL DEFAULT 'consultation_completed',
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_application_case_links_application
  ON application_case_links(application_id);

-- A consultation is keyed by its application, and the route is idempotent: a double
-- submit or a re-render must not produce a second conversation. The case link index
-- above already guarantees one case per application; this is the same guarantee one
-- step earlier.
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultations_application_unique
  ON consultations(application_id) WHERE application_id IS NOT NULL;
