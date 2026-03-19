-- Add span_days to meal_slots
ALTER TABLE meal_slots
  ADD COLUMN span_days INT NOT NULL DEFAULT 1 CHECK (span_days BETWEEN 1 AND 7);

-- Per-week rules: snapshot of general rules when week plan is created
CREATE TABLE week_plan_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_plan_id UUID NOT NULL REFERENCES week_plans(id) ON DELETE CASCADE,
  rule_type    TEXT NOT NULL DEFAULT 'custom',
  label        TEXT,
  config       JSONB NOT NULL DEFAULT '{}',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_week_plan_rules_plan ON week_plan_rules(week_plan_id);

ALTER TABLE week_plan_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household_access" ON week_plan_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM week_plans
      WHERE week_plans.id = week_plan_rules.week_plan_id
        AND week_plans.household_id = public.user_household_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM week_plans
      WHERE week_plans.id = week_plan_rules.week_plan_id
        AND week_plans.household_id = public.user_household_id()
    )
  );
