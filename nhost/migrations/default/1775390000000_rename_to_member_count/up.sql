-- Create the new nicely-named function
CREATE OR REPLACE FUNCTION public.member_count(community_row public.communities)
RETURNS INT AS $$
  SELECT count(*)::INT
  FROM public.community_members
  WHERE community_id = community_row.id;
$$ LANGUAGE sql STABLE;

-- Drop the old longer-named function
DROP FUNCTION IF EXISTS public.community_members_count(public.communities);
