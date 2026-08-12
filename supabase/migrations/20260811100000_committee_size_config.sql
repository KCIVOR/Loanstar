-- Item 8 Phase 1: seed admin-adjustable committee size (default 3).
-- ON CONFLICT DO NOTHING — do not overwrite if the key already exists.

INSERT INTO config_settings (key, value, description)
VALUES (
  'committee_size',
  '3'::jsonb,
  'Number of committee members required to cast a vote before a final decision can be made'
)
ON CONFLICT (key) DO NOTHING;
