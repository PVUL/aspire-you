CREATE TABLE communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Values (First-Class Entity)
CREATE TABLE values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  core_term TEXT NOT NULL,
  description TEXT,
  applicable_to TEXT DEFAULT 'both' CHECK (applicable_to IN ('user', 'community', 'both')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(core_term, applicable_to)
);

-- Missions (First-Class Entity)
CREATE TABLE missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- active, achieved, abandoned. But we track changes via edges over time.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE edge_type AS ENUM (
  'member_of',      -- User -> Community
  'cohort_of',      -- Cohort -> Community
  'in_cohort',      -- User -> Cohort
  'partner_with',   -- Community -> Community
  'forked_from',    -- Community -> Community
  'embodies_value', -- User/Community -> Value
  'adopts_mission'  -- Community -> Mission
);

CREATE TABLE edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  target_id UUID NOT NULL,
  type edge_type NOT NULL,
  
  -- Temporal flexibility
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ, -- If null, the relationship is ongoing
  
  -- Flexible metadata (e.g., roles like "admin", specific data-sharing policies)
  metadata JSONB DEFAULT '{}'::jsonb, 
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crucial Indexes for Graph Traversal
CREATE INDEX idx_edges_source ON edges(source_id, type);
CREATE INDEX idx_edges_target ON edges(target_id, type);

-- Referential Integrity Trigger
CREATE OR REPLACE FUNCTION cleanup_edges() RETURNS trigger AS $$
BEGIN
    DELETE FROM edges WHERE source_id = OLD.id OR target_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_edges_communities
AFTER DELETE ON communities
FOR EACH ROW
EXECUTE FUNCTION cleanup_edges();

CREATE TRIGGER trigger_cleanup_edges_values
AFTER DELETE ON values
FOR EACH ROW
EXECUTE FUNCTION cleanup_edges();

CREATE TRIGGER trigger_cleanup_edges_missions
AFTER DELETE ON missions
FOR EACH ROW
EXECUTE FUNCTION cleanup_edges();

CREATE TRIGGER trigger_cleanup_edges_users
AFTER DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION cleanup_edges();

-- Bounded Recursive View (Function) for Discovery (<= 2 hops)
-- This function finds public communities that the user is NOT a member of, 
-- but are connected to the user's communities (e.g. via 'partner_with' or 'forked_from')
-- up to 2 hops away.
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
  -- Exclude communities the user is already a member of
  AND c.id NOT IN (
    SELECT target_id FROM edges WHERE source_id = user_uuid AND type = 'member_of' AND end_date IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE;
