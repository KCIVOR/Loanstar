"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { shouldReloadPermissions } from "@/lib/permissions/auth-events";
import { checkModulePermission } from "@/lib/permissions/check";
import { createClient } from "@/lib/supabase/client";
import type {
  ModuleSlug,
  PermissionAction,
  SelfPermissions,
} from "@/lib/permissions/types";

type PermissionsContextValue = {
  permissions: SelfPermissions | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  can: (moduleSlug: ModuleSlug, action: PermissionAction) => boolean;
  isSuperAdmin: boolean;
};

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

async function fetchSelfPermissions(): Promise<SelfPermissions> {
  const response = await fetch("/api/permissions/me", { credentials: "include" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as SelfPermissions;
}

/** Fetches the current user's permissions (and profile) and shares it via
 * context — every portal layout remounts on navigation, so without this each
 * Sidebar/Header instance would independently re-fetch.
 *
 * Reloads on real auth identity changes (sign-in, sign-out, user switch).
 * Ignores Supabase tab-focus recovery events that re-emit SIGNED_IN /
 * TOKEN_REFRESHED for the same user — those were causing Alt+Tab "reloads". */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [permissions, setPermissions] = useState<SelfPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function loadForSession(hasSession: boolean) {
      if (!hasSession) {
        if (cancelled) return;
        userIdRef.current = null;
        setPermissions(null);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await fetchSelfPermissions();
        if (cancelled) return;
        userIdRef.current = data.userId ?? null;
        setPermissions(data);
      } catch (err) {
        if (cancelled) return;
        userIdRef.current = null;
        setPermissions(null);
        setError(err instanceof Error ? err.message : "Failed to load permissions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user?.id ?? null;
      const shouldReload = shouldReloadPermissions({
        event,
        nextUserId,
        currentUserId: userIdRef.current,
      });

      if (!shouldReload) {
        // Keep ref in sync if we somehow had no cached id yet but same session.
        if (nextUserId && !userIdRef.current) {
          userIdRef.current = nextUserId;
        }
        return;
      }

      userIdRef.current = nextUserId;
      void loadForSession(session != null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSelfPermissions();
      userIdRef.current = data.userId ?? null;
      setPermissions(data);
    } catch (err) {
      userIdRef.current = null;
      setPermissions(null);
      setError(err instanceof Error ? err.message : "Failed to load permissions");
    } finally {
      setLoading(false);
    }
  }, []);

  const can = useCallback(
    (moduleSlug: ModuleSlug, action: PermissionAction): boolean => {
      if (!permissions) return false;
      return checkModulePermission(permissions, moduleSlug, action);
    },
    [permissions],
  );

  const value = useMemo<PermissionsContextValue>(
    () => ({
      permissions,
      loading,
      error,
      refresh,
      can,
      isSuperAdmin: permissions?.isSuperAdmin ?? false,
    }),
    [permissions, loading, error, refresh, can],
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error("usePermissions must be used within a PermissionsProvider");
  }
  return ctx;
}
