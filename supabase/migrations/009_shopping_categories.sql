-- Shopping categories: ordered, per-household
CREATE TABLE shopping_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(household_id, name)
);

CREATE INDEX idx_shopping_categories_household ON shopping_categories(household_id);

ALTER TABLE shopping_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household_access" ON shopping_categories
  FOR ALL USING (household_id = public.user_household_id())
  WITH CHECK (household_id = public.user_household_id());

-- Extend shopping_lists with date range
ALTER TABLE shopping_lists
  ADD COLUMN date_from DATE,
  ADD COLUMN date_to   DATE;
