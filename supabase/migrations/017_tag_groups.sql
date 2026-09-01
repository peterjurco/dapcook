-- Tag groups: optional, user-created buckets a tag may belong to.
-- Tags remain a TEXT[] on recipes; group membership is metadata on the tags table.
CREATE TABLE tag_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  position     INT  NOT NULL DEFAULT 0,
  is_pinned    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(household_id, name)
);

CREATE INDEX idx_tag_groups_household ON tag_groups(household_id);

ALTER TABLE tag_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household_access" ON tag_groups
  FOR ALL USING (household_id = public.user_household_id())
  WITH CHECK (household_id = public.user_household_id());

-- Deleting a group is lossless: member tags survive and become ungrouped.
ALTER TABLE tags ADD COLUMN group_id UUID REFERENCES tag_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_tags_group ON tags(group_id);

-- Per-user default filter for the recipe list. Holds tag names.
ALTER TABLE profiles ADD COLUMN default_recipe_filter TEXT[] NOT NULL DEFAULT '{}';
