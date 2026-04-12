-- Backfill Script for Phase 2
-- Run this directly in your Postgres console or DBeaver / TablePlus after executing Phase 1 migrations.

-- This script intelligently maps your `adopts_mission` edges into the new `current_mission_id` foreign key.
UPDATE public.communities c
SET current_mission_id = e.target_id
FROM public.edges e
WHERE e.source_id = c.id
  AND e.type = 'adopts_mission'
  -- Prioritize the mission that doesn't have an end_date (meaning it's currently active)
  AND (e.end_date IS NULL OR e.end_date > NOW())
  -- If there are somehow multiple active missions, we pick the one that started most recently
  AND e.start_date = (
      SELECT MAX(start_date)
      FROM public.edges e2
      WHERE e2.source_id = c.id 
        AND e2.type = 'adopts_mission'
        AND (e2.end_date IS NULL OR e2.end_date > NOW())
  );

-- You can safely verify that parsing was successful by checking the total counts:
-- SELECT COUNT(*) FROM communities WHERE current_mission_id IS NOT NULL;
