UPDATE public.recipes
SET share_token = NULL
WHERE is_archived = TRUE
  AND share_token IS NOT NULL;

ALTER TABLE public.recipes
  ADD CONSTRAINT recipes_archived_share_token_check
  CHECK (NOT is_archived OR share_token IS NULL);
