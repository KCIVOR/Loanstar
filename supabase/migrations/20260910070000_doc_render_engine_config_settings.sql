-- Document renderer (Gotenberg / headless Chromium) — admin-editable connection.
-- Mirrors the reports_ai_* / smtp_* / twilio_* pattern: values live in
-- config_settings JSONB, the /admin/config route masks the password on GET.
-- Until doc_render_engine is set to 'chromium' AND a URL is saved, the renderer
-- keeps using the in-process pdfmake engine (unchanged behaviour).

INSERT INTO public.config_settings (key, value, description) VALUES
  ('doc_render_engine', '"pdfmake"'::jsonb, 'Document PDF engine: "pdfmake" (in-process, default) or "chromium" (Gotenberg service). Overrides the DOC_RENDER_ENGINE env var when set.'),
  ('gotenberg_url', '""'::jsonb, 'Base URL of the Gotenberg service, no trailing slash (e.g. https://loanstar-gotenberg-xxxx.asia-southeast1.run.app). Falls back to the GOTENBERG_URL env var when blank.'),
  ('gotenberg_basic_auth_user', '""'::jsonb, 'Gotenberg basic-auth username. Falls back to GOTENBERG_BASIC_AUTH_USER when blank.'),
  ('gotenberg_basic_auth_pass', '""'::jsonb, 'Gotenberg basic-auth password (masked on GET). Falls back to GOTENBERG_BASIC_AUTH_PASS when blank.')
ON CONFLICT (key) DO NOTHING;
