CREATE TABLE IF NOT EXISTS public.github_connections (
  user_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
