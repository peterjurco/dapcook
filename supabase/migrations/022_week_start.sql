-- Which day a household's week starts on. Existing households keep Monday.
ALTER TABLE households
  ADD COLUMN IF NOT EXISTS week_start_day TEXT NOT NULL DEFAULT 'monday'
  CHECK (week_start_day IN ('monday', 'saturday', 'sunday'));

-- Onboarding gains a week-start step right after units.
ALTER TABLE households DROP CONSTRAINT IF EXISTS households_onboarding_step_check;
ALTER TABLE households
  ADD CONSTRAINT households_onboarding_step_check
  CHECK (onboarding_step IN ('translation', 'units', 'week_start', 'tags', 'shopping_categories', 'invite'));

-- Meal slots are stored against real dates, so a later change of week start
-- never moves a meal. week_plans stays as the anchor for week_plan_rules.
ALTER TABLE meal_slots ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE meal_slots ADD COLUMN IF NOT EXISTS date DATE;

UPDATE meal_slots ms
SET household_id = wp.household_id,
    date = wp.week_start + (ms.day_of_week - 1)
FROM week_plans wp
WHERE wp.id = ms.week_plan_id
  AND ms.date IS NULL;

ALTER TABLE meal_slots ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE meal_slots ALTER COLUMN date SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meal_slots_household_date ON meal_slots(household_id, date);

DROP POLICY IF EXISTS "household_access" ON meal_slots;
CREATE POLICY "household_access" ON meal_slots
  FOR ALL USING (household_id = public.user_household_id())
  WITH CHECK (household_id = public.user_household_id());

DROP INDEX IF EXISTS idx_meal_slots_week_plan;
ALTER TABLE meal_slots DROP COLUMN IF EXISTS week_plan_id;
ALTER TABLE meal_slots DROP COLUMN IF EXISTS day_of_week;
