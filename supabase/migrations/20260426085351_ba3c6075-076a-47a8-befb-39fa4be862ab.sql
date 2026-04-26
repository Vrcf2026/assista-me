DROP POLICY IF EXISTS "Public can view satisfaction by token" ON public.ticket_satisfaction;
DROP POLICY IF EXISTS "Public can submit satisfaction by token" ON public.ticket_satisfaction;

DROP POLICY IF EXISTS "Admins manage satisfaction" ON public.ticket_satisfaction;
CREATE POLICY "Admins manage satisfaction"
ON public.ticket_satisfaction
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));