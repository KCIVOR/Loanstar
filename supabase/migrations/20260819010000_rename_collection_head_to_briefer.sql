-- Rename the "Collection Head" role's display name to "Briefer" (product
-- decision — the role's actual job is checking off pre-release borrower
-- briefings, not running Collection). Slug ('collection_head'), module
-- slug ('briefings'), and the seed login email (collection_head@loanstar.local)
-- are left unchanged — they're internal identifiers, not what the request
-- asked to rename, and changing the email would break the existing seed
-- login credential.

UPDATE public.roles
SET name = 'Briefer'
WHERE slug = 'collection_head';

UPDATE public.profiles
SET full_name = 'Briefer (Seed)'
WHERE email = 'collection_head@loanstar.local';
