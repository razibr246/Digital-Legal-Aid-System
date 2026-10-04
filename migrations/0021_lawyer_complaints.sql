-- Applicant complaints about their appointed panel lawyer.
--
-- Deliberately NOT `misconduct_cases`. That table is a committee function carrying a
-- verdict and a bar-council referral, and it is written by the Chief or the Chairman.
-- An applicant saying "my lawyer is not answering" is a service complaint, not a
-- misconduct finding, and letting a citizen write into a misconduct record would let
-- them open a formal case against a lawyer with no adjudication behind it.
--
-- `reason_code` is machine-readable so the DLAO console can group complaints; the
-- free text is the applicant's own account, kept verbatim.

CREATE TABLE IF NOT EXISTS lawyer_service_complaints (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
  assignment_id TEXT REFERENCES panel_assignments(id) ON DELETE SET NULL,
  panel_lawyer_id TEXT,
  citizen_user_id TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'not_contacted',
    'too_slow',
    'not_listening',
    'unprofessional',
    'demanded_money',
    'refused_after_assignment',
    'other'
  )),
  details_bn TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','rejected')),
  assigned_to_user_id TEXT,
  resolution_note_bn TEXT,
  resolved_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lawyer_complaints_case ON lawyer_service_complaints(case_id);
CREATE INDEX IF NOT EXISTS idx_lawyer_complaints_lawyer ON lawyer_service_complaints(panel_lawyer_id);
CREATE INDEX IF NOT EXISTS idx_lawyer_complaints_status ON lawyer_service_complaints(status);

-- An applicant may raise one complaint per appointment per reason. Re-clicking the
-- button must not create a queue of duplicates, and a distinct new problem should
-- still be able to be reported.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lawyer_complaints_unique
  ON lawyer_service_complaints(assignment_id, reason_code)
  WHERE assignment_id IS NOT NULL;
