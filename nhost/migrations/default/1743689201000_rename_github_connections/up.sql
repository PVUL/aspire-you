ALTER TABLE public.github_connections RENAME TO user_vault_connections;
ALTER TABLE public.user_vault_connections ADD COLUMN provider TEXT NOT NULL DEFAULT 'github';
ALTER TABLE public.user_vault_connections DROP CONSTRAINT github_connections_pkey;
ALTER TABLE public.user_vault_connections ADD CONSTRAINT user_vault_connections_pkey PRIMARY KEY (user_id, provider);
