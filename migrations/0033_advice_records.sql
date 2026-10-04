-- Advice records: the written record of a general inquiry handled on the 16699 line.
--
-- The guide's "Referral & mediator reports" and the officer's daily work both assume a
-- call that only advised leaves a trace. It did not: a general inquiry produced an LLM
-- answer, spoke it, and then evaporated when the tab closed. Nothing was written, so the
-- DLAO could not answer "what did we advise this person last week, and how long did it
-- take?" — which is the whole point of a legal-aid hotline.
--
-- Strictly additive, like every migration since 0015: CREATE ... IF NOT EXISTS only, no
-- ALTER of an existing table, so no live query can break.
--
-- `voice_session_id` is the idempotency key. The client upserts on it as the call
-- progresses, because a caller who closes the tab mid-answer must still leave a record;
-- without an upsert, every turn would be a new row and one call would become six.
--
-- `transcript` holds the real question/answer pairs, not a summary. An advice record a
-- citizen could not check against their own words is not evidence, and this is a legal
-- aid line: the record may be read back to the caller.
--
-- `phone_is_simulated` is recorded rather than assumed, because the browser softphone has
-- no real caller number. Anything downstream must be able to tell a simulated number from
-- a real one instead of quietly treating both as a citizen's identity.

CREATE TABLE IF NOT EXISTS advice_records (
  id TEXT PRIMARY KEY,
  ref TEXT,
  voice_session_id TEXT,
  caller_phone TEXT,
  phone_is_simulated INTEGER NOT NULL DEFAULT 1,
  language TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER,
  turn_count INTEGER NOT NULL DEFAULT 0,
  transcript TEXT,
  advice TEXT,
  topics TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  escalated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewed', 'closed')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  dlao_notes TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One record per call. The upsert depends on this being unique; without it a retried
-- POST would duplicate the record rather than update it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_advice_records_session
  ON advice_records(voice_session_id) WHERE voice_session_id IS NOT NULL;

-- The DLAO list is "newest first, filtered by status" -- this is the access path.
CREATE INDEX IF NOT EXISTS idx_advice_records_started
  ON advice_records(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_advice_records_status
  ON advice_records(status, started_at DESC);
