-- Revert to `value_id`
DROP VIEW IF EXISTS public.community_current_values;

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
