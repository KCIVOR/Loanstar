CREATE TABLE public.reports_assistant_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reports_assistant_threads_title_len CHECK (char_length(title) <= 80)
);

CREATE INDEX idx_reports_assistant_threads_user_updated
  ON public.reports_assistant_threads (user_id, updated_at DESC);

COMMENT ON TABLE public.reports_assistant_threads IS
  'Per-user Report assistant chats. Each authenticated user sees only their own threads.';

ALTER TABLE public.reports_assistant_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY reports_assistant_threads_select_own ON public.reports_assistant_threads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY reports_assistant_threads_insert_own ON public.reports_assistant_threads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY reports_assistant_threads_update_own ON public.reports_assistant_threads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY reports_assistant_threads_delete_own ON public.reports_assistant_threads
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
