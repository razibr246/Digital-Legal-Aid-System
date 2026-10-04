CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('citizen', 'dlao_officer', 'chief_legal_aid_officer', 'metropolitan_legal_aid_officer', 'special_mediator', 'paralegal', 'udc_entrepreneur')),
  display_name TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'pending')),
  is_mock INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  docket_id TEXT NOT NULL UNIQUE,
  citizen_user_id TEXT NOT NULL,
  voice_session_id TEXT NOT NULL UNIQUE,
  problem TEXT NOT NULL,
  has_disability INTEGER,
  gender TEXT,
  district TEXT,
  thana TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (citizen_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_cases_citizen_user_id ON cases(citizen_user_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
