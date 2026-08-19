INSERT INTO public.role_module_permissions (
  role_id, module_id, can_view, can_create, can_edit, can_delete, can_execute_trigger
)
SELECT r.id, m.id, true, false, false, false, false
FROM public.roles r
CROSS JOIN public.modules m
WHERE r.slug = 'committee' AND m.slug = 'reports'
ON CONFLICT (role_id, module_id) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  can_execute_trigger = EXCLUDED.can_execute_trigger;
