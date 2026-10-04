-- Seed the ADR / mediation table so the DLAO calendar and booking screens have content.
--
-- `mediations` has existed since 0016 with every column the ADR flow needs, and nothing
-- ever wrote to it — so it was empty and the new calendar had nothing to show. These rows
-- are demo data for the seeded cases, placed relative to `now` so the current working week
-- is populated when it is applied.
--
-- Dates are offsets from now, not fixed calendar dates: a fixed date would be correct on
-- the day it was written and empty on every day after. The DLAO can also book live through
-- /api/portal/mediations, which is the better demo anyway.
--
-- Additive only: INSERT OR IGNORE with fixed ids, plus two narrowly scoped UPDATEs that
-- make a failed mediation consistent with its case stage.
--
-- mediator_user_id is deliberately NULL. The mediators live in `panel_lawyers`, not in
-- `users`, and that column is a foreign key to users(id) — putting a panel_lawyers id in
-- it would either fail the FK or, if FKs are off, record a dangling reference. The name
-- is carried in mediator_name, which is what the Chief's certification query already reads.

INSERT OR IGNORE INTO mediations
  (id, case_id, scheduled_at, held_by_officer, mediator_name, venue, outcome, notes, at)
VALUES
  -- Settled: this one opens a settlement row below, so the Chief console has a real
  -- three-party certification to act on rather than an empty tab.
  ('DEMO-MED-001', 'DEMO-CASE-003', datetime('now', '-12 days', '10:00'), 'ফাতেমা বেগম',
   'অ্যাডভোকেট মোঃ সালমান খান', 'জেলা লিগ্যাল এইড অফিস, সালিস কক্ষ', 'settled',
   'উভয় পক্ষ সম্মতি হয়েছে; জমির দলিল আদায় হবে।', datetime('now', '-12 days')),

  -- Failed: releases the lawyer gate with `needFailedMed`, which needs the applicant to
  -- have asked for a lawyer. That is the state the domain rules are built around.
  ('DEMO-MED-002', 'DEMO-CASE-004', datetime('now', '-8 days', '11:30'), 'নাজমা আক্তার',
   'অ্যাডভোকেট সাহানা পারভীন', 'জেলা লিগ্যাল এইড অফিস, সালিস কক্ষ', 'failed',
   'বিপরীত পক্ষ সভায় উপস্থিত হয়নি; আবেদনকারী আইনজীবী চেয়েছেন।', datetime('now', '-8 days')),

  -- Scheduled, inside the current working week so the calendar is not empty.
  ('DEMO-MED-003', 'DEMO-CASE-005', datetime('now', '+1 days', '10:00'), 'মোঃ আব্দুল করিম',
   'অ্যাডভোকেট হারুন আলী', 'জেলা লিগ্যাল এইড অফিস, সালিস কক্ষ', 'scheduled',
   'উভয় পক্ষকে সময় জানানো হয়েছে।', datetime('now', '-2 days')),

  ('DEMO-MED-004', 'DEMO-CASE-007', datetime('now', '+2 days', '11:00'), 'ফাতেমা বেগম',
   'মোঃ সফিকুল ইসলাম', 'জেলা লিগ্যাল এইড অফিস, সালিস কক্ষ', 'scheduled',
   NULL, datetime('now', '-1 days')),

  ('DEMO-MED-005', 'DEMO-CASE-008', datetime('now', '+3 days', '10:30'), 'নাজমা আক্তার',
   'সালমা খাতুন', 'জেলা লিগ্যাল এইড অফিস, সালিস কক্ষ', 'scheduled',
   'ভূমি নিয়ে দ্বন্দ্ব; ইউডিসি উদ্যোক্তাও উপস্থিত থাকবেন।', datetime('now', '-1 days')),

  -- The two persona cases where a mediation is the natural next step. A1 is the survivor
  -- whose contact is time-boxed, so a fixed appointment matters; A4 is the Marma-language
  -- applicant whose UDC must attend with her.
  ('DEMO-MED-006', 'DEMO-CASE-A1', datetime('now', '+4 days', '10:00'), 'মোঃ আব্দুল করিম',
   'ফারহানা আক্তার', 'জেলা লিগ্যাল এইড অফিস, নিরাপ্ত কক্ষ', 'scheduled',
   'মোয়ূরীর নিরাপদ সময় অনুযায়ী সময় নির্ধারিত; রিপন উপস্থিত থাকবেন।', datetime('now', '-1 days')),

  ('DEMO-MED-007', 'DEMO-CASE-A4', datetime('now', '+4 days', '14:00'), 'মোঃ রফিকুল ইসলাম',
   'ফারহানা আক্তার', 'জেলা লিগ্যাল এইড অফিস, সালিস কক্ষ', 'scheduled',
   'মারমা ভাষায় নুচিং ও ইউডিসি উদ্যোক্তা উপস্থিত থাকবেন; দোভাষী নিশ্চিত।', datetime('now', '-1 days'));

-- The settled attempt opens the certification record. certificationState in
-- lib/case/domain.ts refuses to certify until all three parties have signed, and the
-- Chief console reads exactly this table — so without this row the Chief's "pending
-- certifications" tab stays empty.
INSERT OR IGNORE INTO settlements (case_id, signed_applicant, signed_opposite, signed_mediator, certified, decree)
VALUES ('DEMO-CASE-003', 1, 'opposite:2026-01-01T00:00:00.000Z', 0, 0,
        'জমির দলিল ৩০ দিনের মধ্যে হস্তান্তর; উভয় পক্ষ সালিশে সম্মত।');

-- A failed mediation must not leave the case sitting in the 'mediation' stage. Moving it
-- back to 'review' is what makes `needFailedMed` reachable in the UI instead of only in
-- the test suite.
UPDATE cases SET stage = 'review', stage_changed_at = datetime('now', '-8 days')
 WHERE id = 'DEMO-CASE-004' AND stage = 'mediation' AND EXISTS (
   SELECT 1 FROM mediations WHERE case_id = 'DEMO-CASE-004' AND outcome = 'failed'
 );

-- A case with a settled attempt is settled. `cases.status` is deliberately left alone:
-- it is the portal-facing status, and `stage` is the lifecycle the domain rules read.
UPDATE cases SET stage = 'settled', stage_changed_at = datetime('now', '-12 days')
 WHERE id = 'DEMO-CASE-003' AND stage = 'mediation' AND EXISTS (
   SELECT 1 FROM mediations WHERE case_id = 'DEMO-CASE-003' AND outcome = 'settled'
 );
