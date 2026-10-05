-- CarCare Cloud document management migration
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS document_name text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS document_expiry date;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS archive_name text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
UPDATE public.documents SET active=true WHERE active IS NULL;
ALTER TABLE public.documents ALTER COLUMN active SET DEFAULT true;
NOTIFY pgrst, 'reload schema';