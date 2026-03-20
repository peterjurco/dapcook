ALTER TABLE households
  ADD COLUMN preferred_units TEXT NOT NULL DEFAULT 'metric'
  CHECK (preferred_units IN ('metric', 'imperial'));
