-- Group accounts for the association structure. Apply once in Supabase SQL Editor after db/supabase.sql.
-- Three shared logins (majlis, lijan, jamiya). Only the owner activates them, sets their passwords and roles.
-- The functions accept only these three group identities, so they can never touch any other account.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
ALTER TABLE public.emel_memberships ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.emel_memberships ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.emel_memberships ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
DROP TABLE IF EXISTS public.emel_team_invites;
DROP FUNCTION IF EXISTS public.emel_team_invite(text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.emel_check_invite(text,text);
DROP FUNCTION IF EXISTS public.emel_claim_invite(text);
DROP FUNCTION IF EXISTS public.emel_team_set_role(uuid,text);
DROP FUNCTION IF EXISTS public.emel_team_remove(uuid);
DROP FUNCTION IF EXISTS public.emel_team_cancel_invite(text);

CREATE OR REPLACE FUNCTION public.emel_is_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT EXISTS (SELECT 1 FROM public.emel_memberships WHERE user_id = auth.uid() AND role = 'owner')
$$;

CREATE OR REPLACE FUNCTION public.emel_group_email_ok(p_email text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT p_email ~ '^group-(majlis|lijan|jamiya)@accounts\.emel6vole\.vercel\.app$'
$$;

CREATE OR REPLACE FUNCTION public.emel_group_list() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF NOT public.emel_is_owner() THEN RAISE EXCEPTION 'Only the owner manages group accounts' USING ERRCODE = '42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('email',u.email,'exists',true,'role',m.role,'active',m.user_id IS NOT NULL))
  FROM auth.users u LEFT JOIN public.emel_memberships m ON m.user_id = u.id WHERE public.emel_group_email_ok(u.email)),'[]'::jsonb);
END $$;

-- Sets the password of an existing group account (the server creates it first through normal sign-up).
CREATE OR REPLACE FUNCTION public.emel_group_set_password(p_email text, p_password text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $$
BEGIN
 IF NOT public.emel_is_owner() THEN RAISE EXCEPTION 'Only the owner manages group accounts' USING ERRCODE = '42501'; END IF;
 IF NOT public.emel_group_email_ok(p_email) OR length(p_password) < 6 OR length(p_password) > 72 THEN RAISE EXCEPTION 'Invalid group password'; END IF;
 UPDATE auth.users SET encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() WHERE email = p_email;
 IF NOT FOUND THEN RAISE EXCEPTION 'Group account not found' USING ERRCODE = 'P0002'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.emel_group_activate(p_email text, p_role text, p_name text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE target uuid;
BEGIN
 IF NOT public.emel_is_owner() THEN RAISE EXCEPTION 'Only the owner manages group accounts' USING ERRCODE = '42501'; END IF;
 IF NOT public.emel_group_email_ok(p_email) OR p_role NOT IN ('editor','viewer') THEN RAISE EXCEPTION 'Invalid group account'; END IF;
 SELECT id INTO target FROM auth.users WHERE email = p_email;
 IF target IS NULL THEN RAISE EXCEPTION 'Group account not found' USING ERRCODE = 'P0002'; END IF;
 INSERT INTO public.emel_memberships(user_id,role,name,title) VALUES (target,p_role,p_name,p_name)
 ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, name = EXCLUDED.name, title = EXCLUDED.title;
END $$;

CREATE OR REPLACE FUNCTION public.emel_group_deactivate(p_email text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF NOT public.emel_is_owner() THEN RAISE EXCEPTION 'Only the owner manages group accounts' USING ERRCODE = '42501'; END IF;
 IF NOT public.emel_group_email_ok(p_email) THEN RAISE EXCEPTION 'Invalid group account'; END IF;
 DELETE FROM public.emel_memberships WHERE user_id = (SELECT id FROM auth.users WHERE email = p_email);
END $$;

REVOKE ALL ON FUNCTION public.emel_is_owner(), public.emel_group_list(), public.emel_group_set_password(text,text), public.emel_group_activate(text,text,text), public.emel_group_deactivate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emel_group_list(), public.emel_group_set_password(text,text), public.emel_group_activate(text,text,text), public.emel_group_deactivate(text) TO authenticated;
COMMIT;
