-- Management team accounts. Apply once in Supabase SQL Editor after db/supabase.sql.
-- The owner invites a member by phone with a role; the member activates the account once with a one-time code.
-- Codes are stored only as SHA-256 hashes and lock after 5 wrong attempts. Members never grant themselves a role.
BEGIN;
ALTER TABLE public.emel_memberships ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.emel_memberships ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.emel_memberships ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS public.emel_team_invites (
 login_email text PRIMARY KEY,
 phone text NOT NULL,
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
 role text NOT NULL CHECK (role IN ('owner','editor','viewer')),
 code_hash text NOT NULL,
 attempts int NOT NULL DEFAULT 0,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.emel_team_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emel_team_invites FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.emel_is_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT EXISTS (SELECT 1 FROM public.emel_memberships WHERE user_id = auth.uid() AND role = 'owner')
$$;

CREATE OR REPLACE FUNCTION public.emel_team_list() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF NOT public.emel_is_owner() THEN RAISE EXCEPTION 'Only the owner manages the team' USING ERRCODE = '42501'; END IF;
 RETURN jsonb_build_object(
  'members', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',m.name,'title',m.title,'role',m.role,'self',m.user_id = auth.uid(),'created_at',m.created_at) ORDER BY m.created_at) FROM public.emel_memberships m),'[]'::jsonb),
  'invites', coalesce((SELECT jsonb_agg(jsonb_build_object('login_email',i.login_email,'phone',i.phone,'name',i.name,'title',i.title,'role',i.role,'locked',i.attempts >= 5,'created_at',i.created_at) ORDER BY i.created_at) FROM public.emel_team_invites i),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.emel_team_invite(p_email text, p_phone text, p_name text, p_title text, p_role text, p_code_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF NOT public.emel_is_owner() THEN RAISE EXCEPTION 'Only the owner manages the team' USING ERRCODE = '42501'; END IF;
 IF p_role NOT IN ('owner','editor','viewer') OR p_code_hash !~ '^[0-9a-f]{64}$' OR p_email !~ '^phone-[0-9a-f]{64}@' THEN RAISE EXCEPTION 'Invalid invitation'; END IF;
 IF EXISTS (SELECT 1 FROM public.emel_memberships m JOIN auth.users u ON u.id = m.user_id WHERE lower(u.email) = lower(p_email)) THEN RAISE EXCEPTION 'Already a team member' USING ERRCODE = '23505'; END IF;
 INSERT INTO public.emel_team_invites(login_email,phone,name,title,role,code_hash,attempts,created_by)
 VALUES (lower(p_email),p_phone,trim(p_name),trim(p_title),p_role,p_code_hash,0,auth.uid())
 ON CONFLICT (login_email) DO UPDATE SET phone = EXCLUDED.phone, name = EXCLUDED.name, title = EXCLUDED.title, role = EXCLUDED.role, code_hash = EXCLUDED.code_hash, attempts = 0, created_by = EXCLUDED.created_by, created_at = now();
END $$;

-- Called before sign-up, without a session: true only for a pending, unlocked invitation with the right code.
CREATE OR REPLACE FUNCTION public.emel_check_invite(p_email text, p_code_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE inv public.emel_team_invites;
BEGIN
 SELECT * INTO inv FROM public.emel_team_invites WHERE login_email = lower(p_email) FOR UPDATE;
 IF NOT FOUND OR inv.attempts >= 5 THEN RETURN false; END IF;
 IF inv.code_hash <> p_code_hash THEN UPDATE public.emel_team_invites SET attempts = attempts + 1 WHERE login_email = inv.login_email; RETURN false; END IF;
 RETURN true;
END $$;

-- Called by the signed-in member: turns the matching invitation into a membership.
CREATE OR REPLACE FUNCTION public.emel_claim_invite(p_code_hash text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE my_email text; inv public.emel_team_invites;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501'; END IF;
 SELECT lower(email) INTO my_email FROM auth.users WHERE id = auth.uid();
 SELECT * INTO inv FROM public.emel_team_invites WHERE login_email = my_email FOR UPDATE;
 IF NOT FOUND OR inv.attempts >= 5 THEN RETURN NULL; END IF;
 IF inv.code_hash <> p_code_hash THEN UPDATE public.emel_team_invites SET attempts = attempts + 1 WHERE login_email = inv.login_email; RETURN NULL; END IF;
 INSERT INTO public.emel_memberships(user_id,role,name,title) VALUES (auth.uid(),inv.role,inv.name,inv.title)
 ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, name = EXCLUDED.name, title = EXCLUDED.title;
 DELETE FROM public.emel_team_invites WHERE login_email = inv.login_email;
 RETURN inv.role;
END $$;

CREATE OR REPLACE FUNCTION public.emel_team_set_role(p_user uuid, p_role text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF NOT public.emel_is_owner() THEN RAISE EXCEPTION 'Only the owner manages the team' USING ERRCODE = '42501'; END IF;
 IF p_user = auth.uid() THEN RAISE EXCEPTION 'You cannot change your own role'; END IF;
 IF p_role NOT IN ('owner','editor','viewer') THEN RAISE EXCEPTION 'Invalid role'; END IF;
 UPDATE public.emel_memberships SET role = p_role WHERE user_id = p_user;
 IF NOT FOUND THEN RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.emel_team_remove(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF NOT public.emel_is_owner() THEN RAISE EXCEPTION 'Only the owner manages the team' USING ERRCODE = '42501'; END IF;
 IF p_user = auth.uid() THEN RAISE EXCEPTION 'You cannot remove yourself'; END IF;
 DELETE FROM public.emel_memberships WHERE user_id = p_user;
 IF NOT FOUND THEN RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.emel_team_cancel_invite(p_email text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF NOT public.emel_is_owner() THEN RAISE EXCEPTION 'Only the owner manages the team' USING ERRCODE = '42501'; END IF;
 DELETE FROM public.emel_team_invites WHERE login_email = lower(p_email);
END $$;

REVOKE ALL ON FUNCTION public.emel_is_owner(), public.emel_team_list(), public.emel_team_invite(text,text,text,text,text,text), public.emel_check_invite(text,text), public.emel_claim_invite(text), public.emel_team_set_role(uuid,text), public.emel_team_remove(uuid), public.emel_team_cancel_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emel_team_list(), public.emel_team_invite(text,text,text,text,text,text), public.emel_claim_invite(text), public.emel_team_set_role(uuid,text), public.emel_team_remove(uuid), public.emel_team_cancel_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emel_check_invite(text,text) TO anon, authenticated;
COMMIT;
