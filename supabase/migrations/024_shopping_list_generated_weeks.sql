-- Week starts (YYYY-MM-DD) whose planned meals were already added to the list,
-- so adding the same week a second time asks first. Clearing the list resets it.
ALTER TABLE shopping_lists ADD COLUMN IF NOT EXISTS generated_weeks DATE[] NOT NULL DEFAULT '{}';

-- "Add below" places a new item halfway between two neighbours, which an
-- integer column rejected.
ALTER TABLE shopping_items ALTER COLUMN sort_order TYPE DOUBLE PRECISION;
