
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_credentials_on_ticket_close() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_ticket_credentials(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_password(text, text) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Authenticated read ticket attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload ticket attachments" ON storage.objects;

DROP POLICY IF EXISTS "Public read preventiva fotos" ON storage.objects;

CREATE POLICY "Admin read preventiva fotos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'preventiva-fotos'
  AND auth.uid() IS NOT NULL
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);
