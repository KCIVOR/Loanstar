-- Phase 1 of the Collector Discount in DCRR feature. See
-- docs/revision-plans/feature-collector-discount-implementation-plan.md.
--
-- Gates the entire feature behind one explicit field-rule: only the
-- Collector role gets "edit" on the "collector_discount" field key, in the
-- "collection" module. No other role gets a row added — confirmed by audit
-- that only Collector and Super Admin currently have collection-module edit
-- access at all, and Super Admin bypasses field rules entirely via
-- is_super_admin(). Adding deny rows for roles with no module-level edit
-- access to "collection" would be a no-op.
--
-- IMPORTANT — fail-open behavior, confirmed by reading get_field_rule()
-- directly: `RETURN COALESCE(v_rule, 'edit')`. When no role_field_rules row
-- exists for a given (role, module, field) combination, the system defaults
-- to ALLOWING the edit, not denying it. This means: if `collection` module
-- edit is ever granted to a new role in the future (e.g. Remedial, or a
-- future "Collection Supervisor" role), that role silently inherits
-- `collector_discount: edit` by default, unless an explicit 'deny' row is
-- added for it at that time. This is not a bug in this migration — it is
-- how every field rule in this system already works — but it is exactly
-- the kind of thing a future engineer granting a new role's module
-- permissions should know to check for. Documenting it here so it isn't
-- rediscovered the hard way.

insert into role_field_rules (role_id, module_id, field_rules)
select r.id, m.id, jsonb_build_object('collector_discount', 'edit')
from roles r, modules m
where r.name = 'Collector'
  and m.slug = 'collection'
on conflict (role_id, module_id)
do update set field_rules = role_field_rules.field_rules || excluded.field_rules;
