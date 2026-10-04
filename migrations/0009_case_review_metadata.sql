ALTER TABLE applications ADD COLUMN intake_summary TEXT;
ALTER TABLE applications ADD COLUMN urgency TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE applications ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE applications ADD COLUMN severity_level TEXT;
ALTER TABLE applications ADD COLUMN severity_category TEXT;
ALTER TABLE applications ADD COLUMN severity_factors_json TEXT;

CREATE INDEX IF NOT EXISTS idx_applications_urgency ON applications(urgency);
CREATE INDEX IF NOT EXISTS idx_applications_priority ON applications(priority);
