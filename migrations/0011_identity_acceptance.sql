-- A verification result only becomes "accepted" once the citizen confirms it.
-- The OCR/lookup result is a proposal; this records their sign-off.
ALTER TABLE identity_verifications ADD COLUMN accepted_at TEXT;
ALTER TABLE identity_verifications ADD COLUMN accepted_display_name TEXT;

CREATE INDEX IF NOT EXISTS idx_identity_verifications_accepted
  ON identity_verifications(user_id, accepted_at);
