-- Tag metadata table (color, etc.) per household
-- Tag "existence" is derived from recipe tags arrays; this table stores display metadata only.
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(household_id, name)
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household_access" ON tags FOR ALL
  USING (household_id = public.user_household_id())
  WITH CHECK (household_id = public.user_household_id());

-- Atomically rename a tag across all recipes + metadata table
CREATE OR REPLACE FUNCTION public.rename_tag(
  p_household_id UUID,
  p_old_name TEXT,
  p_new_name TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE recipes
    SET tags = array_replace(tags, p_old_name, p_new_name),
        updated_at = NOW()
  WHERE household_id = p_household_id AND p_old_name = ANY(tags);

  UPDATE tags
    SET name = p_new_name
  WHERE household_id = p_household_id AND name = p_old_name;
END;
$$;

-- Atomically remove a tag from all recipes + metadata table
CREATE OR REPLACE FUNCTION public.delete_tag(
  p_household_id UUID,
  p_name TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE recipes
    SET tags = array_remove(tags, p_name),
        updated_at = NOW()
  WHERE household_id = p_household_id AND p_name = ANY(tags);

  DELETE FROM tags
  WHERE household_id = p_household_id AND name = p_name;
END;
$$;
