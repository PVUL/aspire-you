-- Remove the constraint
ALTER TABLE public.edges
DROP CONSTRAINT no_membership_edges;

-- Note: Cannot easily restore deleted member_of edges if down is run without a snapshot.
