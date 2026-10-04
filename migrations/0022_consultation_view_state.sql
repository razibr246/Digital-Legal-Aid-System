-- What the applicant has actually seen of their consultation.
--
-- The playback was driven entirely by client state, so a reload replayed the whole
-- conversation from turn 1 — the applicant re-read the same callback every time they
-- refreshed, and there was no way to resume mid-way.
--
-- `applicant_last_seq` stores the last turn that reached the screen, so an interrupted
-- consultation resumes where it stopped instead of restarting. `applicant_viewed_at`
-- records that playback began, so the modal does not auto-open again on a later visit.
--
-- Both are about presentation only. `status` and the transcript remain the record of
-- what happened, and a DLAO can always replay the full conversation from the case.
ALTER TABLE consultations ADD COLUMN applicant_viewed_at DATETIME;
ALTER TABLE consultations ADD COLUMN applicant_last_seq INTEGER NOT NULL DEFAULT 0;
