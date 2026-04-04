-- Previous definition if rollback is required
CREATE OR REPLACE FUNCTION get_recommended_communities(user_uuid UUID)
RETURNS SETOF communities AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE community_graph AS (
    SELECT target_id as community_id, 0 as depth
    FROM edges
    WHERE source_id = user_uuid AND type = 'member_of' AND end_date IS NULL
    
    UNION
    
    SELECT e.target_id as community_id, cg.depth + 1 as depth
    FROM edges e
    JOIN community_graph cg ON e.source_id = cg.community_id
    WHERE e.type IN ('partner_with', 'forked_from') 
      AND e.end_date IS NULL 
      AND cg.depth < 2
      
    UNION 
    
    SELECT e.source_id as community_id, cg.depth + 1 as depth
    FROM edges e
    JOIN community_graph cg ON e.target_id = cg.community_id
    WHERE e.type IN ('partner_with', 'forked_from') 
      AND e.end_date IS NULL 
      AND cg.depth < 2
  )
  SELECT c.*
  FROM communities c
  JOIN community_graph cg ON c.id = cg.community_id
  WHERE cg.depth > 0 AND cg.depth <= 2 AND c.is_public = true
  AND c.id NOT IN (
    SELECT target_id FROM edges WHERE source_id = user_uuid AND type = 'member_of' AND end_date IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE;
