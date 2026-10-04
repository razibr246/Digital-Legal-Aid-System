-- Part A — the five citizen scenarios, as one-click demo accounts.
--
-- The brief (Part A) names five personas and is explicit that they are MANDATORY, not
-- alternatives: the prototype has to show how the same architecture resolves each
-- person's barrier. Migration 0028 seeded a generic CIT-D0xx cast for the Chief console;
-- that cast is disconnected from the brief and none of its rows can log in (no
-- pin_hash), so it cannot demonstrate anything about these five.
--
-- This migration seeds the real cast, with `is_mock = 1` and `cases.is_demo = 1` on
-- every row so nothing here can be mistaken for a real applicant.
--
-- Ids are FIXED strings, and every insert is INSERT OR IGNORE. `app/api/portal/
-- demo-login` creates the same ids on demand, so the one-click path works whether or
-- not this migration has been applied — and the two converge on one row instead of
-- racing to create two.
--
-- Additive only: every statement is INSERT OR IGNORE. Nothing is dropped, renamed or
-- re-typed, so no live query can break. Same reasoning as 0016 and 0029.
--
-- `users.role` keeps the legacy seat 'citizen' (it is in the original CHECK and the
-- CHECK cannot be widened — see 0015). No role_key: citizen has no canonical staff key.

-- ---------------------------------------------------------------------------
-- Accounts
--
-- pin_hash is the plain SHA-256 hex of the PIN, which is what
-- handleVoiceLoginRequest verifies. The PINs are 1001-1005 so a reviewer can also
-- walk the REAL phone + PIN login form, not just the one-click shortcut.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO users
  (id, role, display_name, phone, status, verification_status, pin_hash, is_mock)
VALUES
  ('DEMO-CIT-A1', 'citizen', 'মোয়ূরী আক্তার', '01911000101', 'active', 'verified', 'fe675fe7aaee830b6fed09b64e034f84dcbdaeb429d9cccd4ebb90e15af8dd71', 1),
  ('DEMO-CIT-A2', 'citizen', 'রিপন',          '01911000102', 'active', 'verified', 'b281bc2c616cb3c3a097215fdc9397ae87e6e06b156cc34e656be7a1a9ce8839', 1),
  ('DEMO-CIT-A3', 'citizen', 'নাবিলা',         '01911000103', 'active', 'verified', '8c9a013ab70c0434313e3e881c310b9ff24aff1075255ceede3f2c239c231623', 1),
  ('DEMO-CIT-A4', 'citizen', 'নুচিং মারমা',    '01911000104', 'active', 'verified', '75992a5ac67ff644d3063976c2effd10bdd93fcc109798e3d5c1acf2e530d01a', 1),
  ('DEMO-CIT-A5', 'citizen', 'আব্দুল মালেক',   '01911000105', 'active', 'verified', '7f861bcee185de001377d79e08af62e94b1e7718e2470e08520c917f8d953602', 1);

-- ---------------------------------------------------------------------------
-- Cases
--
-- `status` and `stage` are two different columns and are deliberately both written:
-- status is the portal-facing status that mapPortalCase and the citizen list read,
-- stage is the lifecycle the domain rules operate on. A5 is the stale one — 213 days
-- in 'lawyer' — which is what makes the overdue-lawyer story visible rather than
-- asserted.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO cases
  (id, docket_id, citizen_user_id, voice_session_id, problem, has_disability,
   disability_type, gender, district, thana, category, status, stage, sensitive,
   district_code, stage_changed_at, problem_category, is_demo, created_at, updated_at)
VALUES
  ('DEMO-CASE-A1', 'DLAS-2025-JYP-0141', 'DEMO-CIT-A1', 'VS-DEMO-A1',
   'আমার স্বামী আমাকে নিয়মিত মারধর করেন এবং বাড়ি থেকে বের করে দিয়েছেন। আমি একটি নিরাপদ জায়গায় আছি। আমার পরিচয়পত্র এখন আমার কাছে নেই।',
   0, NULL, 'female', 'জয়পুরহাট', 'জয়পুরহাট সদর', 'family', 'submitted', 'review', 1,
   'JYP', datetime('now', '-12 days'), 'family', 1, datetime('now', '-12 days'), datetime('now', '-12 days')),

  ('DEMO-CASE-A2', 'DLAS-2025-JYP-0142', 'DEMO-CIT-A2', 'VS-DEMO-A2',
   'আমি দৃষ্টিহীন। আমার পিতার রেখে যাওয়া জমি নিয়ে ভাই আমাকে ঠকাতে চাইছেন। ফরম বা পিডিএফ আমি পড়তে পারি না, তাই ভয়েস ও কলের মাধ্যমে আবেদন করতে চাই।',
   1, 'দৃষ্টিহীন', 'male', 'জয়পুরহাট', 'জয়পুরহাট সদর', 'land', 'submitted', 'submitted', 0,
   'JYP', datetime('now', '-4 days'), 'land', 1, datetime('now', '-4 days'), datetime('now', '-4 days')),

  ('DEMO-CASE-A3', 'DLAS-2025-JHI-0088', 'DEMO-CIT-A3', 'VS-DEMO-A3',
   'আমার একজন পুরোনো সহপাঠী আমার ছবি বদলে সাজিয়ে অশ্লীল মেসেজ পাঠাচ্ছেন এবং ভয় দিচ্ছেন। আমার ফোন নম্বর ও ছবি অন্যদের কাছে ছড়িয়ে দেওয়া হচ্ছে। আমি খুব ভয় পাচ্ছি।',
   0, NULL, 'female', 'ঝিনাইদহ', 'ঝিনাইদহ সদর', 'cyber_crime', 'submitted', 'submitted', 1,
   'JHI', datetime('now', '-2 days'), 'cyber_crime', 1, datetime('now', '-2 days'), datetime('now', '-2 days')),

  ('DEMO-CASE-A4', 'DLAS-2025-KHG-0231', 'DEMO-CIT-A4', 'VS-DEMO-A4',
   'আমার বাসার জমি আমার মা উইল্ট করে গেছেন। আমার ভাই আমাকে জমি থেকে বের করার চেষ্টা করছেন। আমি পড়তে পারি না, মারমায় কথা বলি।',
   0, NULL, 'female', 'খাগড়াছড়ি', 'খাগড়াছড়ি সদর', 'land', 'submitted', 'review', 0,
   'KHG', datetime('now', '-9 days'), 'land', 1, datetime('now', '-9 days'), datetime('now', '-9 days')),

  ('DEMO-CASE-A5', 'DLAS-2025-0992', 'DEMO-CIT-A5', 'VS-DEMO-A5',
   'দোকান থেকে ভাড়ায় দেওয়া টাকা পাওনা যায়নি। আমি সাত মাস ধরে মামলা করেছি, কিন্তু কোনো খবর পাইনি। দোকানের ফোনে নথি থাকে, ঘুরে আসতে মজুরি লাগে।',
   0, NULL, 'male', 'বরগুনা', 'বরগুনা সদর', 'labour', 'under_review', 'lawyer', 0,
   'BAR', datetime('now', '-213 days'), 'labour', 1, datetime('now', '-196 days'), datetime('now', '-41 days'));

-- The applications row the portal reads for problem statement, urgency and severity.
-- A4 is the interesting one: source_language 'marma' with the Bangla reading kept
-- separately, which is what lets inferLegalCategory work on the translation.
INSERT OR IGNORE INTO applications
  (id, applicant_user_id, applicant_name, primary_contact_number, has_disability,
   disability_type, gender, address, problem_statement, case_id, source,
   source_voice_session_id, source_language, original_transcript, semantic_matched,
   semantic_confidence, semantic_intent, semantic_normalized_bangla, intake_summary,
   urgency, priority, severity_level, severity_category, severity_factors_json)
VALUES
  ('APP-DEMO-A1', 'DEMO-CIT-A1', 'মোয়ূরী আক্তার', '01911000101', 0, NULL, 'female',
   'জয়পুরহাট সদর', 'আমার স্বামী আমাকে নিয়মিত মারধর করেন।', 'DEMO-CASE-A1', 'voice',
   'VS-DEMO-A1', 'bn', 'আমার স্বামী আমাকে মারধর করেন', 1, 0.92,
   'domestic_violence', 'আমার স্বামী আমাকে নিয়মিত মারধর করেন',
   'পারিবারিক সহিংসতা; নিরাপত্তা ঝুঁকি', 'emergency_danger', 'urgent', 'emergency', 'safety',
   '["violence","restricted_contact","no_nid","proxy_report"]'),

  ('APP-DEMO-A2', 'DEMO-CIT-A2', 'রিপন', '01911000102', 1, 'দৃষ্টিহীন', 'male',
   'জয়পুরহাট সদর', 'পিতার জমি নিয়ে উত্তরাধিকার বিরোধ।', 'DEMO-CASE-A2', 'voice',
   'VS-DEMO-A2', 'bn', 'আমার পিতার জমি নিয়ে ভাই আমাকে ঠকাতে চাইছেন', 1, 0.88,
   'inheritance_dispute', 'আমার পিতার জমি নিয়ে ভাই আমাকে ঠকাতে চাইছেন',
   'উত্তরাধিকার বিরোধ; দৃষ্টিহীন আবেদনকারী', 'normal', 'normal', 'standard', 'vulnerability',
   '["visually_impaired","voice_only"]'),

  ('APP-DEMO-A3', 'DEMO-CIT-A3', 'নাবিলা', '01911000103', 0, NULL, 'female',
   'ঝিনাইদহ সদর', 'ভয়েজর মর্যাদাহানি ও অশ্লীল ছবি ছড়ানো।', 'DEMO-CASE-A3', 'voice',
   'VS-DEMO-A3', 'bn', 'আমার ছবি বদলে অশ্লীল মেসেজ পাঠানো হচ্ছে', 1, 0.95,
   'cyber_defamation', 'আমার ছবি বদলে অশ্লীল মেসেজ পাঠানো হচ্ছে এবং ভয় দেওয়া হচ্ছে',
   'সাইবার ভয়েজর মর্যাদাহানি; জরুরি', 'emergency_danger', 'urgent', 'emergency', 'safety',
   '["non_consensual_images","threats","sensitive_evidence","needs_referral"]'),

  ('APP-DEMO-A4', 'DEMO-CIT-A4', 'নুচিং মারমা', NULL, 0, NULL, 'female',
   'খাগড়াছড়ি সদর', 'মারমা ভাষায় জমি সংক্রান্ত আবেদন।', 'DEMO-CASE-A4', 'voice',
   'VS-DEMO-A4', 'marma',
   'Ami palte pari na. Mara kotha boli. Amar bashar jomi amir maa wilte korechen.', 1, 0.74,
   'property_dispute', 'আমার বাসার জমি আমার মা উইল্ট করে গেছেন। আমার ভাই আমাকে জমি থেকে বের করার চেষ্টা করছেন। আমি পড়তে পারি না, মারমায় কথা বলি।',
   'জমি উত্তরাধিকার; ইউডিসি সহায়তায় আবেদন', 'normal', 'high', 'high', 'vulnerability',
   '["cannot_read","marma_language","no_own_number","assisted_intake"]'),

  ('APP-DEMO-A5', 'DEMO-CIT-A5', 'আব্দুল মালেক', '01911000105', 0, NULL, 'male',
   'বরগুনা সদর', 'ভাড়ায় দেওয়া টাকা পাওনা যায়নি; সাত মাস ধরে মামলা।', 'DEMO-CASE-A5', 'voice',
   'VS-DEMO-A5', 'bn', 'আমি সাত মাস ধরে মামলা করেছি কিন্তু কোনো খবর পাইনি', 1, 0.9,
   'wage_recovery', 'দোকান থেকে ভাড়ায় দেওয়া টাকা পাওনা যায়নি',
   'শ্রম বিষয়; দীর্ঘস্থায়ী ও আইনি নিষ্ক্রিয়তা', 'normal', 'normal', 'standard', NULL,
   '["stale_case","unstable_contact","lawyer_inactive"]');

-- ---------------------------------------------------------------------------
-- A1 — Moyuri. Safe contact.
--
-- The brief's failure test is "an unsafe person answers the phone", so the rule has to
-- live in data, not in a comment. The husband's number is 'block'; Moyuri's own number
-- is 'window' with a stated reason. UNIQUE (ref, channel) means a second row cannot
-- silently disagree with the first.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO safe_profiles (ref, risk_high, neutral_only, safe_window_bn, notes)
VALUES ('DEMO-CASE-A1', 1, 1, 'শুক্রবার সকাল ১০টা থেকে বিকাল ২টা — নিরাপদ সময়',
        'স্বামীর নিয়ন্ত্রণে থাকেন। কোনো বার্তা স্বামীর নম্বরে যাওয়া যাবে না।');

INSERT OR IGNORE INTO safe_contact_destinations (id, ref, channel, kind_bn, to_bn, rule, why_bn)
VALUES
  ('DEMO-CCD-A1-SMS', 'DEMO-CASE-A1', 'sms', 'অস্বামীর নম্বর', '01911000101', 'window',
   'শুধু নির্ধারিত নিরাপদ সময়ে; বাইরে পাঠালে স্বামী দেখতে পাবেন।'),
  ('DEMO-CCD-A1-VOICE', 'DEMO-CASE-A1', 'voice', 'অস্বামীর নম্বর', '01911000101', 'window',
   'কল করার আগে নিরাপদ সময় নিশ্চিত করা বাধ্যতামূলক।'),
  ('DEMO-CCD-A1-PORTAL', 'DEMO-CASE-A1', 'portal', 'অস্বামীর নম্বর', '01911000101', 'window',
   'পোর্টাল বার্তা ফোনে না গেলে নিরাপদ, তবে সময় বাধ্য।'),
  -- The husband's number. This is the row the brief's failure test actually lands on.
  ('DEMO-CCD-A1-REP', 'DEMO-CASE-A1', 'rep', 'স্বামীর নম্বর', '01911000109', 'block',
   'স্বামীর কাছে কোনো তথ্য যাবে না; রিপনের মাধ্যমে যোগাযোগ।');

-- The report Ripon phoned in is recorded as coming from him, on his own case, so it can
-- never be read back to Moyuri as though she had said it. A1's own account stays
-- unconfirmed because she has not been able to speak it yet.
INSERT OR IGNORE INTO case_facts
  (id, ref, key, label_bn, label_en, value_bn, value_en, confirmed, supplied_by_role, supplied_by_name, confirmed_by, confirmed_at)
VALUES
  ('DEMO-CF-A1-NID', 'DEMO-CASE-A1', 'national_id',
   'জাতীয় পরিচয়পত্র', 'National ID',
   'ফটোকপি আছে কিন্তু মোয়ূরীর কাছে নেই', 'A copy exists but Moyuri does not hold it',
   0, 'representative', 'রিপন', NULL, NULL),
  ('DEMO-CF-A1-PROXY', 'DEMO-CASE-A1', 'reported_by',
   'রিপোর্টকারী', 'Reported by',
   'রিপন (ভাই) — ১৬৬৯৯ নম্বরে ফোন করেছেন', 'Ripon (brother) — called on 16699',
   1, 'representative', 'রিপন', 'DLAO-001', datetime('now', '-11 days')),
  ('DEMO-CF-A1-ACCOUNT', 'DEMO-CASE-A1', 'her_own_account',
   'মোয়ূরীর নিজের বক্তব্য', "Moyuri's own account",
   'এখনো নথিভুক্ত হয়নি — নিরাপদ সময়ে ভয়েসে নেওয়া হবে', 'Not yet taken — to be captured by voice in her safe window',
   0, 'system', 'সিস্টেম', NULL, NULL);

-- ---------------------------------------------------------------------------
-- A2 — Ripon. Representation authority.
--
-- `case_reps` exists for exactly this case: someone speaking for the applicant, and
-- the record has to say what they can physically do and what they are allowed to see.
-- can_access / cannot_access are separate fields on purpose — the brief's requirement
-- is that the record shows what Moyuri has and has NOT confirmed.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO case_reps
  (id, case_id, application_id, name_bn, name_en, age, relation_bn, channel,
   authority_bn, authority_confirmed, can_access_bn, cannot_access_bn, screen_reader_bn,
   wants_own_account)
VALUES
  ('DEMO-REP-A2', 'DEMO-CASE-A1', 'APP-DEMO-A1', 'রিপন', 'Ripon', 34, 'ভাই (সহায়ক প্রতিনিধি)',
   'voice',
   'মোয়ূরীর পক্ষে আবেদন ও প্রাথমিক তথ্য সংগ্রহ করতে পারবেন। আইনি দায়বদ্ধ ওয়াকালতা নয়।',
   0,
   'আবেদনের অবস্থা, নিরাপদ সময়, রিপোর্ট যা তিনি নিজে দিয়েছেন।',
   'মোয়ূরীর NID, ঠিকানার বিবরণ, এবং তালাক/অধিকারের চূড়ান্ত কাগজ — মোয়ূরী নিজে নিশ্চিত না করা পর্যন্ত।',
   'কোনো ভিজ্যুয়াল ফর্ম, পিডিএফ, ক্যাপচা বা ভিজ্যুয়াল ওটিপি ব্যবহার করতে পারেন না।',
   1);

-- His own case, in his own name. The brief requires that he can finish one meaningful
-- Bangla task independently, so he needs a task of his own and not only a proxy role.
INSERT OR IGNORE INTO case_facts
  (id, ref, key, label_bn, label_en, value_bn, value_en, confirmed, supplied_by_role, supplied_by_name, confirmed_by, confirmed_at)
VALUES
  ('DEMO-CF-A2-CHANNEL', 'DEMO-CASE-A2', 'intake_channel',
   'গ্রহণের মাধ্যম', 'Intake channel',
   '১৬৬৯৯ ভয়েস কল — কোনো ভিজ্যুয়াল পদক্ষেপ নেই', '16699 voice call — no visual step',
   1, 'applicant', 'রিপন', NULL, NULL),
  ('DEMO-CF-A2-ACCESS', 'DEMO-CASE-A2', 'accessibility_need',
   'প্রাপ্যতার চাহিদা', 'Accessibility need',
   'স্ক্রিনরিডার + কোনো ভিজ্যুয়াল ওটিপি নয়', 'Screen reader, never a visual OTP',
   1, 'applicant', 'রিপন', NULL, NULL);

-- ---------------------------------------------------------------------------
-- A3 — Nabila. Restricted evidence and a tracked referral.
--
-- sensitive = 1 on the case, which the citizen list deliberately EXEMPTS from its own
-- sensitive-case filter: restricting a case means restricting who *else* may see it,
-- never the person it is about. The evidence stays restricted to the DLAO/Chief.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO case_facts
  (id, ref, key, label_bn, label_en, value_bn, value_en, confirmed, supplied_by_role, supplied_by_name, confirmed_by, confirmed_at)
VALUES
  ('DEMO-CF-A3-EVIDENCE', 'DEMO-CASE-A3', 'evidence_class',
   'প্রমাণের শ্রেণি', 'Evidence class',
   'অত্যন্ত সংবেদনশীল — কেবল DLAO ও প্রধান DLAO', 'Highly sensitive — DLAO and Chief only',
   1, 'officer', 'DLAO-001', 'DLAO-001', datetime('now', '-1 days')),
  ('DEMO-CF-A3-REFERRAL', 'DEMO-CASE-A3', 'referral_target',
   'রেফার করা কর্তৃপক্ষ', 'Referred authority',
   'সাইবার অপরাধ বিভাগ, ঝিনাইদহ', 'Cyber crime unit, Jhenaidah',
   1, 'officer', 'DLAO-001', 'DLAO-001', datetime('now', '-1 days')),
  -- No acknowledgement yet. This is the brief's failure test, present as data so the
  -- escalation clock is real rather than narrated.
  ('DEMO-CF-A3-ACK', 'DEMO-CASE-A3', 'referral_acknowledged',
   'রেফারেল স্বীকৃতি', 'Referral acknowledgement',
   'এখনো স্বীকৃতি পাওয়া যায়নি — ৭২ ঘণ্টার সময়সীমা পেরিয়েছে', 'No acknowledgement yet — past the 72-hour window',
   0, 'system', 'সিস্টেম', NULL, NULL);

-- ---------------------------------------------------------------------------
-- A4 — Nuching Marma. Provenance.
--
-- The brief requires the record to distinguish what she SAID from what was TYPED.
-- `case_facts` has UNIQUE (ref, key), so the two live under different keys and cannot
-- overwrite each other — which is the whole point.
--
-- has_disability is deliberately left 0 on her rows. "Cannot read" is a real access
-- barrier but it is not the disability field, and claiming it here would misrepresent
-- the applicant. The barrier is recorded as a fact with its provenance instead.
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO case_facts
  (id, ref, key, label_bn, label_en, value_bn, value_en, confirmed, supplied_by_role, supplied_by_name, confirmed_by, confirmed_at)
VALUES
  ('DEMO-CF-A4-SPOKEN', 'DEMO-CASE-A4', 'applicant_own_words',
   'নুচিং নিজের মারমা বক্তব্য', "Nuching's own Marma words",
   'Ami palte pari na. Mara kotha boli. Amar bashar jomi amir maa wilte korechen.',
   'Spoken by Nuching, recorded from a 16699 call, 9 days ago',
   1, 'applicant', 'নুচিং মারমা', NULL, NULL),
  ('DEMO-CF-A4-TYPED', 'DEMO-CASE-A4', 'udc_typed_reading',
   'ইউডিসির টাইপ করা বাংলা অনুবাদ', 'UDC-typed Bangla reading',
   'আমার বাসার জমি আমার মা উইল্ট করে গেছেন। আমার ভাই আমাকে জমি থেকে বের করার চেষ্টা করছেন। আমি পড়তে পারি না, মারমায় কথা বলি।',
   'Typed by the UDC entrepreneur — a TRANSLATION, not the applicant''s words',
   0, 'udc', 'ইউডিসি উদ্যোক্তা', NULL, NULL),
  ('DEMO-CF-A4-CONSENT', 'DEMO-CASE-A4', 'translation_consent',
   'অনুবাদের সম্মতি', 'Consent to the translation',
   'কোথাও নথিভুক্ত নয় — সম্মতি ছাড়া অনুবাদ স্থাপনযোগ্য নয়', 'Not on record — the translation is not usable without it',
   0, 'udc', 'ইউডিসি উদ্যোক্তা', NULL, NULL),
  ('DEMO-CF-A4-OWN_NUMBER', 'DEMO-CASE-A4', 'own_phone',
   'নিজের মোবাইল নম্বর', 'Own mobile number',
   'নেই — ইউডিসির নম্বরেই সব যোগাযোগ', 'None — all contact runs through the UDC''s number',
   1, 'udc', 'ইউডিসি উদ্যোক্তা', NULL, NULL),
  ('DEMO-CF-A4-DOCS', 'DEMO-CASE-A4', 'document_gaps',
   'নথির ঘাটতি', 'Document gaps',
   'ওয়ারিশন সনদ ও জমির খতিয়ান অনুপলব্ধ; কালার ছবি আংশিক', 'Mutation certificate and land record missing; 3 of 4 photos unusable',
   0, 'officer', 'DLAO-001', NULL, NULL);

-- ---------------------------------------------------------------------------
-- A5 — Abdul Malek. Stale case, inactive lawyer.
--
-- The story is only credible if the clock and the accountability records agree, so
-- both are written. 213 days is 7 months; the lawyer stage began 196 days ago.
-- ---------------------------------------------------------------------------

-- A demo lawyer, prefixed DEMO- so it cannot be mistaken for a roster entry. 0025
-- generates the real roster and is explicitly marked "do not hand-edit".
INSERT OR IGNORE INTO panel_lawyers
  (id, kind, name_bn, name_en, bar_registration, enrolment_year, enrolment_number,
   certificate_number, jurisdiction_district_name, specialisations, phone, email, list_status)
VALUES
  ('DEMO-PL-A5', 'lawyer', 'অ্যাডভোকেট হারুন আলী', 'Advocate Harun Ali', 'A-9901', '2015',
   'E-2015-0777', 'BC-91001', 'বরগুনা', 'শ্রম আইন, জমিনা', '01911000109',
   'advocate.demo-pl-a5@example.org', 'on_panel');

INSERT OR IGNORE INTO case_stage_history (id, case_id, from_stage, to_stage, changed_by, changed_by_role, note, at)
VALUES
  ('DEMO-CSH-A5-1', 'DEMO-CASE-A5', 'submitted', 'review', 'DLAO-001', 'dlao',
   'আবেদন গ্রহণ ও যাচাইকরণ', datetime('now', '-213 days')),
  ('DEMO-CSH-A5-2', 'DEMO-CASE-A5', 'review', 'mediation', 'DLAO-001', 'dlao',
   'মধ্যস্থতা প্রচেষ্টা ব্যর্থ', datetime('now', '-204 days')),
  ('DEMO-CSH-A5-3', 'DEMO-CASE-A5', 'mediation', 'lawyer', 'DLAO-001', 'dlao',
   'প্যানেল আইনি নিয়োগ; তারিখ থেকে কোনো আপডেট নেই', datetime('now', '-196 days'));

-- No sla_log row for this case, and that is deliberate rather than an omission.
--
-- sla_log.stage is CHECKed to 'review','mediation','payment' and the real limits are
-- 15/60/10 days (SLA_STAGES in lib/case/domain.ts). Malek's DLAO stages did NOT
-- overrun: review took 9 days and mediation 8, so there is honestly nothing to log.
--
-- This matters, because the tempting row to write is a 196-day 'lawyer' breach — and
-- `lawyer` is not a legal sla_log stage, so the write is rejected by the CHECK. An
-- INSERT OR IGNORE swallows that rejection and the row simply vanishes, which is how
-- a migration appears to succeed while seeding nothing.
--
-- The 196-day stall is real, but it is the LAWYER's, and the lawyer-side tables are
-- where it belongs: the two lawyer_sla_violations below, the show-cause, the payment
-- freeze and the red flag. There is no DLAO stage clock on a case sitting with a
-- lawyer, and that gap is precisely the accountability hole this scenario is about.

-- The lawyer missed the post-hearing update. Twice, so the red flag and the payment
-- freeze are both earned rather than asserted.
INSERT OR IGNORE INTO lawyer_sla_violations
  (id, panel_lawyer_id, case_id, action_code, deadline_at, missed_at, consecutive_count, status, resolution_note)
VALUES
  ('DEMO-LSV-A5-1', 'DEMO-PL-A5', 'DEMO-CASE-A5', 'hearing_update', datetime('now', '-120 days'), datetime('now', '-120 days'), 1, 'acknowledged',
   'প্রথম কোর্ট তারিখের পর আপডেট জমা পায়নি।'),
  ('DEMO-LSV-A5-2', 'DEMO-PL-A5', 'DEMO-CASE-A5', 'hearing_update', datetime('now', '-41 days'), datetime('now', '-41 days'), 2, 'escalated',
   'দ্বিতীয় কোর্ট তারিখের পরও আপডেট নেই — শো-কেজ উত্তর হয়নি।');

INSERT OR IGNORE INTO lawyer_show_cause
  (id, panel_lawyer_id, case_id, violation_id, reason_code, reason_detail, issued_by, deadline_at, status, resolution)
VALUES
  ('DEMO-LSC-A5-1', 'DEMO-PL-A5', 'DEMO-CASE-A5', 'DEMO-LSV-A5-2', 'no_court_update',
   'দুটি কোর্ট তারিখের পরও কোনো আপডেট জমা হয়নি; আবেদনকারীর নিজস্ব নম্বর নেই।',
   'DLAO-001', datetime('now', '-39 days'), 'expired', 'payment_freeze');

INSERT OR IGNORE INTO lawyer_payment_freeze
  (id, panel_lawyer_id, show_cause_id, reason, frozen_by, status)
VALUES
  ('DEMO-LPF-A5-1', 'DEMO-PL-A5', 'DEMO-LSC-A5-1',
   'দুটি কোর্ট আপডেট মিসড; শো-কেজের ৪৮ ঘণ্টার উত্তর পর্বে শেষ হয়েছে।',
   'DLAO-001', 'active');

INSERT OR IGNORE INTO lawyer_flags
  (id, panel_lawyer_id, flag_type, reason_code, reason_detail, issued_by, status, expires_at)
VALUES
  ('DEMO-LF-A5-1', 'DEMO-PL-A5', 'red_flag', 'multiple_violations',
   'ধারাবাহিক দুটি কোর্ট আপডেট মিসড; বর্তমানে ধারণা ফ্রিজ।', 'DLAO-001', 'active',
   datetime('now', '+90 days'));
