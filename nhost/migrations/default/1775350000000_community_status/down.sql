ALTER TABLE public.communities DROP CONSTRAINT IF EXISTS communities_status_check;
DROP INDEX IF EXISTS idx_communities_status;
ALTER TABLE public.communities DROP COLUMN IF EXISTS status;
