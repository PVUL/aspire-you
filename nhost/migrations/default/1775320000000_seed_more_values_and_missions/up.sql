-- Seed More Values
INSERT INTO values (id, core_term, description, applicable_to) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Empathy', 'Seek to understand before being understood.', 'both'),
  ('22222222-2222-2222-2222-222222222222', 'Resilience', 'Bounce back from failure.', 'both'),
  ('33333333-3333-3333-3333-333333333333', 'Curiosity', 'Always ask why.', 'both'),
  ('44444444-4444-4444-4444-444444444444', 'Focus', 'Do one thing well.', 'user'),
  ('55555555-5555-5555-5555-555555555555', 'Collaboration', 'Win together.', 'community'),
  ('66666666-6666-6666-6666-666666666666', 'Craftsmanship', 'Take pride in the details.', 'both'),
  ('77777777-7777-7777-7777-777777777777', 'Stillness', 'Find peace in the noise.', 'both'),
  ('88888888-8888-8888-8888-888888888888', 'Deep Work', 'Uninterrupted focus over long periods.', 'both'),
  ('99999999-9999-9999-9999-999999999999', 'Impact', 'Optimize for meaningful outcomes.', 'both')
ON CONFLICT DO NOTHING;

-- Seed More Missions
INSERT INTO missions (id, statement, status) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Create a quiet space for deep thinkers to do their best work.', 'active')
ON CONFLICT DO NOTHING;

-- Connect Missions and Values to Communities
INSERT INTO edges (source_id, target_id, type) VALUES
  -- Aspire Builders (a1b2c3d4-e5f6-4788-9900-112233445566)
  ('a1b2c3d4-e5f6-4788-9900-112233445566', '55555555-5555-5555-5555-555555555555', 'embodies_value'), -- Collaboration
  ('a1b2c3d4-e5f6-4788-9900-112233445566', '66666666-6666-6666-6666-666666666666', 'embodies_value'), -- Craftsmanship
  ('a1b2c3d4-e5f6-4788-9900-112233445566', '99999999-9999-9999-9999-999999999999', 'embodies_value'), -- Impact

  -- Radical Thinkers (b2c3d4e5-f6a7-4899-0011-223344556677)
  ('b2c3d4e5-f6a7-4899-0011-223344556677', '33333333-3333-3333-3333-333333333333', 'embodies_value'), -- Curiosity
  ('b2c3d4e5-f6a7-4899-0011-223344556677', '11111111-1111-1111-1111-111111111111', 'embodies_value'), -- Empathy

  -- Quiet Cohort (c3d4e5f6-a7b8-4900-1122-334455667788)
  ('c3d4e5f6-a7b8-4900-1122-334455667788', '77777777-7777-7777-7777-777777777777', 'embodies_value'), -- Stillness
  ('c3d4e5f6-a7b8-4900-1122-334455667788', '88888888-8888-8888-8888-888888888888', 'embodies_value'), -- Deep Work
  ('c3d4e5f6-a7b8-4900-1122-334455667788', '44444444-4444-4444-4444-444444444444', 'embodies_value'), -- Focus
  ('c3d4e5f6-a7b8-4900-1122-334455667788', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'adopts_mission')
ON CONFLICT DO NOTHING;
