import type { ModuleSlug } from "@/lib/constants";

export type { ModuleSlug } from "@/lib/constants";

export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "execute_trigger";

export type FieldAccess = "edit" | "read_only" | "deny";

/** Per-module field allow/deny map stored in `role_field_rules.field_rules`. */
export type FieldRule = Record<string, FieldAccess>;

export type ModulePermission = {
  moduleSlug: ModuleSlug;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExecuteTrigger: boolean;
};

export type UserPermissions = {
  userId: string;
  isSuperAdmin: boolean;
  modules: ModulePermission[];
  fieldRules: Partial<Record<ModuleSlug, FieldRule>>;
};

/** Maps PermissionAction to the corresponding property on ModulePermission. */
export const PERMISSION_COLUMN: Record<
  PermissionAction,
  keyof Pick<
    ModulePermission,
    | "canView"
    | "canCreate"
    | "canEdit"
    | "canDelete"
    | "canExecuteTrigger"
  >
> = {
  view: "canView",
  create: "canCreate",
  edit: "canEdit",
  delete: "canDelete",
  execute_trigger: "canExecuteTrigger",
};
