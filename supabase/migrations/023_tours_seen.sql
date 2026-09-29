-- Product tours a user has completed or skipped, so each one shows only once.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tours_seen TEXT[] NOT NULL DEFAULT '{}';

-- Appends one tour id for the caller, only if it is not there yet. Running it
-- server-side means two tabs can never overwrite each other's list.
-- SECURITY INVOKER: the profile_update_own RLS policy still applies.
CREATE OR REPLACE FUNCTION public.mark_tour_seen(p_tour TEXT) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = public
AS $$
  UPDATE profiles
    SET tours_seen = array_append(tours_seen, p_tour)
  WHERE id = auth.uid() AND NOT (p_tour = ANY(tours_seen));
$$;
