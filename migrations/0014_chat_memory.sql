-- Universal chatbot memory, ingestion and conversation log.
--
-- The memory tables are the runtime target for the "data control center": it
-- pushes batches in, the chatbot reads them, and nothing needs a redeploy.
-- `memory_version` is bumped on every successful ingest and is embedded in the
-- cached prompt prefix, so a memory change invalidates the cache exactly once.

CREATE TABLE IF NOT EXISTS chat_memory_batches (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  note TEXT,
  document_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  disabled_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'applied',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_memory_batches_created
  ON chat_memory_batches (created_at DESC);

-- One row per fact. `external_id` + `source` is the idempotency key so the
-- data control center can re-send a batch safely.
CREATE TABLE IF NOT EXISTS chat_memory_documents (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'bn',
  source_url TEXT,
  authority TEXT,
  is_core INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT NOT NULL,
  batch_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_memory_enabled ON chat_memory_documents (enabled);
CREATE INDEX IF NOT EXISTS idx_chat_memory_core ON chat_memory_documents (is_core, enabled);
CREATE INDEX IF NOT EXISTS idx_chat_memory_scope ON chat_memory_documents (scope, enabled);

-- FTS5 mirror for retrieval. Kept in step by triggers so writers only ever
-- touch the base table.
CREATE VIRTUAL TABLE IF NOT EXISTS chat_memory_fts USING fts5(
  title,
  body,
  keywords,
  content = 'chat_memory_documents',
  content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 0'
);

CREATE TRIGGER IF NOT EXISTS chat_memory_ai AFTER INSERT ON chat_memory_documents BEGIN
  INSERT INTO chat_memory_fts (rowid, title, body, keywords)
  VALUES (new.rowid, new.title, new.body, new.keywords);
END;

CREATE TRIGGER IF NOT EXISTS chat_memory_ad AFTER DELETE ON chat_memory_documents BEGIN
  INSERT INTO chat_memory_fts (chat_memory_fts, rowid, title, body, keywords)
  VALUES ('delete', old.rowid, old.title, old.body, old.keywords);
END;

CREATE TRIGGER IF NOT EXISTS chat_memory_au AFTER UPDATE ON chat_memory_documents BEGIN
  INSERT INTO chat_memory_fts (chat_memory_fts, rowid, title, body, keywords)
  VALUES ('delete', old.rowid, old.title, old.body, old.keywords);
  INSERT INTO chat_memory_fts (rowid, title, body, keywords)
  VALUES (new.rowid, new.title, new.body, new.keywords);
END;

-- Single-row version marker. Bumped on ingest so the cached prompt prefix
-- changes when memory changes.
CREATE TABLE IF NOT EXISTS chat_memory_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  memory_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO chat_memory_state (id, memory_version) VALUES (1, 1);

-- Conversation log. Visitors are identified by an opaque client id; citizens by
-- their user id. `role` is 'user' or 'assistant'.
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  used_web INTEGER NOT NULL DEFAULT 0,
  sources_json TEXT,
  memory_version INTEGER,
  cached_tokens INTEGER,
  cache_write_tokens INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages (conversation_id, created_at);
