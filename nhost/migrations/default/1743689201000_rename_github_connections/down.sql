ALTER TABLE public.user_vault_connections DROP CONSTRAINT user_vault_connections_pkey;
ALTER TABLE public.user_vault_connections ADD CONSTRAINT github_connections_pkey PRIMARY KEY (user_id);
ALTER TABLE public.user_vault_connections DROP COLUMN provider;
ALTER TABLE public.user_vault_connections RENAME TO github_connections;
