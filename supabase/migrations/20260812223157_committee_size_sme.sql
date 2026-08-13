UPDATE public.config_settings
SET description = 'Number of committee members required to cast a vote before a final decision can be made (Seafarer)'
WHERE key = 'committee_size';

INSERT INTO public.config_settings (key, value, description)
VALUES (
  'committee_size_sme',
  '1'::jsonb,
  'Number of committee members required to cast a vote before a final decision can be made (SME)'
)
ON CONFLICT (key) DO NOTHING;
