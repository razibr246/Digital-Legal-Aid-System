CREATE TABLE IF NOT EXISTS call_recordings (
  id TEXT PRIMARY KEY,
  voice_session_id TEXT NOT NULL UNIQUE,
  docket_id TEXT,
  citizen_user_id TEXT,
  object_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (citizen_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_call_recordings_docket_id ON call_recordings(docket_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_citizen_user_id ON call_recordings(citizen_user_id);
