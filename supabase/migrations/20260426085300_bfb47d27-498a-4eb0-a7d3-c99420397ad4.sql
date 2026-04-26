-- Backfill missing profiles for existing authenticated users
INSERT INTO public.profiles (user_id, email, nome)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'nome', u.email)
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = u.id
  );

-- Ensure the configured VRCF admin account has the admin role when the account exists
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE u.email = 'vrcf.loja@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = u.id AND ur.role = 'admin'::public.app_role
  );

-- Allow satisfaction links to be opened publicly by token.
-- The token is a high-entropy secret embedded in the email link.
DROP POLICY IF EXISTS "Public can view satisfaction by token" ON public.ticket_satisfaction;
CREATE POLICY "Public can view satisfaction by token"
ON public.ticket_satisfaction
FOR SELECT
USING (token IS NOT NULL);

-- Allow one public submission for an unanswered satisfaction link.
DROP POLICY IF EXISTS "Public can submit satisfaction by token" ON public.ticket_satisfaction;
CREATE POLICY "Public can submit satisfaction by token"
ON public.ticket_satisfaction
FOR UPDATE
USING (token IS NOT NULL AND submitted_at IS NULL)
WITH CHECK (token IS NOT NULL AND submitted_at IS NOT NULL AND rating BETWEEN 1 AND 5);