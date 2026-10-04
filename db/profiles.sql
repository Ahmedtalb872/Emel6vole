-- Personal membership application files. Apply once in Supabase SQL Editor.
BEGIN;
CREATE TABLE IF NOT EXISTS public.emel_profiles (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 40000),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.emel_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emel_profiles FROM anon, authenticated;
GRANT SELECT ON public.emel_profiles TO authenticated;
GRANT INSERT (user_id,payload), UPDATE (user_id,payload) ON public.emel_profiles TO authenticated;
DROP POLICY IF EXISTS emel_profile_read ON public.emel_profiles;
CREATE POLICY emel_profile_read ON public.emel_profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS emel_profile_create ON public.emel_profiles;
CREATE POLICY emel_profile_create ON public.emel_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS emel_profile_update ON public.emel_profiles;
CREATE POLICY emel_profile_update ON public.emel_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
COMMIT;
