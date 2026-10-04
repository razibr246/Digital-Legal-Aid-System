-- Three-step citizen verification journey: document -> face match -> e-signature.
CREATE TABLE IF NOT EXISTS verification_steps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  step TEXT NOT NULL CHECK (step IN ('document', 'face', 'signature')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'complete')),
  result_json TEXT,
  source TEXT NOT NULL DEFAULT 'simulated' CHECK (source IN ('simulated', 'self_service')),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, step)
);

CREATE INDEX IF NOT EXISTS idx_verification_steps_user ON verification_steps(user_id);

-- Signatures are stored in R2; this table keeps the pointer and consent record.
CREATE TABLE IF NOT EXISTS citizen_signatures (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  consent INTEGER NOT NULL DEFAULT 0 CHECK (consent IN (0, 1)),
  signed_name TEXT,
  document_type TEXT,
  document_number_masked TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_citizen_signatures_user ON citizen_signatures(user_id, created_at DESC);
