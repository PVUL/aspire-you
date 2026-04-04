-- Seed Communities
INSERT INTO communities (id, name, slug, is_public) VALUES
  ('a1b2c3d4-e5f6-4788-9900-112233445566', 'Aspire Builders', 'aspire-builders', true),
  ('b2c3d4e5-f6a7-4899-0011-223344556677', 'Radical Thinkers', 'radical-thinkers', true),
  ('c3d4e5f6-a7b8-4900-1122-334455667788', 'Quiet Cohort', 'quiet-cohort', true)
ON CONFLICT DO NOTHING;

-- Seed Values
INSERT INTO values (id, core_term, description, applicable_to) VALUES
  ('d4e5f6a7-b8c9-4011-2233-445566778899', 'Transparency', 'Total operational transparency', 'community'),
  ('e5f6a7b8-c9d0-4122-3344-556677889900', 'Integrity', 'Do what you say', 'both'),
  ('f6a7b8c9-d0e1-4233-4455-667788990011', 'Self-Ownership', 'You own your mind', 'user')
ON CONFLICT DO NOTHING;

-- Seed Missions
INSERT INTO missions (id, statement, status) VALUES
  ('12345678-90ab-cdef-1234-567890abcdef', 'Build the best local-first community tooling.', 'active'),
  ('23456789-0abc-def1-2345-67890abcdef1', 'Empower 1,000 thinkers to publish daily.', 'active')
ON CONFLICT DO NOTHING;

-- Connect Missions and Values to Communities
INSERT INTO edges (source_id, target_id, type) VALUES
  -- Aspire Builders embodies Transparency
  ('a1b2c3d4-e5f6-4788-9900-112233445566', 'd4e5f6a7-b8c9-4011-2233-445566778899', 'embodies_value'),
  -- Aspire Builders adopts Mission 1
  ('a1b2c3d4-e5f6-4788-9900-112233445566', '12345678-90ab-cdef-1234-567890abcdef', 'adopts_mission'),
  
  -- Radical Thinkers embodies Integrity
  ('b2c3d4e5-f6a7-4899-0011-223344556677', 'e5f6a7b8-c9d0-4122-3344-556677889900', 'embodies_value'),
  -- Radical Thinkers adopts Mission 2
  ('b2c3d4e5-f6a7-4899-0011-223344556677', '23456789-0abc-def1-2345-67890abcdef1', 'adopts_mission'),
  
  -- Aspire Builders partner_with Radical Thinkers
  ('a1b2c3d4-e5f6-4788-9900-112233445566', 'b2c3d4e5-f6a7-4899-0011-223344556677', 'partner_with')
ON CONFLICT DO NOTHING;
