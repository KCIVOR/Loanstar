import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Live-verified role slugs (queried against the `roles` table on the
 * Loanstar Supabase project, 2026-09-23):
 *
 *   agent, ar, borrower, collection_head, cig, collector, committee,
 *   csa, lra, remedial, super_admin
 *
 * `borrower` is the only non-staff role. Every other slug is a staff
 * role — there is no role literally named "staff". Audience is
 * therefore derived, not stored:
 *   - audience "borrower" -> user holds the `borrower` role
 *   - audience "staff"    -> user holds at least one role other than
 *                            `borrower`
 * A user who somehow holds both `borrower` and a staff role (none do,
 * as of the 2026-09-23 audit — see the multi-role query in the plan)
 * would match both filters; this is intentional "do not guess" behavior
 * per the plan rather than an invented tie-break rule.
 */
const BORROWER_ROLE_SLUG = "borrower";

export type UserRoleRef = { id: string; slug: string; name: string };

export type UserListItem = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  roles: UserRoleRef[];
};

export type ListUsersResult = {
  items: UserListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type ListUsersOptions = {
  q?: string;
  roleId?: string;
  status?: "all" | "active" | "inactive";
  audience?: "all" | "staff" | "borrower";
  limit?: number;
  offset?: number;
};

const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

/**
 * Query-parameter contract for GET /api/admin/users. Exported so the route
 * can parse/validate with it directly and so this module's own tests can
 * exercise the validation rules (invalid role UUID, limit clamping) without
 * importing the route handler (which requires a live Supabase auth session
 * via requireModulePermission and would not run under `npm test`'s
 * src/lib-only glob).
 */
export const usersQuerySchema = z.object({
  q: z
    .preprocess(emptyToUndefined, z.string().trim().max(200).optional())
    .transform((v) => v ?? ""),
  roleId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  status: z
    .preprocess(
      emptyToUndefined,
      z.enum(["all", "active", "inactive"]).optional(),
    )
    .transform((v) => v ?? "all"),
  audience: z
    .preprocess(
      emptyToUndefined,
      z.enum(["all", "staff", "borrower"]).optional(),
    )
    .transform((v) => v ?? "all"),
  // Clamped (not rejected) to the document-template route's observed max of
  // 100 — see plan "Non-negotiable safety constraints".
  limit: z
    .preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional())
    .transform((v) => Math.min(v ?? 20, 100)),
  offset: z
    .preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional())
    .transform((v) => v ?? 0),
});

export type UsersQuery = z.infer<typeof usersQuerySchema>;

const PROFILE_COLS = "id, email, full_name, is_active, created_at, updated_at";

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Resolve the set of user ids matching a role/audience constraint, or
 * `null` when no such constraint is in effect (i.e. don't restrict).
 * Multiple constraints (a specific roleId AND an audience) are intersected.
 */
async function resolveRestrictedUserIds(
  supabase: SupabaseClient,
  options: Pick<ListUsersOptions, "roleId" | "audience">,
): Promise<string[] | null> {
  let restricted: Set<string> | null = null;

  const intersect = (ids: Set<string>) => {
    restricted = restricted
      ? new Set([...restricted].filter((id) => ids.has(id)))
      : ids;
  };

  if (options.roleId) {
    const { data, error } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role_id", options.roleId);
    if (error) throw new Error(error.message);
    intersect(
      new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)),
    );
  }

  if (options.audience === "staff" || options.audience === "borrower") {
    const { data: borrowerRole, error: roleErr } = await supabase
      .from("roles")
      .select("id")
      .eq("slug", BORROWER_ROLE_SLUG)
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);

    if (!borrowerRole) {
      // Borrower role missing entirely: no one can match either audience
      // value — do not guess, return an empty restriction per user_id set.
      intersect(new Set());
    } else {
      const borrowerRoleId = (borrowerRole as { id: string }).id;
      if (options.audience === "borrower") {
        const { data, error } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role_id", borrowerRoleId);
        if (error) throw new Error(error.message);
        intersect(
          new Set(
            ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
          ),
        );
      } else {
        const { data, error } = await supabase
          .from("user_roles")
          .select("user_id")
          .neq("role_id", borrowerRoleId);
        if (error) throw new Error(error.message);
        intersect(
          new Set(
            ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
          ),
        );
      }
    }
  }

  return restricted ? [...restricted] : null;
}

/**
 * List profiles with server-side search, role/status/audience filtering,
 * and bounded pagination. Mirrors listTemplates in
 * src/lib/documents/templates/service.ts: `count: 'exact'` + `.range()`
 * for pagination metadata, `.or()` for case-insensitive search across
 * name/email.
 *
 * Dedup for multi-role users falls out of the query shape itself: the
 * paginated, counted query runs against `profiles` (one row per user),
 * never against `user_roles` (which would multiply rows per role). Role
 * data is fetched separately for exactly the page of profile ids returned
 * and merged in-memory.
 */
export async function listUsers(
  supabase: SupabaseClient,
  options?: ListUsersOptions,
): Promise<ListUsersResult> {
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const offset = Math.max(options?.offset ?? 0, 0);
  const searchTerm = options?.q?.trim() ?? "";
  const statusFilter = options?.status ?? "all";

  const restrictedUserIds = await resolveRestrictedUserIds(supabase, {
    roleId: options?.roleId,
    audience: options?.audience,
  });

  if (restrictedUserIds && restrictedUserIds.length === 0) {
    return { items: [], total: 0, limit, offset };
  }

  let query = supabase.from("profiles").select(PROFILE_COLS, { count: "exact" });

  if (searchTerm) {
    query = query.or(`email.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`);
  }
  if (statusFilter === "active") {
    query = query.eq("is_active", true);
  } else if (statusFilter === "inactive") {
    query = query.eq("is_active", false);
  }
  if (restrictedUserIds) {
    query = query.in("id", restrictedUserIds);
  }

  const { data: profiles, error, count } = await query
    .order("email")
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  const profileRows = (profiles ?? []) as ProfileRow[];
  const profileIds = profileRows.map((p) => p.id);

  const rolesByUser = new Map<string, UserRoleRef[]>();
  if (profileIds.length) {
    const { data: userRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role_id, roles ( id, slug, name )")
      .in("user_id", profileIds);
    if (rolesError) throw new Error(rolesError.message);

    for (const ur of (userRoles ?? []) as Array<{
      user_id: string;
      roles: UserRoleRef | UserRoleRef[] | null;
    }>) {
      const roleRaw = ur.roles;
      const role = Array.isArray(roleRaw) ? roleRaw[0] : roleRaw;
      if (!role) continue;
      const list = rolesByUser.get(ur.user_id) ?? [];
      list.push(role);
      rolesByUser.set(ur.user_id, list);
    }
  }

  const items: UserListItem[] = profileRows.map((p) => ({
    ...p,
    roles: rolesByUser.get(p.id) ?? [],
  }));

  return { items, total: count ?? 0, limit, offset };
}
