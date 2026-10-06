-- Membership request review. Apply once in Supabase SQL Editor after db/supabase.sql and db/profiles.sql.
-- Applicants cannot change their own status; only owner/editor staff can review through emel_review_profile.
BEGIN;
ALTER TABLE public.emel_profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.emel_profiles ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.emel_profiles ADD COLUMN IF NOT EXISTS reviewed_by uuid;
ALTER TABLE public.emel_profiles DROP CONSTRAINT IF EXISTS emel_profiles_status_check;
ALTER TABLE public.emel_profiles ADD CONSTRAINT emel_profiles_status_check CHECK (status IN ('pending','approved','rejected'));
DROP POLICY IF EXISTS emel_profile_staff_read ON public.emel_profiles;
CREATE POLICY emel_profile_staff_read ON public.emel_profiles FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.emel_memberships WHERE user_id = auth.uid()));
CREATE OR REPLACE FUNCTION public.emel_review_profile(target uuid, decision text) RETURNS public.emel_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE result public.emel_profiles;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.emel_memberships WHERE user_id = auth.uid() AND role IN ('owner','editor')) THEN RAISE EXCEPTION 'Not allowed to review membership requests' USING ERRCODE = '42501'; END IF;
 IF decision NOT IN ('pending','approved','rejected') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 UPDATE public.emel_profiles SET status = decision, reviewed_at = CASE WHEN decision = 'pending' THEN NULL ELSE now() END, reviewed_by = CASE WHEN decision = 'pending' THEN NULL ELSE auth.uid() END WHERE user_id = target RETURNING * INTO result;
 IF result.user_id IS NULL THEN RAISE EXCEPTION 'Membership request not found' USING ERRCODE = 'P0002'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.emel_review_profile(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emel_review_profile(uuid,text) TO authenticated;
COMMIT;
-- Approval records the decision only; it never grants dashboard access (emel_memberships stays manual).
