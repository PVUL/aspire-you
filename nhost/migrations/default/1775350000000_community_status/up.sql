-- Add status column to communities
-- Possible values: 'active' | 'archived'
-- Default is 'active' so all existing communities are treated as live.
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

-- Constrain to valid values
ALTER TABLE public.communities
  ADD CONSTRAINT communities_status_check CHECK (status IN ('active', 'archived'));

-- Index for fast filtering by status (e.g. WHERE status = 'active')
CREATE INDEX IF NOT EXISTS idx_communities_status ON public.communities(status);

-- Backfill: all existing communities are active
UPDATE public.communities SET status = 'active' WHERE status IS NULL;
