-- Purge all legacy member_of edges since they are fully migrated to community_members
DELETE FROM public.edges
WHERE type = 'member_of';

-- Ensure no new member_of edges can be created
ALTER TABLE public.edges
ADD CONSTRAINT no_membership_edges CHECK (type != 'member_of');
