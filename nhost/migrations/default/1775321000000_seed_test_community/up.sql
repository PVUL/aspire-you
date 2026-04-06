-- Seed 'test' mission and value for test-community
INSERT INTO missions (id, statement, status) VALUES
  ('5555aaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'test', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO values (id, core_term, description, applicable_to) VALUES
  ('6666aaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'test', 'test', 'both')
ON CONFLICT DO NOTHING;

-- Link to test-community (ac67a424-9318-43c7-8057-2a1858df2450)
INSERT INTO edges (source_id, target_id, type) VALUES
  ('ac67a424-9318-43c7-8057-2a1858df2450', '5555aaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'adopts_mission'),
  ('ac67a424-9318-43c7-8057-2a1858df2450', '6666aaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'embodies_value')
ON CONFLICT DO NOTHING;
