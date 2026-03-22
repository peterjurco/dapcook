CREATE TABLE shopping_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  rule         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shopping_rules_household ON shopping_rules(household_id);

ALTER TABLE shopping_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household_access" ON shopping_rules
  FOR ALL USING (household_id = public.user_household_id())
  WITH CHECK (household_id = public.user_household_id());
