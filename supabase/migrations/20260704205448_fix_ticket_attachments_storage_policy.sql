-- =========================================================
-- FIX: políticas de storage.objects do bucket "ticket-attachments"
-- ainda usavam current_user_client_id() (modelo antigo: 1 cliente
-- por utilizador via clients.user_id). Desde a migração
-- 20260427113957 o acesso de clientes passou a ser multi-tenant via
-- client_users + is_client_admin()/user_client_ids(), e as políticas
-- da tabela public.attachments já foram atualizadas nessa altura —
-- mas as políticas do bucket de storage (o ficheiro em si) ficaram
-- para trás, criando uma inconsistência entre "quem vê a linha do
-- anexo" e "quem consegue descarregar o ficheiro real".
--
-- Esta migração alinha as políticas de storage.objects com a mesma
-- condição usada em "View attachments on accessible tickets" /
-- "Insert attachments on accessible tickets": só o admin VRCF, o
-- admin do cliente, ou quem criou o ticket, e apenas quando o anexo
-- não é interno (is_internal = false).
-- =========================================================

DROP POLICY IF EXISTS "Admins can manage ticket attachment objects" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload ticket attachment objects" ON storage.objects;
DROP POLICY IF EXISTS "Users can read ticket attachment objects" ON storage.objects;

-- Admin VRCF: acesso total, sem alterações.
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

-- Upload: o cliente só pode subir ficheiros para tickets do(s)
-- cliente(s) a que pertence, sendo admin desse cliente ou o criador
-- do ticket. (A linha em public.attachments com is_internal=false é
-- garantida separadamente pela policy de INSERT dessa tabela.)
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
        OR (
          t.client_id IN (SELECT public.user_client_ids(auth.uid()))
          AND (public.is_client_admin(auth.uid(), t.client_id) OR t.created_by = auth.uid())
        )
      )
  )
);

-- Leitura/download: replica exatamente a condição de
-- "View attachments on accessible tickets", incluindo o bloqueio de
-- anexos internos (is_internal = true) a clientes. Faz join à linha
-- de public.attachments pelo file_url (que é gravado com o mesmo
-- valor do "name" do objeto em storage — ver openAttachment() em
-- tickets.$id.tsx) para poder verificar is_internal.
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
      WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
        AND a.is_internal = false
        AND t.client_id IN (SELECT public.user_client_ids(auth.uid()))
        AND (public.is_client_admin(auth.uid(), t.client_id) OR t.created_by = auth.uid())
    )
  )
);
