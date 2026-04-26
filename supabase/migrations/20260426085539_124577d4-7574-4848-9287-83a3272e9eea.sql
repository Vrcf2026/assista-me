DROP POLICY IF EXISTS "Admins can manage ticket attachment objects" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload ticket attachment objects" ON storage.objects;
DROP POLICY IF EXISTS "Users can read ticket attachment objects" ON storage.objects;

CREATE POLICY "Admins can manage ticket attachment objects"
ON storage.objects
FOR ALL
USING (
  bucket_id = 'ticket-attachments'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'ticket-attachments'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Users can upload ticket attachment objects"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'ticket-attachments'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.tickets t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR t.client_id = public.current_user_client_id()
      )
  )
);

CREATE POLICY "Users can read ticket attachment objects"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'ticket-attachments'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.tickets t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR t.client_id = public.current_user_client_id()
      )
  )
);