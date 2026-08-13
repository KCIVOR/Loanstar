INSERT INTO public.modules (slug, name, description, sort_order)
VALUES ('briefings', 'Briefings', 'Pre-release borrower briefing sign-off', 16);

INSERT INTO public.roles (slug, name, description, is_system)
VALUES ('collection_head', 'Collection Head', 'Pre-release briefing sign-off, separate from Collector', true);

WITH role_map AS (SELECT id, slug FROM public.roles),
     module_map AS (SELECT id, slug FROM public.modules)
INSERT INTO public.role_module_permissions (role_id, module_id, can_view, can_create, can_edit, can_delete, can_execute_trigger)
SELECT r.id, m.id, p.can_view, p.can_create, p.can_edit, p.can_delete, p.can_execute_trigger
FROM (VALUES
  ('super_admin', 'briefings', true, true, true, true, true),
  ('collection_head', 'briefings', true, false, false, false, true)
) AS p(role_slug, module_slug, can_view, can_create, can_edit, can_delete, can_execute_trigger)
JOIN role_map r ON r.slug = p.role_slug
JOIN module_map m ON m.slug = p.module_slug;

-- Item 11: Collector no longer acknowledges briefings.
UPDATE public.role_module_permissions rmp
SET can_execute_trigger = false
FROM public.roles r, public.modules m
WHERE rmp.role_id = r.id AND rmp.module_id = m.id
  AND r.slug = 'collector' AND m.slug = 'collection';
