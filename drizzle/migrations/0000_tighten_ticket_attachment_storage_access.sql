-- Leitura de ficheiros do bucket ticket-attachments:
-- além de bloquear anexos internos, bloqueia também os anexos ligados a
-- comentários restritos (nota interna ou "só admin") a quem não é admin do cliente.
DROP POLICY IF EXISTS "Users can read ticket attachment objects" ON storage.objects;

CREATE POLICY "Users can read ticket attachment objects"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'ticket-attachments'
  AND auth.uid() IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.tickets t
      JOIN public.attachments a
        ON a.ticket_id = t.id
        AND a.file_url = storage.objects.name
      LEFT JOIN public.comments c ON c.id = a.comment_id
      WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
        AND a.is_internal = false
        AND t.client_id IN (SELECT public.user_client_ids(auth.uid()))
        AND (public.is_client_admin(auth.uid(), t.client_id) OR t.created_by = auth.uid())
        AND (
          c.id IS NULL
          OR (
            c.is_internal = false
            AND (c.client_admin_only = false OR public.is_client_admin(auth.uid(), t.client_id))
          )
        )
    )
  )
);

-- Escrita: garantir que apenas quem tem acesso ao ticket pode alterar/apagar
-- os seus próprios ficheiros (admins VRCF já estão cobertos por policy própria).
DROP POLICY IF EXISTS "Users can update own ticket attachment objects" ON storage.objects;
CREATE POLICY "Users can update own ticket attachment objects"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'ticket-attachments'
  AND owner = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
      AND t.client_id IN (SELECT public.user_client_ids(auth.uid()))
  )
)
WITH CHECK (
  bucket_id = 'ticket-attachments'
  AND owner = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
      AND t.client_id IN (SELECT public.user_client_ids(auth.uid()))
  )
);