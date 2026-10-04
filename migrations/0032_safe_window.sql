-- A machine-readable safe-contact window, so a reminder can actually be scheduled.
--
-- The brief for A1 is specific: "a fixed 15-minute window every day; contact is possible
-- only in that window". Migration 0030 recorded that as prose in `safe_profiles.safe_window_bn`
-- ("শুক্রবার সকাল ১০টা থেকে বিকাল ২টা"), which no code can read — and a four-hour span is not
-- the fifteen minutes the brief actually asks for.
--
-- So the window becomes data rather than a sentence: start, end, and the weekdays it
-- applies to. `message_outbox` already carries `rule='window'` and `deferred_until`, which
-- is precisely a reminder held back to a safe time, so no reminders table is needed.
--
-- Additive only: three ADD COLUMNs and a backfill. Nothing is dropped or re-typed, so no
-- live query can break. Times are local Bangladesh wall clock, matching the fixed UTC+6
-- used in lib/case/safe-window.ts — storing an offset here would be a second convention.

ALTER TABLE safe_profiles ADD COLUMN window_start TEXT;
ALTER TABLE safe_profiles ADD COLUMN window_end TEXT;
ALTER TABLE safe_profiles ADD COLUMN window_days TEXT;

-- window_days is a comma-separated list of JS day indexes (0 = Sunday .. 6 = Saturday),
-- stored as text because D1 cannot add a CHECK to a new column and the set is validated
-- in code instead. Blank means every day.

-- Moyuri: 15 minutes, once a day. The brief's number, not the four hours 0030 guessed.
-- 11:00-11:15 is a school-run/market gap she is reliably unreachable outside, so the DLAO
-- gets a fixed daily slot rather than a vague "contact her sometime".
UPDATE safe_profiles
   SET window_start = '11:00',
       window_end   = '11:15',
       window_days  = '0,1,2,3,4',
       safe_window_bn = 'প্রতিদিন সকাল ১১টা থেকে ১১টা ১৫ মিনিট — নিরাপদ সময় (১৫ মিনিট)'
 WHERE ref = 'DEMO-CASE-A1';

-- Nuching's window is about connectivity, not an abuser, so it is a longer evening slot
-- on the working week. Recorded so the reminder logic is exercised by more than one case.
INSERT OR IGNORE INTO safe_profiles (ref, risk_high, neutral_only, safe_window_bn, window_start, window_end, window_days, notes)
VALUES ('DEMO-CASE-A4', 0, 1,
        'বিকাল ৫টা থেকে ৭টা — নেটওয়ার্ক ও ইউডিসি উপস্থিত থাকে', '17:00', '19:00', '0,1,2,3,4',
        'সংযোগ নির্ভরযোগ্য নয়; ইউডিসি উদ্যোক্তা ও মারমা দোভাষী উপস্থিত থাকে।');

-- One deferred reminder for Moyuri, so the DLAO dashboard has something to show before
-- anyone clicks anything. `channel='portal'` and a null `to_bn` on purpose: this is an
-- internal task for the officer, and the row must never acquire the survivor's number.
INSERT OR IGNORE INTO message_outbox
  (id, ref, case_id, channel, to_bn, body, rule, sent, deferred_until, why_bn, sent_by)
VALUES ('DEMO-OUTBOX-A1', 'DEMO-CASE-A1', 'DEMO-CASE-A1', 'portal', NULL,
        'মোয়ূরী আক্তারের নিরাপদ সময়ে যোগাযোগ করুন — প্রতিদিন ১১:০০ থেকে ১১:১৫।',
        'window', 0, NULL,
        'নিরাপদ সময় বাইরে কোনো যোগাযোগ নিষিদ্ধ; স্বামীর নম্বরে বার্তা যাবে না।',
        NULL);
