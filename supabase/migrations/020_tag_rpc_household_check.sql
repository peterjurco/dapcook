-- rename_tag and delete_tag are SECURITY DEFINER, so RLS does not apply inside
-- them, and they trusted p_household_id as given. Any signed-in user could call
-- them over PostgREST RPC for another household and rename or strip its tags.
-- The app always passes the caller's own household, so only direct RPC calls
-- are affected — reject anything else.
--
-- The other SECURITY DEFINER functions (user_household_id and the invite-token
-- lookups) take no household id, so they do not need this check.

CREATE OR REPLACE FUNCTION public.rename_tag(
  p_household_id UUID,
  p_old_name TEXT,
  p_new_name TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_household_id IS DISTINCT FROM public.user_household_id() THEN
    RAISE EXCEPTION 'not a member of this household' USING ERRCODE = '42501';
  END IF;

  UPDATE recipes
    SET tags = array_replace(tags, p_old_name, p_new_name),
        updated_at = NOW()
  WHERE household_id = p_household_id AND p_old_name = ANY(tags);

  UPDATE tags
    SET name = p_new_name
  WHERE household_id = p_household_id AND name = p_old_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_tag(
  p_household_id UUID,
  p_name TEXT
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_household_id IS DISTINCT FROM public.user_household_id() THEN
    RAISE EXCEPTION 'not a member of this household' USING ERRCODE = '42501';
  END IF;

  UPDATE recipes
    SET tags = array_remove(tags, p_name),
        updated_at = NOW()
  WHERE household_id = p_household_id AND p_name = ANY(tags);

  DELETE FROM tags
  WHERE household_id = p_household_id AND name = p_name;
END;
$$;
