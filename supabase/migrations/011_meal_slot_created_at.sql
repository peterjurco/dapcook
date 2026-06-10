-- Track when a meal slot was added so multiple meals on the same day keep a
-- stable, insertion-based order (newly added meals sort last). Existing rows
-- all receive the migration timestamp and fall back to id for ordering.
ALTER TABLE meal_slots
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
