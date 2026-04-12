-- Rename core_term to name in values table
ALTER TABLE public.values RENAME COLUMN core_term TO name;

-- Add current_mission_id to communities
ALTER TABLE public.communities ADD COLUMN current_mission_id UUID REFERENCES public.missions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_communities_current_mission ON public.communities(current_mission_id);

-- Ensure slug is uniquely indexed for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_communities_slug ON public.communities(slug);

-- Create optimized view for current values
CREATE OR REPLACE VIEW public.community_current_values AS
SELECT 
    e.source_id AS community_id,
    v.id AS value_id,
    v.name,
    v.description,
    e.start_date
FROM public.edges e
JOIN public.values v ON e.target_id = v.id
WHERE e.type = 'embodies_value' 
  AND e.end_date IS NULL;
