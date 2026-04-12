-- Revert: drop table and restore the view
DROP TABLE IF EXISTS public.community_members;

CREATE OR REPLACE VIEW public.community_members AS
SELECT 
  id as edge_id,
  source_id AS user_id, 
  target_id AS community_id, 
  start_date AS joined_at,
  metadata
FROM public.edges 
WHERE type = 'member_of' AND end_date IS NULL;

-- Note: PostgreSQL does not support removing enum values.
-- The 'community_status_change' value will remain in the enum after rollback.
