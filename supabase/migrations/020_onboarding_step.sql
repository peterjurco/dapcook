-- Where a household is in the onboarding wizard. NULL means finished, which is
-- what every household created before the wizard existed gets.
ALTER TABLE households
  ADD COLUMN IF NOT EXISTS onboarding_step TEXT
  CHECK (onboarding_step IN ('translation', 'units', 'tags', 'shopping_categories', 'shopping_rules'));
