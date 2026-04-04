CREATE OR REPLACE VIEW community_members AS
SELECT 
  id as edge_id,
  source_id AS user_id, 
  target_id AS community_id, 
  start_date AS joined_at,
  metadata
FROM edges 
WHERE type = 'member_of' AND end_date IS NULL;
