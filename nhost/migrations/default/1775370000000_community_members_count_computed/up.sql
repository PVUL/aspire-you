-- Create a custom function to act as a computed field for Hasura
-- This allows `community_members_count` to be queried directly on the `communities` object.

CREATE OR REPLACE FUNCTION public.community_members_count(community_row public.communities)
RETURNS INT AS $$
  SELECT count(*)::INT
  FROM public.community_members
  WHERE community_id = community_row.id;
$$ LANGUAGE sql STABLE;
