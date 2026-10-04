ALTER TABLE applications ADD COLUMN source_language TEXT NOT NULL DEFAULT 'bn';
ALTER TABLE applications ADD COLUMN original_transcript TEXT;
ALTER TABLE applications ADD COLUMN semantic_matched INTEGER NOT NULL DEFAULT 0;
ALTER TABLE applications ADD COLUMN semantic_confidence REAL;
ALTER TABLE applications ADD COLUMN semantic_intent TEXT;
ALTER TABLE applications ADD COLUMN semantic_normalized_bangla TEXT;

CREATE TABLE IF NOT EXISTS semantic_bridge_events (
  id TEXT PRIMARY KEY,
  case_id TEXT,
  application_id TEXT,
  voice_session_id TEXT,
  source_language TEXT NOT NULL,
  raw_transcript TEXT NOT NULL,
  normalized_bangla TEXT,
  legal_intent TEXT,
  legal_intent_bn TEXT,
  confidence REAL,
  matched_terms_json TEXT,
  user_confirmed INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_semantic_bridge_events_case_id ON semantic_bridge_events(case_id);
CREATE INDEX IF NOT EXISTS idx_semantic_bridge_events_language ON semantic_bridge_events(source_language);
CREATE INDEX IF NOT EXISTS idx_semantic_bridge_events_confidence ON semantic_bridge_events(confidence);

CREATE TABLE IF NOT EXISTS indigenous_lexicon_reviews (
  id TEXT PRIMARY KEY,
  source_language TEXT NOT NULL,
  event_id TEXT,
  original_term TEXT,
  original_interpretation TEXT,
  corrected_bangla TEXT,
  corrected_intent TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME,
  FOREIGN KEY (event_id) REFERENCES semantic_bridge_events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_indigenous_lexicon_reviews_status ON indigenous_lexicon_reviews(status);
