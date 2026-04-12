-- Drop optimized view for current values
DROP VIEW IF EXISTS public.community_current_values;

-- Drop slug index
DROP INDEX IF EXISTS public.idx_communities_slug;

-- Drop current_mission_id from communities
ALTER TABLE public.communities DROP COLUMN IF EXISTS current_mission_id;

-- Revert name to core_term in values table
ALTER TABLE public.values RENAME COLUMN name TO core_term;
