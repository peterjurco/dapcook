-- The shopping rules step became an invite step. Only the household's creator
-- walks the wizard; people who join mid-wizard go straight to the app.
ALTER TABLE households DROP CONSTRAINT IF EXISTS households_onboarding_step_check;
UPDATE households SET onboarding_step = 'invite' WHERE onboarding_step = 'shopping_rules';
ALTER TABLE households
  ADD CONSTRAINT households_onboarding_step_check
  CHECK (onboarding_step IN ('translation', 'units', 'tags', 'shopping_categories', 'invite'));
ALTER TABLE households ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
