-- Phase 1: Foundation schema — RBAC, audit, configuration

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Core RBAC tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.role_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_execute_trigger boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, module_id)
);

CREATE TABLE public.role_field_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  field_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, module_id)
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id),
  UNIQUE (user_id, role_id)
);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id),
  actor_role_id uuid REFERENCES public.roles(id),
  module_slug text NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$;

CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_mutation();

-- ---------------------------------------------------------------------------
-- Configuration tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.config_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE TABLE public.document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  template_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stage_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL,
  document_type_id uuid NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
  is_required boolean NOT NULL DEFAULT true,
  is_optional_flag boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage, document_type_id)
);

CREATE TABLE public.check_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stage_check_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL,
  check_type_id uuid NOT NULL REFERENCES public.check_types(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage, check_type_id)
);

CREATE TABLE public.loan_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  interest_rate numeric(8, 6) NOT NULL,
  pf_rate numeric(8, 6) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  enrolled_by uuid REFERENCES auth.users(id),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loan_types_pf_rate_g2 CHECK (NOT is_active OR pf_rate >= 0.065)
);

CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_role_module_permissions_role ON public.role_module_permissions(role_id);
CREATE INDEX idx_audit_events_created_at ON public.audit_events(created_at DESC);
CREATE INDEX idx_loan_types_active ON public.loan_types(is_active, effective_from DESC);

-- ---------------------------------------------------------------------------
-- Auth trigger: create profile on signup
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RBAC helper functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND r.slug = 'super_admin'
      AND r.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.has_module_permission(
  p_module_slug text,
  p_permission text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF public.is_super_admin(p_user_id) THEN
    RETURN true;
  END IF;

  SELECT CASE p_permission
    WHEN 'view' THEN bool_or(rmp.can_view)
    WHEN 'create' THEN bool_or(rmp.can_create)
    WHEN 'edit' THEN bool_or(rmp.can_edit)
    WHEN 'delete' THEN bool_or(rmp.can_delete)
    WHEN 'execute_trigger' THEN bool_or(rmp.can_execute_trigger)
    ELSE false
  END
  INTO v_allowed
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id AND r.is_active = true
  JOIN public.role_module_permissions rmp ON rmp.role_id = r.id
  JOIN public.modules m ON m.id = rmp.module_id
  WHERE ur.user_id = p_user_id
    AND m.slug = p_module_slug;

  RETURN COALESCE(v_allowed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_module_slugs(p_user_id uuid DEFAULT auth.uid())
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT m.slug ORDER BY m.slug), ARRAY[]::text[])
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id AND r.is_active = true
  JOIN public.role_module_permissions rmp ON rmp.role_id = r.id
  JOIN public.modules m ON m.id = rmp.module_id
  WHERE ur.user_id = p_user_id
    AND rmp.can_view = true
  UNION
  SELECT ARRAY(
    SELECT m.slug
    FROM public.modules m
    WHERE public.is_super_admin(p_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_field_rule(
  p_module_slug text,
  p_field_key text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule text;
BEGIN
  IF public.is_super_admin(p_user_id) THEN
    RETURN 'edit';
  END IF;

  SELECT rfr.field_rules ->> p_field_key
  INTO v_rule
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id AND r.is_active = true
  JOIN public.role_field_rules rfr ON rfr.role_id = r.id
  JOIN public.modules m ON m.id = rfr.module_id
  WHERE ur.user_id = p_user_id
    AND m.slug = p_module_slug
    AND rfr.field_rules ? p_field_key
  ORDER BY CASE v_rule
    WHEN 'deny' THEN 1
    WHEN 'read_only' THEN 2
    WHEN 'edit' THEN 3
    ELSE 4
  END
  LIMIT 1;

  RETURN COALESCE(v_rule, 'edit');
END;
$$;

-- ---------------------------------------------------------------------------
-- Updated_at trigger for roles
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER role_field_rules_updated_at
  BEFORE UPDATE ON public.role_field_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
