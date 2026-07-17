ALTER TABLE public.recipes
  ADD COLUMN share_token TEXT;

CREATE UNIQUE INDEX recipes_share_token_unique
  ON public.recipes (share_token)
  WHERE share_token IS NOT NULL;
