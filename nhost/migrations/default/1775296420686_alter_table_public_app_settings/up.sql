ALTER TABLE public.app_settings ALTER COLUMN value DROP DEFAULT;
ALTER TABLE public.app_settings ALTER COLUMN value TYPE bool USING value::bool;
