-- Links a panel lawyer's login account to their roster entry.
--
-- The case list for an appointed lawyer was resolved by matching `panel_lawyers.name_bn`
-- against the session user's display name. That is not an identity: a mock lawyer's
-- display name is a placeholder and matches nothing, so a real appointment looked like
-- no cases at all; and two lawyers sharing a name would see each other's cases. A name
-- is not a key.
--
-- Backfilled by exact name only where the name genuinely matches an existing panel
-- login, and deliberately left null otherwise rather than guessed — a wrong link here
-- shows one lawyer another lawyer's confidential cases, which is worse than showing
-- none.

ALTER TABLE panel_lawyers ADD COLUMN user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_lawyers_user
  ON panel_lawyers(user_id) WHERE user_id IS NOT NULL;

-- The mock panel identity the staff login demo uses, so the console has a lawyer who
-- can actually see their own appointments.
UPDATE panel_lawyers
   SET user_id = (
     SELECT u.id FROM users u
      WHERE u.is_mock = 1
        AND (u.role_key = 'panel' OR u.role IN ('panel_lawyer', 'MOCK-panel_lawyer'))
      ORDER BY u.id LIMIT 1
   )
 WHERE user_id IS NULL
   AND EXISTS (
     SELECT 1 FROM users u
      WHERE u.is_mock = 1
        AND (u.role_key = 'panel' OR u.role IN ('panel_lawyer', 'MOCK-panel_lawyer'))
   )
   AND id = (SELECT id FROM panel_lawyers ORDER BY id LIMIT 1);

-- Exact-name backfill for real accounts only. No LIKE, no partial match.
UPDATE panel_lawyers
   SET user_id = (SELECT u.id FROM users u WHERE u.display_name = panel_lawyers.name_bn LIMIT 1)
 WHERE user_id IS NULL
   AND EXISTS (SELECT 1 FROM users u WHERE u.display_name = panel_lawyers.name_bn AND u.is_mock = 0);
