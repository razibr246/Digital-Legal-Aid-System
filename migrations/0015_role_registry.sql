-- Canonical DBLA role registry.
--
-- `users.role` carries a CHECK that cannot be widened: SQLite has no ALTER for a
-- CHECK constraint, and rebuilding the table is impossible here because D1 enforces
-- the foreign keys from auth_sessions / cases / applications / verification_steps /
-- identity_verifications / citizen_signatures, so DROP TABLE users is rejected
-- (verified: both plain DROP and PRAGMA defer_foreign_keys fail).
--
-- So the canonical role is added alongside instead of replacing:
--   * users.role      — the legacy "seat". Unchanged for every existing row, and for
--                       a new role it holds a generic staff seat so the column's CHECK
--                       is satisfied. All pre-existing `role === 'x'` comparisons
--                       therefore keep working untouched.
--   * users.role_key  — the real role (dlao, chief, chairman, chowki, sclao, labour,
--                       panel, mediator, judge, callcentre, admin, ngo, udc, referral).
--                       NULL means "not migrated": the role is users.role.
--
-- Session resolution prefers role_key and falls back to role, so a row that has not
-- been touched still authenticates as whatever it always was.
--
-- Note: panel_lawyer was present in APP_ROLES in code but MISSING from the original
-- CHECK, so a panel lawyer could never actually be persisted. That is unchanged here
-- and is called out in lib/auth/roles.ts.

ALTER TABLE users ADD COLUMN role_key TEXT;

-- The registry itself, so reporting and the portal can join on titles without
-- hard-coding them in every query.
CREATE TABLE IF NOT EXISTS staff_roles (
  role_key TEXT PRIMARY KEY,
  title_bn TEXT NOT NULL,
  title_en TEXT NOT NULL,
  scope_bn TEXT NOT NULL,
  scope_en TEXT NOT NULL,
  group_key TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO staff_roles (role_key, title_bn, title_en, scope_bn, scope_en, group_key) VALUES
  ('dlao',      'লিগ্যাল এইড অফিসার',                   'Legal Aid Officer',                   'একটি জেলা কার্যালয় — দৈনন্দিন মামলা কাজ',                              'One district office — day-to-day case work', 'district'),
  ('chief',     'চীফ লিগ্যাল এইড অফিসার',                'Chief Legal Aid Officer',             'একটি জেলা — সালিশ অনুমোদন, পরিশোধ ও তদারকি',                                    'Certifies settlements, approves payments, supervises DLAOs', 'district'),
  ('chairman',  'জেলা কমিটির চেয়ারম্যান',                'District Committee Chairman',         'প্যানেল তালিকা পরিবর্তন অনুমোদন ও ভ্রষ্টামূলক মামলা নিষ্পত্তি',            'Approves panel list changes, settles misconduct cases', 'district'),
  ('chowki',    'চৌকি আদালতের লিগ্যাল এইড অফিসার',       'Legal Aid Officer — Chowki Adalat',   'সার্কিট আদালত কার্যালয়',                                                    'Circuit-court office', 'courts'),
  ('sclao',     'সুপ্রীম কোর্ট লিগ্যাল এইড অফিসার',      'Supreme Court Legal Aid Officer',     'আপিল বিভাগের মামলা',                                                          'Appellate Division cases', 'courts'),
  ('labour',    'শ্রম লিগ্যাল এইড সেল কর্মকর্তা',         'Labour Legal Aid Cell Officer',      'শ্রম ট্রিব্যুনালের মামলা',                                                     'Labour tribunal cases', 'courts'),
  ('panel',     'প্যানেল আইনজীবী',                        'Panel Lawyer',                        'শুধু নিজের দায়িত্বে দেওয়া মামলা',                                            'Assigned cases only', 'courts'),
  ('mediator',  'বিশেষ মধ্যস্থতাকারী',                    'Special Mediator',                    'জেলা নিবন্ধিত মধ্যস্থতার অনুরোধ',                                           'District-registered mediation requests', 'district'),
  ('judge',     'বিচার বিভাগীয় ম্যাজিস্ট্রেট',             'Judicial Magistrate',                  'আদালত-পাশার দৃশ্য',                                                            'Court-side view', 'courts'),
  ('callcentre','কল-সেন্টার অপারেটর',                     'Call-Centre Operator',                'জাতীয় হেল্পলাইন ১৬৬৯৯',                                                     'National helpline 16699', 'national'),
  ('admin',     'DBLA জাতীয় প্রশাসক',                     'DBLA National Administrator',         'বাধ্যতামূলক মধ্যস্থতার তালিকা ও জাতীয় ড্যাশবোর্ড',                         'Configures mandatory-mediation districts, national dashboard', 'national'),
  ('ngo',       'এনজিও/সিএসও অ্যাক্রেডিটেড পার্টনার',     'NGO/CSO Accredited Partner',          'রেফারেল উৎস',                                                                 'Referral source', 'partner'),
  ('udc',       'ইউডিসি উদ্যোক্তা',                       'UDC Entrepreneur',                    'ইউনিয়ন ডিজিটাল সেন্ট্র — সহায়তায় আবেদন',                                  'Union Digital Centre — assisted filing', 'partner'),
  ('referral',  'রেফারেল কমিটি প্রতিনিধি',                'Referral Committee Representative',    'উপজেলা কমিটি (UzLAC)',                                                        'Upazila committee (UzLAC)', 'partner');
