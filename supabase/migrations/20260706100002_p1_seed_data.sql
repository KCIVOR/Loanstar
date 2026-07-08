-- Phase 1: Seed modules, roles, permissions, config, loan types, checks

INSERT INTO public.modules (slug, name, description, sort_order) VALUES
  ('auth_admin', 'Auth & Admin', 'User and role management', 1),
  ('borrower_portal', 'Borrower Portal', 'Borrower self-service', 2),
  ('leads', 'Leads', 'Agent lead management', 3),
  ('intake', 'Intake', 'CSA application intake', 4),
  ('computation', 'Computation', 'Loan computation engine', 5),
  ('verification', 'Verification', 'CIG verification', 6),
  ('committee', 'Committee', 'Committee decisions', 7),
  ('negotiation', 'Negotiation', 'Term negotiation', 8),
  ('release_lra', 'Release (LRA)', 'LRA documentation and release', 9),
  ('accounting_ar', 'Accounting (AR)', 'AR posting and masterlist', 10),
  ('collection', 'Collection', 'Collector workspace', 11),
  ('remedial', 'Remedial', 'Remedial / paralegal', 12),
  ('reports', 'Reports', 'Management reports', 13),
  ('system_config', 'System Config', 'System configuration', 14),
  ('audit_log', 'Audit Log', 'Audit event log', 15);

INSERT INTO public.roles (slug, name, description, is_system) VALUES
  ('super_admin', 'Super Admin', 'Full system access', true),
  ('borrower', 'Borrower', 'Borrower portal access', true),
  ('agent', 'Agent', 'Agent lead entry', true),
  ('csa', 'CSA', 'Customer service associate intake', true),
  ('cig', 'CIG', 'Credit investigation group', true),
  ('committee', 'Committee', 'Loan committee member', true),
  ('lra', 'LRA', 'Loan release associate', true),
  ('ar', 'AR', 'Accounting / AR', true),
  ('collector', 'Collector', 'Collection staff', true),
  ('remedial', 'Remedial', 'Remedial / paralegal staff', true);

-- Default module permissions per role
WITH role_map AS (
  SELECT id, slug FROM public.roles
), module_map AS (
  SELECT id, slug FROM public.modules
)
INSERT INTO public.role_module_permissions (role_id, module_id, can_view, can_create, can_edit, can_delete, can_execute_trigger)
SELECT r.id, m.id, p.can_view, p.can_create, p.can_edit, p.can_delete, p.can_execute_trigger
FROM (VALUES
  ('super_admin', 'auth_admin', true, true, true, true, true),
  ('super_admin', 'borrower_portal', true, true, true, true, true),
  ('super_admin', 'leads', true, true, true, true, true),
  ('super_admin', 'intake', true, true, true, true, true),
  ('super_admin', 'computation', true, true, true, true, true),
  ('super_admin', 'verification', true, true, true, true, true),
  ('super_admin', 'committee', true, true, true, true, true),
  ('super_admin', 'negotiation', true, true, true, true, true),
  ('super_admin', 'release_lra', true, true, true, true, true),
  ('super_admin', 'accounting_ar', true, true, true, true, true),
  ('super_admin', 'collection', true, true, true, true, true),
  ('super_admin', 'remedial', true, true, true, true, true),
  ('super_admin', 'reports', true, true, true, true, true),
  ('super_admin', 'system_config', true, true, true, true, true),
  ('super_admin', 'audit_log', true, true, true, true, true),
  ('borrower', 'borrower_portal', true, true, true, false, false),
  ('agent', 'leads', true, true, true, false, false),
  ('csa', 'intake', true, true, true, false, true),
  ('csa', 'computation', true, true, true, false, true),
  ('csa', 'negotiation', true, true, true, false, true),
  ('cig', 'verification', true, true, true, false, true),
  ('cig', 'intake', true, false, true, false, false),
  ('cig', 'computation', true, false, false, false, false),
  ('committee', 'committee', true, true, true, false, true),
  ('committee', 'negotiation', true, true, true, false, true),
  ('lra', 'release_lra', true, true, true, false, true),
  ('ar', 'accounting_ar', true, true, true, false, true),
  ('ar', 'reports', true, false, false, false, false),
  ('collector', 'collection', true, true, true, false, true),
  ('remedial', 'remedial', true, true, true, false, true)
) AS p(role_slug, module_slug, can_view, can_create, can_edit, can_delete, can_execute_trigger)
JOIN role_map r ON r.slug = p.role_slug
JOIN module_map m ON m.slug = p.module_slug;

-- CIG field rules demo: computation read_only
INSERT INTO public.role_field_rules (role_id, module_id, field_rules)
SELECT r.id, m.id, '{"borrower_info": "edit", "computation": "read_only"}'::jsonb
FROM public.roles r
CROSS JOIN public.modules m
WHERE r.slug = 'cig' AND m.slug = 'verification';

-- Config settings
INSERT INTO public.config_settings (key, value, description) VALUES
  ('penalty_rate', '0.05'::jsonb, 'Maximum penalty rate per month (5%)'),
  ('coverage_ratio', '0.35'::jsonb, 'Coverage ratio threshold (35%)'),
  ('aging_thresholds', '{"30": 30, "60": 60, "90": 90}'::jsonb, 'Aging bucket day thresholds');

-- Check types
INSERT INTO public.check_types (slug, name, description) VALUES
  ('ncl', 'NCL', 'CSA NCL check'),
  ('nfis', 'NFIS', 'NFIS verification'),
  ('mf', 'Masterfile', 'Masterfile check'),
  ('lslg_denied_cancelled', 'LSLG Denied/Cancelled', 'LSLG denied or cancelled check'),
  ('poea', 'POEA', 'POEA verification'),
  ('marina', 'Marina', 'Marina verification');

INSERT INTO public.stage_check_mapping (stage, check_type_id, sort_order)
SELECT 'csa', id, 1 FROM public.check_types WHERE slug = 'ncl'
UNION ALL
SELECT 'cig', id, 1 FROM public.check_types WHERE slug = 'nfis'
UNION ALL
SELECT 'cig', id, 2 FROM public.check_types WHERE slug = 'mf'
UNION ALL
SELECT 'cig', id, 3 FROM public.check_types WHERE slug = 'lslg_denied_cancelled'
UNION ALL
SELECT 'cig', id, 4 FROM public.check_types WHERE slug = 'poea'
UNION ALL
SELECT 'cig', id, 5 FROM public.check_types WHERE slug = 'marina';

-- Active loan types (22)
INSERT INTO public.loan_types (name, interest_rate, pf_rate, is_active, effective_from) VALUES
  ('REGULAR', 0.0275, 0.1134, true, '2026-07-01'),
  ('LOYALTY', 0.0225, 0.1134, true, '2026-07-01'),
  ('DIRECT', 0.0199, 0.10, true, '2026-07-01'),
  ('REGULAR - PROMO', 0.025, 0.1134, true, '2026-07-01'),
  ('PROMO', 0.0175, 0.08, true, '2026-07-01'),
  ('PRA', 0.015, 0.07, true, '2026-07-01'),
  ('OFFICER', 0.0199, 0.1134, true, '2026-07-01'),
  ('ESTRADA', 0.0275, 0.1134, true, '2026-07-01'),
  ('FRESH NNO BRONZE', 0.0225, 0.1134, true, '2026-07-01'),
  ('RELOAN NNO SILVER', 0.02, 0.1134, true, '2026-07-01'),
  ('RELOAN NNO GOLD', 0.0175, 0.1134, true, '2026-07-01'),
  ('RELOAN NNO PLATINUM', 0.015, 0.1134, true, '2026-07-01'),
  ('FRESH NOF BRONZE', 0.0199, 0.1134, true, '2026-07-01'),
  ('RELOAN NOF SILVER', 0.0175, 0.1134, true, '2026-07-01'),
  ('RELOAN NOF GOLD', 0.015, 0.1134, true, '2026-07-01'),
  ('RELOAN NOF PLATINUM', 0.0125, 0.1134, true, '2026-07-01'),
  ('RELOAN ONO SILVER', 0.021, 0.1134, true, '2026-07-01'),
  ('RELOAN ONO GOLD', 0.0199, 0.1134, true, '2026-07-01'),
  ('RELOAN ONO PLATINUM', 0.0175, 0.1134, true, '2026-07-01'),
  ('RELOAN OOF SILVER', 0.0175, 0.1134, true, '2026-07-01'),
  ('RELOAN OOF GOLD', 0.015, 0.1134, true, '2026-07-01'),
  ('RELOAN OOF PLATINUM', 0.0125, 0.1134, true, '2026-07-01');

-- Inactive loan types (11) — historical only
INSERT INTO public.loan_types (name, interest_rate, pf_rate, is_active, effective_from) VALUES
  ('INTERMARINE', 0.0175, 0.09, false, '2020-01-01'),
  ('INTERMARINE 1.99', 0.0199, 0.1134, false, '2020-01-01'),
  ('INTERMARINE NEW', 0.0225, 0.10, false, '2020-01-01'),
  ('MICHAELMAR', 0.0175, 0.09, false, '2020-01-01'),
  ('MICHAELMAR - RELOAN', 0.015, 0.09, false, '2020-01-01'),
  ('MILMAR', 0.015, 0.09, false, '2020-01-01'),
  ('MM', 0.04, 0.04, false, '2020-01-01'),
  ('SALARY - INTERMARINE', 0.015, 0.08, false, '2020-01-01'),
  ('SALARY - MICHAELMAR', 0.015, 0.08, false, '2020-01-01'),
  ('SME - SPECTRUM', 0.0225, 0.06, false, '2020-01-01'),
  ('TECHNOMAR/SPECTRUM', 0.0175, 0.09, false, '2020-01-01');

-- Email test template
INSERT INTO public.email_templates (slug, name, subject, body_html) VALUES
  (
    'test',
    'Test Email',
    'LoanStar Test Email',
    '<p>This is a test email from LoanStar LMS.</p>'
  );
