"use client";

import { useCallback, useEffect, useState } from "react";

import { checkModulePermission } from "@/lib/permissions/check";
import type {
  ModuleSlug,
  PermissionAction,
  UserPermissions,
} from "@/lib/permissions/types";

type UsePermissionsState = {
  permissions: UserPermissions | null;
  loading: boolean;
  error: string | null;
};

export function usePermissions() {
  const [state, setState] = useState<UsePermissionsState>({
    permissions: null,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch("/api/permissions/me", {
        credentials: "include",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Request failed (${response.status})`);
      }

      const permissions = (await response.json()) as UserPermissions;
      setState({ permissions, loading: false, error: null });
    } catch (err) {
      setState({
        permissions: null,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load permissions",
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const can = useCallback(
    (moduleSlug: ModuleSlug, action: PermissionAction): boolean => {
      if (!state.permissions) return false;
      return checkModulePermission(state.permissions, moduleSlug, action);
    },
    [state.permissions],
  );

  return {
    permissions: state.permissions,
    loading: state.loading,
    error: state.error,
    refresh,
    can,
    isSuperAdmin: state.permissions?.isSuperAdmin ?? false,
  };
}
