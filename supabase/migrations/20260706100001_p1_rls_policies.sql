-- Phase 1: RLS policies (deny-first, permission-driven)

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_module_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_field_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_check_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Fix module slug helper
CREATE OR REPLACE FUNCTION public.get_user_module_slugs(p_user_id uuid DEFAULT auth.uid())
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_super_admin(p_user_id) THEN
    RETURN ARRAY(SELECT slug FROM public.modules ORDER BY sort_order);
  END IF;

  RETURN ARRAY(
    SELECT DISTINCT m.slug
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id AND r.is_active = true
    JOIN public.role_module_permissions rmp ON rmp.role_id = r.id
    JOIN public.modules m ON m.id = rmp.module_id
    WHERE ur.user_id = p_user_id
      AND rmp.can_view = true
    ORDER BY 1
  );
END;
$$;

-- modules: view if user has any permission on module or super admin
CREATE POLICY modules_select ON public.modules
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission(slug, 'view'));

CREATE POLICY modules_admin ON public.modules
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- roles
CREATE POLICY roles_select ON public.roles
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('auth_admin', 'view'));

CREATE POLICY roles_write ON public.roles
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('auth_admin', 'edit'))
  WITH CHECK (public.is_super_admin() OR public.has_module_permission('auth_admin', 'edit'));

-- role_module_permissions
CREATE POLICY rmp_select ON public.role_module_permissions
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('auth_admin', 'view'));

CREATE POLICY rmp_write ON public.role_module_permissions
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('auth_admin', 'edit'))
  WITH CHECK (public.is_super_admin() OR public.has_module_permission('auth_admin', 'edit'));

-- role_field_rules
CREATE POLICY rfr_select ON public.role_field_rules
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('auth_admin', 'view'));

CREATE POLICY rfr_write ON public.role_field_rules
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('auth_admin', 'edit'))
  WITH CHECK (public.is_super_admin() OR public.has_module_permission('auth_admin', 'edit'));

-- profiles
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin() OR public.has_module_permission('auth_admin', 'view'));

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('auth_admin', 'edit'))
  WITH CHECK (public.is_super_admin() OR public.has_module_permission('auth_admin', 'edit'));

-- user_roles
CREATE POLICY user_roles_select ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin() OR public.has_module_permission('auth_admin', 'view'));

CREATE POLICY user_roles_write ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('auth_admin', 'edit'))
  WITH CHECK (public.is_super_admin() OR public.has_module_permission('auth_admin', 'edit'));

-- audit_events: insert via service; select for audit_log module
CREATE POLICY audit_select ON public.audit_events
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('audit_log', 'view'));

CREATE POLICY audit_insert ON public.audit_events
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR public.is_super_admin());

-- config + system_config module
CREATE POLICY config_select ON public.config_settings
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'view'));

CREATE POLICY config_write ON public.config_settings
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'))
  WITH CHECK (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'));

-- document_types / stage_checklists (admin via system_config)
CREATE POLICY document_types_select ON public.document_types
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'view'));

CREATE POLICY document_types_write ON public.document_types
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'))
  WITH CHECK (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'));

CREATE POLICY stage_checklists_select ON public.stage_checklists
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'view'));

CREATE POLICY stage_checklists_write ON public.stage_checklists
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'))
  WITH CHECK (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'));

-- check_types / stage_check_mapping
CREATE POLICY check_types_select ON public.check_types
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'view'));

CREATE POLICY check_types_write ON public.check_types
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'))
  WITH CHECK (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'));

CREATE POLICY stage_check_mapping_select ON public.stage_check_mapping
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'view'));

CREATE POLICY stage_check_mapping_write ON public.stage_check_mapping
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'))
  WITH CHECK (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'));

-- loan_types
CREATE POLICY loan_types_select ON public.loan_types
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'view'));

CREATE POLICY loan_types_write ON public.loan_types
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'))
  WITH CHECK (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'));

-- email_templates
CREATE POLICY email_templates_select ON public.email_templates
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'view'));

CREATE POLICY email_templates_write ON public.email_templates
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'))
  WITH CHECK (public.is_super_admin() OR public.has_module_permission('system_config', 'edit'));
