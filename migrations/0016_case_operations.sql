-- Case operations: mediation, payments, settlements, transfers, panel, audit.
--
-- Strictly additive. Every object is CREATE ... IF NOT EXISTS and the only ALTERs are
-- ADD COLUMN, which SQLite supports without a table rebuild. Nothing existing is
-- dropped, renamed or re-typed, so this cannot break a live query. That matters
-- because the alternative — rebuilding `cases` or `users` to add constraints — is
-- impossible on D1 (see migration 0015).
--
-- Naming follows the guide: PR- payment, MR- mediator request, TR- transfer,
-- LR- lawyer request, PLR/SMR- panel self-registration, GRV- misconduct, AUD- audit.
--
-- Two columns are added to `cases` that the business rules in lib/case/domain.ts
-- need to be reachable from SQL. `status` is deliberately left alone: it is the
-- portal-facing status that existing screens and mapPortalCase already read, and
-- `stage` is the case lifecycle the rules operate on.

-- ---------------------------------------------------------------------------
-- cases: lifecycle stage, audit-sensitive flag, and rule inputs.
ALTER TABLE cases ADD COLUMN stage TEXT NOT NULL DEFAULT 'submitted'
  CHECK (stage IN ('submitted','review','mediation','lawyer','court','settled','unresolved'));
ALTER TABLE cases ADD COLUMN sensitive INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN district_code TEXT;
ALTER TABLE cases ADD COLUMN stage_changed_at DATETIME;
ALTER TABLE cases ADD COLUMN lawyer_requested INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN eligibility_passed INTEGER;
ALTER TABLE cases ADD COLUMN reverified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN problem_category TEXT;
ALTER TABLE cases ADD COLUMN problem_subcategory TEXT;
-- Referral sources arriving in the last 48h drive the DLAO "new referrals" filter.
ALTER TABLE cases ADD COLUMN referral_source TEXT;
ALTER TABLE cases ADD COLUMN referred_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_cases_stage ON cases(stage);
CREATE INDEX IF NOT EXISTS idx_cases_sensitive ON cases(sensitive);
CREATE INDEX IF NOT EXISTS idx_cases_district_code ON cases(district_code);

-- ---------------------------------------------------------------------------
-- Timeline. case_updates already exists for officer notes; this is the canonical
-- status-transition history, so a case's life can be replayed.
CREATE TABLE IF NOT EXISTS case_stage_history (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_by TEXT,
  changed_by_role TEXT,
  note TEXT,
  at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_case_stage_history_case ON case_stage_history(case_id, at DESC);

-- ---------------------------------------------------------------------------
-- Mediation. Repeatable: one row per attempt, so a case can be mediated more than
-- once and the lawyer gate can look at the LAST outcome specifically.
CREATE TABLE IF NOT EXISTS mediations (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  scheduled_at DATETIME,
  held_by_officer TEXT,
  mediator_user_id TEXT REFERENCES users(id),
  mediator_name TEXT,
  venue TEXT,
  outcome TEXT CHECK (outcome IN ('scheduled','settled','failed')),
  notes TEXT,
  at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mediations_case ON mediations(case_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_mediations_outcome ON mediations(outcome);

-- A Special Mediator must accept before honouraria are billable, so the request is
-- its own record rather than a flag on the case.
CREATE TABLE IF NOT EXISTS mediator_requests (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  mediator_user_id TEXT REFERENCES users(id),
  mediator_name TEXT,
  requested_by TEXT,
  requested_by_role TEXT,
  when_at DATETIME,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  reason TEXT,
  decided_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_mediator_requests_case ON mediator_requests(case_id);
CREATE INDEX IF NOT EXISTS idx_mediator_requests_status ON mediator_requests(status);

-- ---------------------------------------------------------------------------
-- Settlements: all three parties must e-sign before the Chief may certify.
CREATE TABLE IF NOT EXISTS settlements (
  case_id TEXT PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  signed_applicant INTEGER NOT NULL DEFAULT 0,
  signed_opposite TEXT,
  signed_opposite_at DATETIME,
  signed_mediator INTEGER NOT NULL DEFAULT 0,
  certified INTEGER NOT NULL DEFAULT 0,
  certified_by TEXT,
  certified_at DATETIME,
  decree TEXT,
  decree_issued_at DATETIME,
  refund_due INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Money. Only the Chief/Chairman may decide a payment; deciding it is one-way.
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('mediator','lawyer','officer','other')),
  amount_taka INTEGER,
  note TEXT,
  requested_by TEXT,
  requester_role TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reason TEXT,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by TEXT,
  decided_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_payments_case ON payments(case_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, requested_at);

-- Step-wise lawyer payment. `refund` is the clawback state a lawyer change creates
-- for steps the outgoing lawyer was paid for but did not complete.
CREATE TABLE IF NOT EXISTS tranches (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL,
  step TEXT NOT NULL,
  amount_taka INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refund')),
  step_completed INTEGER NOT NULL DEFAULT 0,
  paid_at DATETIME,
  refund_confirmed_at DATETIME,
  seq INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tranches_case ON tranches(case_id, seq);
CREATE INDEX IF NOT EXISTS idx_tranches_status ON tranches(status);

-- ---------------------------------------------------------------------------
-- Jurisdiction transfers. Keeps the same case id; only the owning office changes.
CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  from_office TEXT,
  to_office TEXT,
  to_district_code TEXT,
  why TEXT,
  requested_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','returned')),
  reason TEXT,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by TEXT,
  decided_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status, requested_at);
CREATE INDEX IF NOT EXISTS idx_transfers_case ON transfers(case_id);

-- ---------------------------------------------------------------------------
-- Lawyer changes. Citizen-initiated; a `change` must flag already-paid tranches as
-- refundable, because the outgoing lawyer did not complete those steps.
CREATE TABLE IF NOT EXISTS lawyer_requests (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('new','change')),
  reason TEXT,
  requested_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by TEXT,
  decided_at DATETIME,
  decision_note TEXT,
  clawback_from_step TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lawyer_requests_case ON lawyer_requests(case_id, kind);
CREATE INDEX IF NOT EXISTS idx_lawyer_requests_status ON lawyer_requests(status, created_at);

-- ---------------------------------------------------------------------------
-- Panel directory and self-registration.
-- Note the approval split: the DLAO of the jurisdiction approves a self-registration;
-- the Chief only proposes/approves changes to the master list.
CREATE TABLE IF NOT EXISTS panel_lawyers (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'lawyer' CHECK (kind IN ('lawyer','mediator')),
  name_bn TEXT,
  name_en TEXT,
  bar_registration TEXT,
  enrolment_year TEXT,
  enrolment_number TEXT,
  certificate_number TEXT,
  jurisdiction_district_code TEXT,
  jurisdiction_district_name TEXT,
  specialisations TEXT,
  phone TEXT,
  email TEXT,
  list_status TEXT NOT NULL DEFAULT 'on_panel' CHECK (list_status IN ('on_panel','proposed','removed')),
  proposed_by TEXT,
  proposed_at DATETIME,
  approved_by TEXT,
  approved_at DATETIME,
  removal_reason TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_panel_lawyers_status ON panel_lawyers(list_status, kind);
CREATE INDEX IF NOT EXISTS idx_panel_lawyers_jurisdiction ON panel_lawyers(jurisdiction_district_code);

CREATE TABLE IF NOT EXISTS lawyer_apps (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('lawyer','mediator')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  name_bn TEXT,
  name_en TEXT,
  bar_registration TEXT,
  enrolment_year TEXT,
  enrolment_number TEXT,
  certificate_number TEXT,
  jurisdiction_district_code TEXT,
  specialisations TEXT,
  phone TEXT,
  email TEXT,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by TEXT,
  decided_at DATETIME,
  decision_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_lawyer_apps_jurisdiction ON lawyer_apps(jurisdiction_district_code, status);

-- ---------------------------------------------------------------------------
-- Misconduct escalated to the district committee. On a proven verdict BOTH
-- referring to the Bar Council and removing from the panel are required by policy.
CREATE TABLE IF NOT EXISTS misconduct_cases (
  id TEXT PRIMARY KEY,
  lawyer_id TEXT NOT NULL REFERENCES panel_lawyers(id) ON DELETE CASCADE,
  summary TEXT,
  finding TEXT,
  verdict TEXT NOT NULL DEFAULT 'open' CHECK (verdict IN ('open','guilty')),
  referred_to_bar_council INTEGER NOT NULL DEFAULT 0,
  referred_at DATETIME,
  removed_from_panel INTEGER NOT NULL DEFAULT 0,
  removed_at DATETIME,
  actioned_by TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_misconduct_verdict ON misconduct_cases(verdict);

-- ---------------------------------------------------------------------------
-- SLA notifications. Written once per scan; badges count rows rather than
-- recomputing, so a breach that happened unobserved still shows.
CREATE TABLE IF NOT EXISTS sla_log (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('review','mediation','payment')),
  level TEXT NOT NULL CHECK (level IN ('near','breach')),
  age_days INTEGER NOT NULL,
  limit_days INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('dlao','chief')),
  at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sla_log_role ON sla_log(role, level, at DESC);
CREATE INDEX IF NOT EXISTS idx_sla_log_case ON sla_log(case_id);

-- ---------------------------------------------------------------------------
-- Fact provenance: who supplied each fact and whether the applicant confirmed it.
-- Unconfirmed facts stay usable but are never silently promoted to established.
CREATE TABLE IF NOT EXISTS case_facts (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL,
  key TEXT NOT NULL,
  label_bn TEXT,
  label_en TEXT,
  value_bn TEXT,
  value_en TEXT,
  confirmed INTEGER NOT NULL DEFAULT 0,
  supplied_by_role TEXT,
  supplied_by_name TEXT,
  confirmed_by TEXT,
  confirmed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (ref, key)
);
CREATE INDEX IF NOT EXISTS idx_case_facts_ref ON case_facts(ref);

-- Someone speaking for the applicant — e.g. a blind representative who can only
-- use voice, so the record says what they can physically do.
CREATE TABLE IF NOT EXISTS case_reps (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
  application_id TEXT,
  name_bn TEXT,
  name_en TEXT,
  age INTEGER,
  relation_bn TEXT,
  channel TEXT,
  authority_bn TEXT,
  authority_confirmed INTEGER NOT NULL DEFAULT 0,
  can_access_bn TEXT,
  cannot_access_bn TEXT,
  screen_reader_bn TEXT,
  wants_own_account INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_case_reps_case ON case_reps(case_id);

-- ---------------------------------------------------------------------------
-- Safe contact. A survivor's number is often the abuser's phone, so each channel
-- carries its own rule AND a stated reason, and every send attempt is logged.
CREATE TABLE IF NOT EXISTS safe_profiles (
  ref TEXT PRIMARY KEY,
  risk_high INTEGER NOT NULL DEFAULT 0,
  neutral_only INTEGER NOT NULL DEFAULT 0,
  safe_window_bn TEXT,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS safe_contact_destinations (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL REFERENCES safe_profiles(ref) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('sms','voice','portal','rep')),
  kind_bn TEXT,
  to_bn TEXT,
  rule TEXT NOT NULL CHECK (rule IN ('allow','window','block')),
  why_bn TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (ref, channel)
);

-- Blocked and deferred attempts are recorded too — that is the point of the log.
CREATE TABLE IF NOT EXISTS message_outbox (
  id TEXT PRIMARY KEY,
  ref TEXT,
  case_id TEXT REFERENCES cases(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms','voice','portal','rep')),
  to_bn TEXT,
  body TEXT,
  rule TEXT CHECK (rule IN ('allow','window','block')),
  sent INTEGER NOT NULL DEFAULT 0,
  deferred_until TEXT,
  why_bn TEXT,
  sent_by TEXT,
  at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_message_outbox_ref ON message_outbox(ref, at DESC);

-- ---------------------------------------------------------------------------
-- Audit: everything that gates access or money is a log record, not a state flag.
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  ref_id TEXT,
  actor_id TEXT,
  actor_role TEXT,
  detail TEXT,
  reason TEXT,
  at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_log_ref ON audit_log(ref_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_kind ON audit_log(kind, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id, at DESC);

-- The queue assist only ever RANKS. The officer's accept/override is logged either
-- way, because an override with a reason is exactly the audit trail you want.
CREATE TABLE IF NOT EXISTS assist_decisions (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES cases(id) ON DELETE CASCADE,
  application_id TEXT,
  suggested_level TEXT CHECK (suggested_level IN ('high','normal')),
  suggested_reasons TEXT,
  decided_level TEXT CHECK (decided_level IN ('high','normal')),
  overruled INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  decided_by TEXT,
  at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_assist_decisions_case ON assist_decisions(case_id, at DESC);
