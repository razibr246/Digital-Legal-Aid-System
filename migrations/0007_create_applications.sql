CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  application_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applicant_user_id TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  primary_contact_number TEXT,
  has_disability INTEGER NOT NULL DEFAULT 0 CHECK (has_disability IN (0, 1)),
  disability_type TEXT,
  gender TEXT,
  address TEXT,
  problem_statement TEXT NOT NULL,
  case_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'voice' CHECK (source IN ('voice', 'portal', 'manual')),
  source_voice_session_id TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (applicant_user_id) REFERENCES users(id),
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_applications_applicant_user_id ON applications(applicant_user_id);
CREATE INDEX IF NOT EXISTS idx_applications_application_time ON applications(application_time);
CREATE INDEX IF NOT EXISTS idx_applications_source_voice_session_id ON applications(source_voice_session_id);

INSERT OR IGNORE INTO applications (
  id,
  application_time,
  applicant_user_id,
  applicant_name,
  primary_contact_number,
  has_disability,
  disability_type,
  gender,
  address,
  problem_statement,
  case_id,
  source,
  source_voice_session_id,
  created_at,
  updated_at
)
SELECT
  CASE
    WHEN c.docket_id LIKE 'DLAS-%' THEN 'APP-' || substr(c.docket_id, 6)
    ELSE 'APP-' || c.id
  END,
  COALESCE(c.created_at, CURRENT_TIMESTAMP),
  c.citizen_user_id,
  COALESCE(NULLIF(u.display_name, ''), 'Not provided'),
  NULLIF(u.phone, ''),
  COALESCE(c.has_disability, 0),
  c.disability_type,
  c.gender,
  NULLIF(c.thana, ''),
  COALESCE(c.problem, ''),
  c.id,
  'voice',
  c.voice_session_id,
  COALESCE(c.created_at, CURRENT_TIMESTAMP),
  COALESCE(c.updated_at, CURRENT_TIMESTAMP)
FROM cases c
JOIN users u ON u.id = c.citizen_user_id;
