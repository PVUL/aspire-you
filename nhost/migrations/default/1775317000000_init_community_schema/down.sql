DROP FUNCTION IF EXISTS get_recommended_communities(UUID);

DROP TRIGGER IF EXISTS trigger_cleanup_edges_users ON auth.users;
DROP TRIGGER IF EXISTS trigger_cleanup_edges_missions ON missions;
DROP TRIGGER IF EXISTS trigger_cleanup_edges_values ON values;
DROP TRIGGER IF EXISTS trigger_cleanup_edges_communities ON communities;

DROP FUNCTION IF EXISTS cleanup_edges();

DROP TABLE IF EXISTS edges;
DROP TYPE IF EXISTS edge_type;

DROP TABLE IF EXISTS missions;
DROP TABLE IF EXISTS values;
DROP TABLE IF EXISTS communities;
