CREATE TABLE public.bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 160),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 5000),
  expected_behavior text NOT NULL CHECK (length(trim(expected_behavior)) BETWEEN 3 AND 5000),
  location text NOT NULL CHECK (length(trim(location)) BETWEEN 2 AND 200),
  error_message text CHECK (error_message IS NULL OR length(error_message) <= 3000),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  resolution_note text CHECK (resolution_note IS NULL OR length(resolution_note) <= 3000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bug_reports_reporter_created_idx ON public.bug_reports (reporter_id, created_at DESC);
CREATE INDEX bug_reports_status_created_idx ON public.bug_reports (status, created_at DESC);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY bug_reports_select ON public.bug_reports FOR SELECT TO authenticated
  USING (reporter_id = (select auth.uid()) OR public.is_super_admin());

CREATE POLICY bug_reports_insert ON public.bug_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (select auth.uid()) AND status = 'open' AND resolution_note IS NULL);

CREATE POLICY bug_reports_update_admin ON public.bug_reports FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.bug_reports_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER bug_reports_updated_at BEFORE UPDATE ON public.bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.bug_reports_set_updated_at();
