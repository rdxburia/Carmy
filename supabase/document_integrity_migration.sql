-- CarCare Cloud: Step 2 document integrity
-- Run this AFTER checking for existing duplicate active RC/PUC/Insurance rows.
-- The unique partial index prevents more than one active document of each
-- compliance type per vehicle while allowing unlimited archived history.

SELECT car_id, document_type, count(*) AS active_count
FROM public.documents
WHERE active = true
  AND archived_at IS NULL
  AND document_type IN ('rc','puc','insurance')
GROUP BY car_id, document_type
HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS documents_one_active_compliance_doc
ON public.documents (car_id, document_type)
WHERE active = true
  AND archived_at IS NULL
  AND document_type IN ('rc','puc','insurance');

CREATE INDEX IF NOT EXISTS documents_car_type_active_idx
ON public.documents (car_id, document_type, active, archived_at);

NOTIFY pgrst, 'reload schema';
