-- Enable unaccent extension
CREATE EXTENSION IF NOT EXISTS unaccent;

-- PostgreSQL's unaccent() is STABLE (not IMMUTABLE) by default, which prevents
-- using it in generated columns. This immutable wrapper bypasses that by pinning
-- the dictionary explicitly, making the function safe for generated columns.
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $func$
  SELECT unaccent('unaccent'::regdictionary, $1)
$func$;

-- Add a stored generated column: lowercased + unaccented title for search
ALTER TABLE recipes
  ADD COLUMN title_normalized TEXT
  GENERATED ALWAYS AS (lower(public.f_unaccent(title))) STORED;
