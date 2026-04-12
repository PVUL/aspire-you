-- Re-create the long-named function
CREATE OR REPLACE FUNCTION public.community_members_count(community_row public.communities)
RETURNS INT AS $$
  SELECT count(*)::INT
  FROM public.community_members
  WHERE community_id = community_row.id;
$$ LANGUAGE sql STABLE;

-- Drop the short-named function
DROP FUNCTION IF EXISTS public.member_count(public.communities);
