-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Households
CREATE TABLE households (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  invite_token TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE SET NULL,
  display_name TEXT,
  avatar_url   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recipes
CREATE TABLE recipes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  created_by     UUID NOT NULL REFERENCES auth.users(id),
  title          TEXT NOT NULL,
  description    TEXT,
  source_url     TEXT,
  image_url      TEXT,
  prep_time_min  INT,
  cook_time_min  INT,
  servings       INT,
  tags           TEXT[] NOT NULL DEFAULT '{}',
  ingredients    JSONB NOT NULL DEFAULT '[]',
  steps          JSONB NOT NULL DEFAULT '[]',
  notes          TEXT,
  is_archived    BOOLEAN NOT NULL DEFAULT FALSE,
  last_used_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Planner rules
CREATE TABLE planner_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  rule_type    TEXT NOT NULL,
  label        TEXT,
  config       JSONB NOT NULL DEFAULT '{}',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Week plans
CREATE TABLE week_plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  week_start   DATE NOT NULL,
  generated_by UUID REFERENCES auth.users(id),
  ai_reasoning TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (household_id, week_start)
);

-- Meal slots
CREATE TABLE meal_slots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_plan_id   UUID NOT NULL REFERENCES week_plans(id) ON DELETE CASCADE,
  day_of_week    INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  meal_type      TEXT NOT NULL DEFAULT 'dinner',
  recipe_id      UUID REFERENCES recipes(id) ON DELETE SET NULL,
  servings_scale NUMERIC NOT NULL DEFAULT 1,
  custom_label   TEXT
);

-- Shopping lists
CREATE TABLE shopping_lists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  week_plan_id UUID REFERENCES week_plans(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shopping items
CREATE TABLE shopping_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopping_list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  category         TEXT,
  name             TEXT NOT NULL,
  quantity         NUMERIC,
  unit             TEXT,
  is_checked       BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order       INT NOT NULL DEFAULT 0,
  source_recipe_ids UUID[] NOT NULL DEFAULT '{}'
);

-- Chat messages
CREATE TABLE chat_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id),
  role         TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content      TEXT NOT NULL,
  tool_calls   JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_recipes_household ON recipes(household_id);
CREATE INDEX idx_recipes_tags ON recipes USING GIN(tags);
CREATE INDEX idx_meal_slots_week_plan ON meal_slots(week_plan_id);
CREATE INDEX idx_shopping_items_list ON shopping_items(shopping_list_id);
CREATE INDEX idx_chat_messages_household ON chat_messages(household_id, created_at);
