-- Lawyer Accountability System: SLA violations, show-cause notices, payment freezes, flags.
--
-- The Legal Aid Rules require panel lawyers to submit hearing updates after every court
-- date. This table tracks when they fail to do so, what action was taken, and how they
-- responded. A lawyer who misses two consecutive deadlines gets a Red Flag Alert and
-- their stage-based fee is frozen until they respond.
--
-- Strictly additive: CREATE IF NOT EXISTS and ALTER ADD COLUMN only.

-- Track SLA violations per lawyer per case
CREATE TABLE IF NOT EXISTS lawyer_sla_violations (
  id TEXT PRIMARY KEY,
  panel_lawyer_id TEXT NOT NULL REFERENCES panel_lawyers(id) ON DELETE CASCADE,
  case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
  assignment_id TEXT,
  action_code TEXT NOT NULL,
  deadline_at DATETIME NOT NULL,
  missed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consecutive_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'escalated')),
  resolved_at DATETIME,
  resolved_by TEXT,
  resolution_note TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lawyer_sla_violations_lawyer ON lawyer_sla_violations(panel_lawyer_id, status);
CREATE INDEX IF NOT EXISTS idx_lawyer_sla_violations_case ON lawyer_sla_violations(case_id);

-- Show-cause notices: 48-hour window for lawyer to respond
CREATE TABLE IF NOT EXISTS lawyer_show_cause (
  id TEXT PRIMARY KEY,
  panel_lawyer_id TEXT NOT NULL REFERENCES panel_lawyers(id) ON DELETE CASCADE,
  case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
  violation_id TEXT REFERENCES lawyer_sla_violations(id) ON DELETE SET NULL,
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'missed_deadline',
    'no_court_update',
    'no_contact',
    'citizen_complaint',
    'multiple_violations',
    'other'
  )),
  reason_detail TEXT,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  issued_by TEXT,
  deadline_at DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'responded', 'expired', 'resolved', 'escalated')),
  response_text TEXT,
  responded_at DATETIME,
  resolution TEXT CHECK (resolution IN ('warning', 'cleared', 'payment_freeze', 'reassign', 'misconduct')),
  resolved_by TEXT,
  resolved_at DATETIME,
  resolution_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_lawyer_show_cause_lawyer ON lawyer_show_cause(panel_lawyer_id, status);
CREATE INDEX IF NOT EXISTS idx_lawyer_show_cause_deadline ON lawyer_show_cause(deadline_at) WHERE status = 'pending';

-- Payment freeze status: freezes all pending payments for a lawyer until cleared
CREATE TABLE IF NOT EXISTS lawyer_payment_freeze (
  id TEXT PRIMARY KEY,
  panel_lawyer_id TEXT NOT NULL REFERENCES panel_lawyers(id) ON DELETE CASCADE,
  show_cause_id TEXT REFERENCES lawyer_show_cause(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  frozen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  frozen_by TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'lifted')),
  lifted_at DATETIME,
  lifted_by TEXT,
  lift_reason TEXT,
  UNIQUE(panel_lawyer_id, status) -- Only one active freeze per lawyer
);
CREATE INDEX IF NOT EXISTS idx_lawyer_payment_freeze_active ON lawyer_payment_freeze(panel_lawyer_id) WHERE status = 'active';

-- Lawyer performance flags: red flags, warnings, commendations
CREATE TABLE IF NOT EXISTS lawyer_flags (
  id TEXT PRIMARY KEY,
  panel_lawyer_id TEXT NOT NULL REFERENCES panel_lawyers(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL CHECK (flag_type IN ('red_flag', 'warning', 'watch', 'commendation')),
  reason_code TEXT NOT NULL,
  reason_detail TEXT,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  issued_by TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cleared', 'expired')),
  cleared_at DATETIME,
  cleared_by TEXT,
  clear_reason TEXT,
  expires_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_lawyer_flags_lawyer ON lawyer_flags(panel_lawyer_id, status);
CREATE INDEX IF NOT EXISTS idx_lawyer_flags_type ON lawyer_flags(flag_type) WHERE status = 'active';

-- Lawyer reassignment log: track when a lawyer is removed from a case due to violations
CREATE TABLE IF NOT EXISTS lawyer_reassignments (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  from_lawyer_id TEXT NOT NULL,
  to_lawyer_id TEXT,
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'sla_violation',
    'no_response',
    'citizen_complaint',
    'misconduct',
    'request',
    'other'
  )),
  reason_detail TEXT,
  show_cause_id TEXT REFERENCES lawyer_show_cause(id) ON DELETE SET NULL,
  reassigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reassigned_by TEXT,
  wakalatnama_cancelled INTEGER NOT NULL DEFAULT 0,
  wakalatnama_cancelled_at DATETIME,
  flagged_in_dbla INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lawyer_reassignments_case ON lawyer_reassignments(case_id);
CREATE INDEX IF NOT EXISTS idx_lawyer_reassignments_from ON lawyer_reassignments(from_lawyer_id);

-- Add accountability columns to panel_lawyers
ALTER TABLE panel_lawyers ADD COLUMN payment_frozen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE panel_lawyers ADD COLUMN red_flag_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE panel_lawyers ADD COLUMN warning_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE panel_lawyers ADD COLUMN violation_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE panel_lawyers ADD COLUMN last_violation_at DATETIME;
ALTER TABLE panel_lawyers ADD COLUMN performance_score INTEGER;
ALTER TABLE panel_lawyers ADD COLUMN cases_assigned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE panel_lawyers ADD COLUMN cases_completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE panel_lawyers ADD COLUMN cases_reassigned INTEGER NOT NULL DEFAULT 0;
