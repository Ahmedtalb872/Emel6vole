-- Storehouse (المخازن): in-kind donations recorded as non-cash income, plus distributions. Apply once in Supabase SQL Editor after db/patients.sql.
-- Includes the sponsored children kind from db/children.sql, so running this file alone is enough. Records use codes STK-000001.
BEGIN;
ALTER TABLE public.emel_records DROP CONSTRAINT IF EXISTS emel_records_kind_check;
ALTER TABLE public.emel_records ADD CONSTRAINT emel_records_kind_check CHECK (kind IN ('income','expense','member','worker','beneficiary','aid','settings','patient','child','stock'));
CREATE OR REPLACE FUNCTION public.emel_validate_record() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE parent_kind text; parent_deleted boolean;
BEGIN
 IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW.kind <> OLD.kind OR NEW.created_at <> OLD.created_at) THEN RAISE EXCEPTION 'Record identity is immutable'; END IF;
 IF TG_OP = 'INSERT' THEN NEW.created_at := now(); NEW.deleted := false; END IF;
 NEW.updated_at := now();
 NEW.payload := NEW.payload - 'id' - 'kind' - 'code';
 IF octet_length(NEW.payload::text) > 120000 THEN RAISE EXCEPTION 'Record payload is too large'; END IF;
 IF NEW.kind IN ('member','worker','beneficiary','patient','child') AND coalesce(trim(NEW.payload->>'name'),'') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
 IF NEW.kind = 'stock' AND (coalesce(trim(NEW.payload->>'item'),'') = '' OR coalesce(NEW.payload->>'quantity','') !~ '^\d+(\.\d+)?$' OR (NEW.payload->>'quantity')::numeric <= 0) THEN RAISE EXCEPTION 'Stock item and quantity are required'; END IF;
 IF NEW.kind IN ('income','expense','aid') THEN
  IF coalesce(NEW.payload->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid financial date'; END IF;
  PERFORM (NEW.payload->>'date')::date;
  IF coalesce(NEW.payload->>'amount','') !~ '^\d+(\.\d+)?$' OR (NEW.payload->>'amount')::numeric <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
 END IF;
 IF NEW.kind = 'aid' THEN
  SELECT kind,deleted INTO parent_kind,parent_deleted FROM public.emel_records WHERE id = NEW.beneficiary_id FOR UPDATE;
  IF parent_kind IS DISTINCT FROM 'beneficiary' OR parent_deleted OR (NEW.payload->>'beneficiaryId') IS DISTINCT FROM NEW.beneficiary_id::text THEN RAISE EXCEPTION 'Beneficiary is missing or inactive'; END IF;
 END IF;
 IF TG_OP = 'UPDATE' AND NEW.deleted AND NOT OLD.deleted AND OLD.kind = 'beneficiary' AND EXISTS (SELECT 1 FROM public.emel_records WHERE beneficiary_id = OLD.id AND NOT deleted) THEN RAISE EXCEPTION 'Beneficiary has recorded assistance'; END IF;
 RETURN NEW;
END $$;
COMMIT;
