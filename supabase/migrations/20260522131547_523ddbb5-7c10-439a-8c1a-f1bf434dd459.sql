-- Add visibility flag: comment visible only to admins (VRCF + client admins)
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS client_admin_only boolean NOT NULL DEFAULT false;

-- Recreate SELECT policy: hide client_admin_only from regular client users (non client-admin)
DROP POLICY IF EXISTS "View comments on accessible tickets" ON public.comments;
CREATE POLICY "View comments on accessible tickets"
ON public.comments
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    is_internal = false
    AND ticket_id IN (
      SELECT t.id FROM public.tickets t
      WHERE t.client_id IN (SELECT user_client_ids(auth.uid()))
        AND (is_client_admin(auth.uid(), t.client_id) OR t.created_by = auth.uid())
    )
    AND (
      client_admin_only = false
      OR EXISTS (
        SELECT 1 FROM public.tickets t2
        WHERE t2.id = comments.ticket_id
          AND is_client_admin(auth.uid(), t2.client_id)
      )
    )
  )
);

-- Recreate INSERT policy: only VRCF admins or client admins may post client_admin_only=true
DROP POLICY IF EXISTS "Insert comments on accessible tickets" ON public.comments;
CREATE POLICY "Insert comments on accessible tickets"
ON public.comments
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      is_internal = false
      AND ticket_id IN (
        SELECT t.id FROM public.tickets t
        WHERE t.client_id IN (SELECT user_client_ids(auth.uid()))
          AND (is_client_admin(auth.uid(), t.client_id) OR t.created_by = auth.uid())
      )
      AND (
        client_admin_only = false
        OR EXISTS (
          SELECT 1 FROM public.tickets t2
          WHERE t2.id = comments.ticket_id
            AND is_client_admin(auth.uid(), t2.client_id)
        )
      )
    )
  )
);