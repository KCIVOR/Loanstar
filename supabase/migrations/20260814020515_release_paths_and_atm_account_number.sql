ALTER TABLE public.release_files
  ADD COLUMN release_paths text[] NOT NULL DEFAULT '{}',
  ADD COLUMN atm_account_number text;

UPDATE public.release_files
SET release_paths = ARRAY[release_path]
WHERE release_path IS NOT NULL;

ALTER TABLE public.release_files
  ADD CONSTRAINT release_paths_valid_values
  CHECK (release_paths <@ ARRAY['with_pdc', 'without_pdc']::text[]);

ALTER TABLE public.masterlist
  ADD COLUMN release_paths text[] NOT NULL DEFAULT '{}',
  ADD COLUMN atm_account_number text;

UPDATE public.masterlist
SET release_paths = ARRAY[release_path]
WHERE release_path IS NOT NULL;

ALTER TABLE public.masterlist
  ADD CONSTRAINT release_paths_valid_values
  CHECK (release_paths <@ ARRAY['with_pdc', 'without_pdc']::text[]);
