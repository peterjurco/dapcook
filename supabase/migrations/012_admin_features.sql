-- Add last sign-in tracking to households
ALTER TABLE households ADD COLUMN last_sign_in_at TIMESTAMPTZ;

-- AI usage log table
CREATE TABLE ai_usage_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  feature       TEXT        NOT NULL,
  input_tokens  INT         NOT NULL,
  output_tokens INT         NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_logs_household ON ai_usage_logs(household_id);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Users can insert their own household's logs (server routes run as the authed user)
CREATE POLICY "household_insert" ON ai_usage_logs
  FOR INSERT WITH CHECK (household_id = public.user_household_id());

-- No SELECT policy — only service role (admin page) can read
