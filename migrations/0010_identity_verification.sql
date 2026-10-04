-- Identity verification (NID / passport) for the citizen portal.
-- All values are SIMULATED: the document "govt database" lookup and the OCR
-- extraction are not authoritative and must be confirmed by a human officer.

CREATE TABLE IF NOT EXISTS identity_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('number', 'photo')),
  document_type TEXT NOT NULL CHECK (document_type IN ('nid', 'passport')),
  document_number TEXT NOT NULL,
  document_number_masked TEXT NOT NULL,
  name_en TEXT,
  name_bn TEXT,
  father_name TEXT,
  date_of_birth TEXT,
  address TEXT,
  ocr_confidence REAL,
  ocr_engine TEXT,
  ocr_model TEXT,
  ocr_raw TEXT,
  source TEXT NOT NULL DEFAULT 'simulated' CHECK (source IN ('simulated')),
  simulated INTEGER NOT NULL DEFAULT 1 CHECK (simulated IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('verified', 'review', 'rejected')),
  name_match INTEGER CHECK (name_match IN (0, 1)),
  name_mismatch_detail TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_identity_verifications_user
  ON identity_verifications(user_id, created_at DESC);
