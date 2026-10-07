CREATE TABLE public.bug_report_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.bug_reports(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bug_report_images_report_idx ON public.bug_report_images (report_id);

ALTER TABLE public.bug_report_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY bug_report_images_select ON public.bug_report_images FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bug_reports report WHERE report.id = report_id
  ));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bug-report-images', 'bug-report-images', false, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Uploads and signed URL creation run only in authenticated server routes.
-- No direct storage.objects policy is granted to browser clients.
