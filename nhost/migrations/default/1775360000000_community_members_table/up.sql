-- community_members was a VIEW on edges WHERE type='member_of'
-- But migration 1775340000000 added a CHECK constraint blocking 'member_of' edges.
-- This replaces the dead view with a proper first-class junction table.

-- 1. Drop the broken view
DROP VIEW IF EXISTS public.community_members;

-- 2. Create the actual table
CREATE TABLE public.community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Each user can only be a member of a community once
  UNIQUE(user_id, community_id)
);

-- Indexes for fast lookups
CREATE INDEX idx_community_members_user ON public.community_members(user_id);
CREATE INDEX idx_community_members_community ON public.community_members(community_id);

-- 3. Add community_status_change to edge_type enum so status history edges can be inserted
ALTER TYPE public.edge_type ADD VALUE IF NOT EXISTS 'community_status_change';
