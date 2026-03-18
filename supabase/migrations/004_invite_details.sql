-- Returns household name + members for a given invite token.
-- SECURITY DEFINER so unauthenticated visitors on the /join page can call it.
CREATE OR REPLACE FUNCTION public.get_household_invite_details(token TEXT)
RETURNS TABLE (
  id            UUID,
  name          TEXT,
  members       JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    h.id,
    h.name,
    COALESCE(
      jsonb_agg(
        jsonb_build_object('display_name', p.display_name, 'avatar_url', p.avatar_url)
      ) FILTER (WHERE p.id IS NOT NULL),
      '[]'::jsonb
    ) AS members
  FROM public.households h
  LEFT JOIN public.profiles p ON p.household_id = h.id
  WHERE h.invite_token = token
  GROUP BY h.id, h.name
$$;
