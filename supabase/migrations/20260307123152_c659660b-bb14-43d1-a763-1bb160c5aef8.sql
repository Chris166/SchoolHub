
-- Fix overly permissive notifications insert policy
DROP POLICY "System can insert notifications" ON public.notifications;

-- Only allow inserting notifications for teachers (when they create assignments/grades) and admins
CREATE POLICY "Teachers and admins can insert notifications" ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin')
);
