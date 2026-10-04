-- Mother's name is a standard field on BD NIDs; the smaller vision model
-- omitted it, so it is captured explicitly.
ALTER TABLE identity_verifications ADD COLUMN mother_name TEXT;
