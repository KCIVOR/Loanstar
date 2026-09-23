"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  cn,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  StatusBadge,
  Table,
  Td,
  Th,
} from "@/components/ui";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  roles: Array<{ id: string; slug: string; name: string }>;
};

type RoleOption = { id: string; name: string; slug: string };

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

const STATUS_CHIPS: Array<{ id: "all" | "active" | "inactive"; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
];

// "staff" here means "holds any role other than borrower" — see the
// audience-classification comment in src/lib/users/service.ts for the
// live-verified role slugs this is derived from.
const AUDIENCE_CHIPS: Array<{ id: "all" | "staff" | "borrower"; label: string }> = [
  { id: "all", label: "All" },
  { id: "staff", label: "Staff" },
  { id: "borrower", label: "Borrower" },
];

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [newRoleIds, setNewRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<UserRow | null>(
    null,
  );
  const [confirmRoleRemoval, setConfirmRoleRemoval] = useState<{
    user: UserRow;
    role: RoleOption;
  } | null>(null);

  // Search and filter state (component state + debounce, matching the
  // document-templates page's interaction pattern — not URL query params).
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [audienceFilter, setAudienceFilter] = useState<"all" | "staff" | "borrower">("all");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to page 1 whenever search/filters/page size change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter, statusFilter, audienceFilter, pageSize]);

  const loadRoles = useCallback(async () => {
    const res = await fetch("/api/admin/roles");
    if (!res.ok) throw new Error("Failed to load roles");
    const data = (await res.json()) as { roles: RoleOption[] };
    setRoles(data.roles);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * pageSize;
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
        q: debouncedSearch,
        roleId: roleFilter,
        status: statusFilter === "all" ? "" : statusFilter,
        audience: audienceFilter === "all" ? "" : audienceFilter,
      });
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to load users");
      }
      const data = (await res.json()) as {
        items: UserRow[];
        total: number;
        limit: number;
        offset: number;
      };
      setUsers(data.items);
      setTotal(data.total);

      // If a mutation emptied the current page (e.g. the last row on the
      // last page was affected), fall back to the previous valid offset.
      if (data.items.length === 0 && data.total > 0 && offset > 0) {
        setPage((p) => Math.max(1, p - 1));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, roleFilter, statusFilter, audienceFilter]);

  useEffect(() => {
    void loadRoles().catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load roles");
    });
  }, [loadRoles]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          fullName: fullName || undefined,
          roleIds: newRoleIds.length ? newRoleIds : undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to create user");
      }
      setEmail("");
      setPassword("");
      setFullName("");
      setNewRoleIds([]);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: UserRow) {
    setError(null);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !user.is_active }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Failed to update user");
      return;
    }
    await load();
  }

  async function updateRoles(user: UserRow, roleId: string, checked: boolean) {
    const currentIds = user.roles.map((r) => r.id);
    const roleIds = checked
      ? [...currentIds, roleId]
      : currentIds.filter((id) => id !== roleId);

    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleIds }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Failed to update roles");
      return;
    }
    await load();
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);

  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (audienceFilter !== "all" ? 1 : 0) +
    (roleFilter ? 1 : 0);

  const summaryStart = users.length ? (safePage - 1) * pageSize + 1 : 0;
  const summaryEnd = (safePage - 1) * pageSize + users.length;

  const roleFilterLabel = roles.find((r) => r.id === roleFilter)?.name ?? "Role";

  const isFiltering =
    Boolean(search) || Boolean(roleFilter) || statusFilter !== "all" || audienceFilter !== "all";

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage user accounts and role assignments"
        actions={
          <Button onClick={() => setShowForm(true)}>Create user</Button>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Modal
        open={showForm}
        title="Create user"
        onClose={() => setShowForm(false)}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-user-form"
              loading={saving}
            >
              Create user
            </Button>
          </>
        }
      >
        <form
          id="create-user-form"
          onSubmit={(e) => void handleCreate(e)}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="user-email" required>
              Email
            </Label>
            <Input
              id="user-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="user-password" required>
              Password
            </Label>
            <Input
              id="user-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="user-name">Full name</Label>
            <Input
              id="user-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <Label>Roles</Label>
            <div className="mt-1 flex flex-wrap gap-3">
              {roles.map((role) => (
                <Checkbox
                  key={role.id}
                  id={`new-role-${role.id}`}
                  label={role.name}
                  checked={newRoleIds.includes(role.id)}
                  onChange={(checked) =>
                    setNewRoleIds((prev) =>
                      checked
                        ? [...prev, role.id]
                        : prev.filter((id) => id !== role.id),
                    )
                  }
                />
              ))}
            </div>
          </div>
        </form>
      </Modal>

      <div className="card mb-4" style={{ overflow: "visible" }}>
        <div className="tbl-toolbar" style={{ padding: "13px 14px" }}>
          <div className="gsearch" style={{ maxWidth: 300, flex: 1, minWidth: 190 }}>
            <span className="icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              className="input"
              style={{ height: 37, paddingRight: 12, borderRadius: "var(--r-md)" }}
              placeholder="Search name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {statusFilter !== "all" ? (
              <span className="active-pill">
                {statusFilter === "active" ? "Active" : "Inactive"}
                <button
                  type="button"
                  aria-label="Clear status filter"
                  onClick={() => setStatusFilter("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {audienceFilter !== "all" ? (
              <span className="active-pill">
                {audienceFilter === "staff" ? "Staff" : "Borrower"}
                <button
                  type="button"
                  aria-label="Clear audience filter"
                  onClick={() => setAudienceFilter("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {roleFilter ? (
              <span className="active-pill">
                {roleFilterLabel}
                <button
                  type="button"
                  aria-label="Clear role filter"
                  onClick={() => setRoleFilter("")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="clear-link"
                onClick={() => {
                  setStatusFilter("all");
                  setAudienceFilter("all");
                  setRoleFilter("");
                }}
              >
                Clear all
              </button>
            ) : null}
          </div>

          <div className="sp">
            <button
              type="button"
              className={cn("btn btn-outline", filterPanelOpen && "is-on")}
              onClick={() => setFilterPanelOpen((open) => !open)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                width={16}
                height={16}
                aria-hidden
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filters
              {activeFilterCount > 0 ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 16,
                    height: 16,
                    padding: "0 4px",
                    borderRadius: "var(--r-full)",
                    background: "var(--teal-600)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className={cn("filter-panel", filterPanelOpen && "is-open")}>
          <div className="filter-group">
            <span className="filter-group-label">Status</span>
            <div className="filter-bar">
              {STATUS_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", statusFilter === chip.id && "is-on")}
                  onClick={() => setStatusFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-group-label">Audience</span>
            <div className="filter-bar">
              {AUDIENCE_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", audienceFilter === chip.id && "is-on")}
                  onClick={() => setAudienceFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-group-label">Role</span>
            <div className="filter-bar">
              <button
                type="button"
                className={cn("fchip", !roleFilter && "is-on")}
                onClick={() => setRoleFilter("")}
              >
                All roles
              </button>
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  className={cn("fchip", roleFilter === role.id && "is-on")}
                  onClick={() => setRoleFilter(role.id)}
                >
                  {role.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mb-4">
          <Table>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>Roles</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <Td colSpan={5}>
                    <Skeleton variant="line" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : total === 0 && !isFiltering ? (
        <EmptyState
          title="No users yet"
          description="Create your first user account to get started."
          action={<Button onClick={() => setShowForm(true)}>Create user</Button>}
        />
      ) : users.length === 0 ? (
        <EmptyState
          title="No matching users"
          description="Try a different search term or filter."
          showMark={false}
        />
      ) : (
        <>
          <div className="mb-4">
            <Table>
              <thead>
                <tr>
                  <Th>Email</Th>
                  <Th>Name</Th>
                  <Th>Status</Th>
                  <Th>Roles</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <Td className="font-medium text-ink-900">{user.email}</Td>
                    <Td>{user.full_name ?? "—"}</Td>
                    <Td>
                      <StatusBadge active={user.is_active} />
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-2">
                        {roles.map((role) => (
                          <Checkbox
                            key={role.id}
                            id={`user-${user.id}-role-${role.id}`}
                            label={role.name}
                            checked={user.roles.some((r) => r.id === role.id)}
                            onChange={(checked) => {
                              if (!checked && role.slug === "super_admin") {
                                setConfirmRoleRemoval({ user, role });
                                return;
                              }
                              void updateRoles(user, role.id, checked);
                            }}
                          />
                        ))}
                      </div>
                    </Td>
                    <Td>
                      {user.is_active ? (
                        <Button
                          variant="danger-soft"
                          size="sm"
                          onClick={() => setConfirmDeactivate(user)}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void toggleActive(user)}
                        >
                          Activate
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
              <span>Show</span>
              <Select
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                }}
                style={{ width: 72, height: 34 }}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
              <span>per page</span>
            </div>
            <Pagination
              page={safePage}
              pageCount={pageCount}
              onPageChange={setPage}
              summary={`Showing ${summaryStart}–${summaryEnd} of ${total}`}
            />
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDeactivate !== null}
        title="Deactivate this account?"
        message={
          confirmDeactivate
            ? `${confirmDeactivate.email} will no longer be able to sign in. You can reactivate the account later.`
            : undefined
        }
        confirmLabel="Deactivate"
        variant="danger"
        onCancel={() => setConfirmDeactivate(null)}
        onConfirm={() => {
          if (!confirmDeactivate) return;
          void toggleActive(confirmDeactivate).then(() =>
            setConfirmDeactivate(null),
          );
        }}
      />

      <ConfirmDialog
        open={confirmRoleRemoval !== null}
        title="Remove Super Admin role?"
        message={
          confirmRoleRemoval
            ? `${confirmRoleRemoval.user.email} will lose full system access. Make sure another Super Admin account remains, or you may lock yourself out of administration.`
            : undefined
        }
        confirmLabel="Remove role"
        variant="danger"
        onCancel={() => setConfirmRoleRemoval(null)}
        onConfirm={() => {
          if (!confirmRoleRemoval) return;
          void updateRoles(
            confirmRoleRemoval.user,
            confirmRoleRemoval.role.id,
            false,
          ).then(() => setConfirmRoleRemoval(null));
        }}
      />
    </div>
  );
}
