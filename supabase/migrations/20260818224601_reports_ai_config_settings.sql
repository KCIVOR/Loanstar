-- Reports assistant (OpenAI). Superadmin Config UI in later phases.
-- API key stored plaintext in JSONB (same as smtp_password / twilio_auth_token).

INSERT INTO public.config_settings (key, value, description) VALUES
  ('reports_ai_enabled', 'false'::jsonb, 'Enable the Reports assistant (OpenAI tool-calling). Off until an API key is saved.'),
  ('reports_ai_api_key', '""'::jsonb, 'OpenAI API key (masked on GET)'),
  ('reports_ai_model', '"gpt-4o-mini"'::jsonb, 'OpenAI Chat Completions model id')
ON CONFLICT (key) DO NOTHING;
