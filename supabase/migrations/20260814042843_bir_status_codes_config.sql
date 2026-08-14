INSERT INTO public.config_settings (key, value, description)
VALUES (
  'bir_status_codes',
  '{}'::jsonb,
  'Classification codes -> display labels for AR master list account tagging'
)
ON CONFLICT (key) DO NOTHING;
