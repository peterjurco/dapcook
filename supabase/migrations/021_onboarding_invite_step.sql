-- The shopping rules step became an invite step. Only the household's creator
-- walks the wizard; people who join mid-wizard go straight to the app.
ALTER TABLE households DROP CONSTRAINT IF EXISTS households_onboarding_step_check;
UPDATE households SET onboarding_step = 'invite' WHERE onboarding_step = 'shopping_rules';
ALTER TABLE households
  ADD CONSTRAINT households_onboarding_step_check
  CHECK (onboarding_step IN ('translation', 'units', 'tags', 'shopping_categories', 'invite'));
ALTER TABLE households ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Households already mid-wizard have no recorded creator; their only member is it.
UPDATE households h
SET created_by = (SELECT p.id FROM profiles p WHERE p.household_id = h.id LIMIT 1)
WHERE h.created_by IS NULL
  AND h.onboarding_step IS NOT NULL
  AND (SELECT count(*) FROM profiles p WHERE p.household_id = h.id) = 1;
