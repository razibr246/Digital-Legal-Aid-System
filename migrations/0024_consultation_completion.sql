-- Separates "the applicant started watching" from "the applicant finished".
--
-- The first attempt reused `applicant_viewed_at` for both, which meant that after the
-- very first progress ping a reload treated the conversation as already seen and
-- declined to reopen it — so an interrupted playback could never be resumed, which is
-- the opposite of what a resume is for.
--
-- `applicant_completed_at` is set when playback reaches the end, whether it played out
-- or was skipped. Only that suppresses the auto-open. `applicant_viewed_at` and
-- `applicant_last_seq` continue to mean "where they got to".

ALTER TABLE consultations ADD COLUMN applicant_completed_at DATETIME;
