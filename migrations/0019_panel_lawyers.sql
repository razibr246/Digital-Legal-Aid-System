-- Panel lawyer roster.
--
-- `panel_lawyers` was created by 0016 but left empty, which meant the consultation's
-- assignment branch could never fire: `startOrResumeConsultation` only creates a
-- panel_assignments row when a lawyer was actually chosen, so the "panel lawyer
-- entity" the consultation is supposed to produce would never exist and the demo
-- would always dead-end at "not appointed".
--
-- Fixed ids and INSERT OR IGNORE keep this idempotent — re-running never duplicates
-- an entry, and a real roster entry added later under a different id is untouched.
--
-- `jurisdiction_district_name` is matched against the case district when the
-- consultation picks a lawyer, so these are spread across districts on purpose.
INSERT OR IGNORE INTO panel_lawyers
  (id, kind, name_bn, name_en, bar_registration, enrolment_year, enrolment_number,
   certificate_number, jurisdiction_district_name, specialisations, phone, email, list_status)
VALUES
  ('PL-0001', 'lawyer', 'অ্যাডভোকেট সালমা খাতুন', 'Advocate Salma Khatun', 'A-4471', '2009', 'E-2009-1187', 'BC-77214', 'ঢাকা', 'সাইবার, ডিজিটাল নিরাপত্তা, নারী অধিকার', '01711000001', 'salma.khatun@example.org', 'on_panel'),
  ('PL-0002', 'lawyer', 'অ্যাডভোকেট রাকেব হাসান', 'Advocate Rakeb Hasan', 'A-5120', '2012', 'E-2012-0341', 'BC-80311', 'ঢাকা', 'পারিবারিক বিষয়, ভরণপোষণ, দাম্পত্য', '01711000002', 'rakeb.hasan@example.org', 'on_panel'),
  ('PL-0003', 'lawyer', 'অ্যাডভোকেট নূরজাহান বেগম', 'Advocate Nurjahan Begum', 'A-6033', '2015', 'E-2015-0902', 'BC-84550', 'চট্টগ্রাম', 'শ্রম আইন, বেতন আদায়, কর্মঘাত', '01711000003', 'nurjahan.begum@example.org', 'on_panel'),
  ('PL-0004', 'lawyer', 'অ্যাডভোকেট জাহিদ হাসান', 'Advocate Jahid Hasan', 'A-6744', '2011', 'E-2011-0455', 'BC-79002', 'সিলেট', 'জমি, সম্পত্তি, ভূমি অপরাধ', '01711000004', 'jahid.hasan@example.org', 'on_panel'),
  ('PM-0001', 'mediator', 'মো. আবদুল করিম', 'Md. Abdul Karim', 'A-7102', '2014', 'E-2014-0663', 'BC-81234', 'ঢাকা', 'মধ্যস্থতা, সালিশ', '01711000005', 'abdul.karim@example.org', 'on_panel');
