-- Add new columns to cases table for lawyer assignment and DLAO notes
ALTER TABLE cases ADD COLUMN assigned_lawyer_id TEXT REFERENCES users(id);
ALTER TABLE cases ADD COLUMN dlao_notes TEXT;

-- Create case_updates table for tracking timeline
CREATE TABLE IF NOT EXISTS case_updates (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_case_updates_case_id ON case_updates(case_id);
