-- Helper: returns current user's household_id
CREATE OR REPLACE FUNCTION public.user_household_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT household_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Helper: look up household by invite token (bypasses RLS for join flow)
CREATE OR REPLACE FUNCTION public.get_household_by_invite_token(token TEXT)
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id, name FROM public.households WHERE invite_token = token LIMIT 1
$$;

-- Enable RLS
ALTER TABLE households    ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE week_plans    ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_slots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Households: members can read/update their own
CREATE POLICY "household_read" ON households
  FOR SELECT USING (id = public.user_household_id());

CREATE POLICY "household_insert" ON households
  FOR INSERT WITH CHECK (true); -- controlled by server action

CREATE POLICY "household_update" ON households
  FOR UPDATE USING (id = public.user_household_id());

-- Profiles: user can read own + household members'
CREATE POLICY "profile_read_own" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR household_id = public.user_household_id()
  );

CREATE POLICY "profile_insert_own" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profile_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Standard household-scoped pattern for all remaining tables
CREATE POLICY "household_access" ON recipes
  FOR ALL USING (household_id = public.user_household_id())
  WITH CHECK (household_id = public.user_household_id());

CREATE POLICY "household_access" ON planner_rules
  FOR ALL USING (household_id = public.user_household_id())
  WITH CHECK (household_id = public.user_household_id());

CREATE POLICY "household_access" ON week_plans
  FOR ALL USING (household_id = public.user_household_id())
  WITH CHECK (household_id = public.user_household_id());

CREATE POLICY "household_access" ON shopping_lists
  FOR ALL USING (household_id = public.user_household_id())
  WITH CHECK (household_id = public.user_household_id());

CREATE POLICY "household_access" ON chat_messages
  FOR ALL USING (household_id = public.user_household_id())
  WITH CHECK (household_id = public.user_household_id());

-- meal_slots: accessible via week_plan membership
CREATE POLICY "household_access" ON meal_slots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM week_plans
      WHERE week_plans.id = meal_slots.week_plan_id
        AND week_plans.household_id = public.user_household_id()
    )
  );

-- shopping_items: accessible via shopping_list membership
CREATE POLICY "household_access" ON shopping_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shopping_lists
      WHERE shopping_lists.id = shopping_items.shopping_list_id
        AND shopping_lists.household_id = public.user_household_id()
    )
  );
