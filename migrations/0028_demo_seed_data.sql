-- Demo seed data for Chief console demonstration.
-- Adds DLAO officers, panel lawyers, and sample cases.

-- Demo DLAO Officers
INSERT OR IGNORE INTO users (id, role, role_key, display_name, phone, status, is_mock) VALUES
  ('DLAO-001', 'dlao_officer', 'dlao', 'মোঃ আব্দুল করিম', '01711100001', 'active', 1),
  ('DLAO-002', 'dlao_officer', 'dlao', 'ফাতেমা বেগম', '01711100002', 'active', 1),
  ('DLAO-003', 'dlao_officer', 'dlao', 'মোঃ রফিকুল ইসলাম', '01711100003', 'active', 1),
  ('DLAO-004', 'dlao_officer', 'dlao', 'নাজমা আক্তার', '01711100004', 'active', 1),
  ('DLAO-005', 'dlao_officer', 'dlao', 'মোঃ জাহিদ হাসান', '01711100005', 'active', 1);

-- More panel lawyers
INSERT OR IGNORE INTO panel_lawyers
  (id, kind, name_bn, name_en, bar_registration, enrolment_year, enrolment_number,
   certificate_number, jurisdiction_district_name, specialisations, phone, email, list_status)
VALUES
  ('PL-0005', 'lawyer', 'অ্যাডভোকেট মোঃ আলমগীর', 'Advocate Md. Alamgir', 'A-7801', '2016', 'E-2016-0512', 'BC-85100', 'ঢাকা', 'দেওয়ানি, চুক্তি, সম্পত্তি', '01711000006', 'alamgir@example.org', 'on_panel'),
  ('PL-0006', 'lawyer', 'অ্যাডভোকেট শাহানা পারভীন', 'Advocate Shahana Parveen', 'A-8102', '2017', 'E-2017-0344', 'BC-86202', 'রাজশাহী', 'নারী অধিকার, পারিবারিক', '01711000007', 'shahana.p@example.org', 'on_panel'),
  ('PL-0007', 'lawyer', 'অ্যাডভোকেট মোঃ কামরুল', 'Advocate Md. Kamrul', 'A-8455', '2018', 'E-2018-0199', 'BC-87001', 'খুলনা', 'ফৌজদারি, জামিন', '01711000008', 'kamrul@example.org', 'on_panel'),
  ('PL-0008', 'lawyer', 'অ্যাডভোকেট রুমানা আক্তার', 'Advocate Rumana Akter', 'A-9001', '2019', 'E-2019-0088', 'BC-88100', 'বরিশাল', 'শ্রম আইন, মজুরি', '01711000009', 'rumana.a@example.org', 'on_panel'),
  ('PL-0009', 'lawyer', 'অ্যাডভোকেট ফারুক আহমেদ', 'Advocate Faruk Ahmed', 'A-9302', '2020', 'E-2020-0211', 'BC-89050', 'ময়মনসিংহ', 'জমি, উত্তরাধিকার', '01711000010', 'faruk.a@example.org', 'on_panel'),
  ('PL-0010', 'lawyer', 'অ্যাডভোকেট নাসরিন সুলতানা', 'Advocate Nasrin Sultana', 'A-9555', '2021', 'E-2021-0155', 'BC-90001', 'রংপুর', 'পারিবারিক, তালাক, ভরণপোষণ', '01711000011', 'nasrin.s@example.org', 'on_panel'),
  ('PM-0002', 'mediator', 'মোঃ শফিকুল ইসলাম', 'Md. Shafiqul Islam', 'A-7500', '2015', 'E-2015-0400', 'BC-83500', 'চট্টগ্রাম', 'মধ্যস্থতা, সালিশ', '01711000012', 'shafiqul@example.org', 'on_panel'),
  ('PM-0003', 'mediator', 'সালমা খাতুন', 'Salma Khatun', 'A-7800', '2016', 'E-2016-0300', 'BC-84000', 'সিলেট', 'মধ্যস্থতা', '01711000013', 'salma.m@example.org', 'on_panel');

-- Demo citizens for cases
INSERT OR IGNORE INTO users (id, role, display_name, phone, status, is_mock) VALUES
  ('CIT-D001', 'citizen', 'রহিমা বেগম', '01812345601', 'active', 1),
  ('CIT-D002', 'citizen', 'মোঃ করিম মিয়া', '01812345602', 'active', 1),
  ('CIT-D003', 'citizen', 'ফাতেমা খাতুন', '01812345603', 'active', 1),
  ('CIT-D004', 'citizen', 'আব্দুল হক', '01812345604', 'active', 1),
  ('CIT-D005', 'citizen', 'নূরজাহান', '01812345605', 'active', 1),
  ('CIT-D006', 'citizen', 'মোঃ আলী', '01812345606', 'active', 1),
  ('CIT-D007', 'citizen', 'সালমা আক্তার', '01812345607', 'active', 1),
  ('CIT-D008', 'citizen', 'জাহিদুল ইসলাম', '01812345608', 'active', 1),
  ('CIT-D009', 'citizen', 'শাহিনা বেগম', '01812345609', 'active', 1),
  ('CIT-D010', 'citizen', 'মোঃ রাসেল', '01812345610', 'active', 1),
  ('CIT-D011', 'citizen', 'আয়েশা সিদ্দিকা', '01812345611', 'active', 1),
  ('CIT-D012', 'citizen', 'মোঃ ইব্রাহিম', '01812345612', 'active', 1);

-- Demo cases with various stages and districts
-- Stage values: 'submitted','review','mediation','lawyer','court','settled','unresolved'
-- Columns: id, docket_id, citizen_user_id, voice_session_id, problem, district, status, stage, category, is_demo, created_at
INSERT OR IGNORE INTO cases
  (id, docket_id, citizen_user_id, voice_session_id, problem, district, status, stage, category, is_demo, created_at)
VALUES
  ('DEMO-CASE-001', 'DLAO/2024/DHK/001', 'CIT-D001', 'VS-D001', 'আমার স্বামী আমাকে মারধর করছে এবং বাড়ি থেকে বের করে দিয়েছে। আমি এখন নিরাপদ আশ্রয়ে আছি।', 'ঢাকা', 'submitted', 'submitted', 'family', 1, datetime('now', '-1 days')),
  ('DEMO-CASE-002', 'DLAO/2024/DHK/002', 'CIT-D002', 'VS-D002', 'আমার মালিক আমাকে ৩ মাসের বেতন দেয়নি এবং চাকরি থেকে বের করে দিয়েছে।', 'ঢাকা', 'under_review', 'review', 'labour', 1, datetime('now', '-3 days')),
  ('DEMO-CASE-003', 'DLAO/2024/CTG/001', 'CIT-D003', 'VS-D003', 'আমার জমি দখল করে নিয়েছে প্রতিবেশী। আদালতে মামলা করতে চাই।', 'চট্টগ্রাম', 'under_review', 'mediation', 'land', 1, datetime('now', '-7 days')),
  ('DEMO-CASE-004', 'DLAO/2024/RAJ/001', 'CIT-D004', 'VS-D004', 'তালাকের পর আমার স্ত্রী সন্তান দেখতে দিচ্ছে না। সন্তানের অভিভাবকত্ব চাই।', 'রাজশাহী', 'submitted', 'submitted', 'family', 1, datetime('now', '-2 days')),
  ('DEMO-CASE-005', 'DLAO/2024/KHU/001', 'CIT-D005', 'VS-D005', 'আমার স্বামী ভরণপোষণ দিচ্ছে না। ৬ মাস হয়ে গেছে কোনো টাকা পাইনি।', 'খুলনা', 'under_review', 'lawyer', 'family', 1, datetime('now', '-10 days')),
  ('DEMO-CASE-006', 'DLAO/2024/SYL/001', 'CIT-D006', 'VS-D006', 'কারখানায় দুর্ঘটনায় আহত হয়েছি। ক্ষতিপূরণ চাই কিন্তু মালিক দিচ্ছে না।', 'সিলেট', 'submitted', 'submitted', 'labour', 1, datetime('now', '-1 days')),
  ('DEMO-CASE-007', 'DLAO/2024/BAR/001', 'CIT-D007', 'VS-D007', 'যৌতুকের জন্য শাশুড়ি নির্যাতন করছে। পুলিশে অভিযোগ করতে চাই।', 'বরিশাল', 'under_review', 'review', 'family', 1, datetime('now', '-2 days')),
  ('DEMO-CASE-008', 'DLAO/2024/MYM/001', 'CIT-D008', 'VS-D008', 'বাবার সম্পত্তিতে আমার অংশ দিচ্ছে না ভাইয়েরা।', 'ময়মনসিংহ', 'under_review', 'mediation', 'land', 1, datetime('now', '-14 days')),
  ('DEMO-CASE-009', 'DLAO/2024/RAN/001', 'CIT-D009', 'VS-D009', 'ঋণ পরিশোধের পরও ব্যাংক থেকে হয়রানি হচ্ছি।', 'রংপুর', 'resolved', 'settled', 'civil', 1, datetime('now', '-20 days')),
  ('DEMO-CASE-010', 'DLAO/2024/DHK/003', 'CIT-D010', 'VS-D010', 'অফিসে যৌন হয়রানির শিকার হয়েছি। আইনি পদক্ষেপ নিতে চাই।', 'ঢাকা', 'submitted', 'submitted', 'criminal', 1, datetime('now')),
  ('DEMO-CASE-011', 'DLAO/2024/CTG/002', 'CIT-D011', 'VS-D011', 'ফ্ল্যাট কিনেছি কিন্তু বিল্ডার দখল দিচ্ছে না।', 'চট্টগ্রাম', 'under_review', 'review', 'civil', 1, datetime('now', '-5 days')),
  ('DEMO-CASE-012', 'DLAO/2024/DHK/004', 'CIT-D012', 'VS-D012', 'গ্যারেজ থেকে গাড়ি চুরি হয়েছে। পুলিশ সাহায্য করছে না।', 'ঢাকা', 'rejected', 'unresolved', 'criminal', 1, datetime('now', '-25 days'));

-- Demo case stage history for officers (to show handled counts)
INSERT OR IGNORE INTO case_stage_history (id, case_id, from_stage, to_stage, changed_by, at) VALUES
  ('CSH-D001', 'DEMO-CASE-001', 'submitted', 'review', 'DLAO-001', datetime('now', '-5 days')),
  ('CSH-D002', 'DEMO-CASE-002', 'submitted', 'review', 'DLAO-001', datetime('now', '-4 days')),
  ('CSH-D003', 'DEMO-CASE-003', 'submitted', 'review', 'DLAO-001', datetime('now', '-3 days')),
  ('CSH-D004', 'DEMO-CASE-004', 'review', 'mediation', 'DLAO-002', datetime('now', '-4 days')),
  ('CSH-D005', 'DEMO-CASE-005', 'review', 'mediation', 'DLAO-002', datetime('now', '-3 days')),
  ('CSH-D006', 'DEMO-CASE-006', 'submitted', 'review', 'DLAO-003', datetime('now', '-2 days')),
  ('CSH-D007', 'DEMO-CASE-007', 'mediation', 'lawyer', 'DLAO-003', datetime('now', '-1 days')),
  ('CSH-D008', 'DEMO-CASE-008', 'submitted', 'review', 'DLAO-004', datetime('now', '-3 days')),
  ('CSH-D009', 'DEMO-CASE-009', 'review', 'mediation', 'DLAO-005', datetime('now', '-2 days'));
