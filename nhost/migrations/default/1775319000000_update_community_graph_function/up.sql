CREATE OR REPLACE FUNCTION get_recommended_communities(user_uuid UUID)
RETURNS SETOF communities AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE community_graph AS (
    -- Base case: Communities the user is directly a member of (Hop 0)
    SELECT target_id as community_id, 0 as depth
    FROM edges
    WHERE source_id = user_uuid AND type = 'member_of' AND end_date IS NULL
    
    UNION
    
    -- Recursive step: Find adjacent communities (Hop 1 and 2)
    -- Grouped into a single UNION block to satisfy PostgreSQL's single-recursive-term constraint length
    SELECT 
      CASE WHEN e.source_id = cg.community_id THEN e.target_id ELSE e.source_id END as community_id,
      cg.depth + 1 as depth
    FROM edges e
    JOIN community_graph cg ON cg.community_id IN (e.source_id, e.target_id)
    WHERE e.type IN ('partner_with', 'forked_from') 
      AND e.end_date IS NULL 
      AND cg.depth < 2
  )
  SELECT c.*
  FROM communities c
  JOIN community_graph cg ON c.id = cg.community_id
  WHERE cg.depth > 0 AND cg.depth <= 2 AND c.is_public = true
  -- Exclude communities the user is already a member of
  AND c.id NOT IN (
    SELECT target_id FROM edges WHERE source_id = user_uuid AND type = 'member_of' AND end_date IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE;
