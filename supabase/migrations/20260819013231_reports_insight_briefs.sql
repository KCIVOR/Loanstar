CREATE TABLE public.reports_insight_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_from date NOT NULL,
  period_to date NOT NULL,
  months integer NOT NULL DEFAULT 6,
  model text NOT NULL,
  evidence jsonb NOT NULL,
  brief jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_insight_briefs_period
  ON public.reports_insight_briefs (period_from, period_to, created_at DESC);

CREATE INDEX idx_reports_insight_briefs_created
  ON public.reports_insight_briefs (created_at DESC);

COMMENT ON TABLE public.reports_insight_briefs IS
  'Generated AI executive briefs. Unlike assistant threads these are a company artifact, not private to one user: anyone who can view Reports can read them. Writes go through the service role from the API route.';

ALTER TABLE public.reports_insight_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_insight_briefs_select ON public.reports_insight_briefs
  FOR SELECT TO authenticated
  USING (is_super_admin() OR has_module_permission('reports', 'view'));
