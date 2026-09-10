-- Allow the Remedial role to apply interest / penalty discounts on its own
-- DCRR, the same way the Collector role can on module 'collection'.
--
-- Context: /api/collector/dcr previously gated discounts with
-- validateFieldEdit('collection','collector_discount'), which FAILS OPEN
-- (no rule -> 'edit'), so a remedial user could already push a discount via
-- a crafted request with nothing actually enforced. The route now requires an
-- EXPLICIT `edit` field rule on the caller's own module. This migration seeds
-- that rule for Remedial so the (newly added) remedial DCRR discount UI works
-- and the gate is real.
--
-- Mirrors the existing Collector seed: role_field_rules row for role 'Remedial'
-- on module 'remedial' with {"collector_discount": "edit"}.

INSERT INTO public.role_field_rules (role_id, module_id, field_rules)
SELECT r.id, m.id, '{"collector_discount": "edit"}'::jsonb
FROM public.roles r
CROSS JOIN public.modules m
WHERE r.name = 'Remedial'
  AND m.slug = 'remedial'
ON CONFLICT (role_id, module_id)
DO UPDATE SET
  field_rules = public.role_field_rules.field_rules
                || '{"collector_discount": "edit"}'::jsonb,
  updated_at = now();
