-- Google SMTP / transactional email (Superadmin Config UI).
-- Secrets stored plaintext in JSONB (same as twilio_auth_token).

INSERT INTO public.config_settings (key, value, description) VALUES
  ('email_enabled', 'false'::jsonb, 'Enable transactional email via SMTP'),
  ('smtp_host', '"smtp.gmail.com"'::jsonb, 'SMTP hostname'),
  ('smtp_port', '587'::jsonb, 'SMTP port (587 STARTTLS or 465 SSL)'),
  ('smtp_secure', 'false'::jsonb, 'true = TLS/SSL on connect (use with port 465)'),
  ('smtp_user', '""'::jsonb, 'SMTP username (Gmail address)'),
  ('smtp_password', '""'::jsonb, 'SMTP password / Gmail App Password (masked on GET)'),
  ('smtp_from', '""'::jsonb, 'From header, e.g. LoanStar <you@gmail.com>')
ON CONFLICT (key) DO NOTHING;
