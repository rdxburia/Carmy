-- Carmy Step 7: R2 document storage metadata
-- Existing documents remain on Supabase Storage by default.
-- New R2-backed documents explicitly use storage_backend = 'r2'.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS storage_backend text NOT NULL DEFAULT 'supabase';

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_storage_backend_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_storage_backend_check
  CHECK (storage_backend IN ('supabase', 'r2'));

CREATE INDEX IF NOT EXISTS idx_documents_storage_backend
  ON public.documents(storage_backend);

COMMENT ON COLUMN public.documents.storage_backend IS
  'Object storage backend: supabase for legacy files, r2 for new private R2 files.';
