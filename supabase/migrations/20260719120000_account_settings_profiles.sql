-- Phase 1: Account Settings foundation on profiles
-- Adds phone / avatar_url / preferences; allows self-update RLS;
-- protects is_active + email from non-admin changes.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.phone IS
  'Account-level contact phone (not borrowers.mobile_phone KYC).';
COMMENT ON COLUMN public.profiles.avatar_url IS
  'Public URL for account avatar (avatars bucket; Phase 3).';
COMMENT ON COLUMN public.profiles.preferences IS
  'Account preferences JSON (timezone/locale/notifications). Channel email/sms keys persist from Phase 6 only.';

-- Self-update + existing admin path
DROP POLICY IF EXISTS profiles_update ON public.profiles;

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR public.is_super_admin()
    OR public.has_module_permission('auth_admin', 'edit')
  )
  WITH CHECK (
    id = auth.uid()
    OR public.is_super_admin()
    OR public.has_module_permission('auth_admin', 'edit')
  );

CREATE OR REPLACE FUNCTION public.profiles_protect_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    IF auth.uid() IS NULL
       OR public.is_super_admin()
       OR public.has_module_permission('auth_admin', 'edit') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'profiles.is_active and profiles.email can only be changed by admin'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_sensitive_columns ON public.profiles;

CREATE TRIGGER profiles_protect_sensitive_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_protect_sensitive_columns();
