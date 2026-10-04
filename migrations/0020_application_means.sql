-- Means data captured at intake.
--
-- The eligibility rules test for insolvency, unemployment and inability to work,
-- but nothing collected any of it, so the consultation had to assume
-- `employed = false` for every applicant. That made the whole system return
-- "eligible" every time, which is exactly the kind of demo that convinces nobody.
--
-- Both are nullable and stay NULL when unanswered: unknown is not a negative
-- answer, and treating it as one would hand someone legal aid on a technicality.
-- Only the disability flag is already NOT NULL, because the form has always asked it.

ALTER TABLE applications ADD COLUMN employed INTEGER;
ALTER TABLE applications ADD COLUMN monthly_income_bdt INTEGER;
