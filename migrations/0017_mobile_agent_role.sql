-- Add the Mobile Agent role to the staff_roles reference table.
--
-- The registry in lib/auth/roles.ts is the source of truth for the UI; this table
-- mirrors it so reporting and the portal can join on titles and scope without
-- hard-coding them. `users.role_key` is plain TEXT with no CHECK, so no table
-- rebuild is needed to add a role (see migration 0015 for why users.role cannot be
-- widened).

INSERT OR REPLACE INTO staff_roles (role_key, title_bn, title_en, scope_bn, scope_en, group_key) VALUES
  ('mobile_agent', 'মোবাইল এজেন্ট', 'Mobile Agent', 'মাঠ পর্যায়ে ভ্রাম্যমাণ দল — সহায়তায় আবেদন ও তথ্য সংগ্রহ', 'Field mobile team — assisted filing and information collection', 'partner');
