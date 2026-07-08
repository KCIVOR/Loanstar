"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  roles: Array<{ id: string; slug: string; name: string }>;
};

type RoleOption = { id: string; name: string; slug: string };

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [newRoleIds, setNewRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/roles"),
      ]);
      if (!usersRes.ok || !rolesRes.ok) {
        throw new Error("Failed to load users or roles");
      }
      const usersData = (await usersRes.json()) as { users: UserRow[] };
      const rolesData = (await rolesRes.json()) as { roles: RoleOption[] };
      setUsers(usersData.users);
      setRoles(rolesData.roles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage user accounts and role assignments"
        actions={
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Create user"}
          </Button>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {showForm ? (
        <Card className="mb-6">
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div>
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="user-password">Password</Label>
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
                  <label key={role.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={newRoleIds.includes(role.id)}
                      onChange={(e) =>
                        setNewRoleIds((prev) =>
                          e.target.checked
                            ? [...prev, role.id]
                            : prev.filter((id) => id !== role.id),
                        )
                      }
                    />
                    {role.name}
                  </label>
                ))}
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create user"}
            </Button>
          </form>
        </Card>
      ) : null}

      {loading ? (
        <Spinner />
      ) : (
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
          <tbody className="divide-y divide-zinc-200 bg-white">
            {users.map((user) => (
              <tr key={user.id}>
                <Td className="font-medium">{user.email}</Td>
                <Td>{user.full_name ?? "—"}</Td>
                <Td>
                  <span className={user.is_active ? "text-green-700" : "text-zinc-400"}>
                    {user.is_active ? "Active" : "Inactive"}
                  </span>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    {roles.map((role) => (
                      <label
                        key={role.id}
                        className="flex items-center gap-1 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={user.roles.some((r) => r.id === role.id)}
                          onChange={(e) =>
                            void updateRoles(user, role.id, e.target.checked)
                          }
                        />
                        {role.name}
                      </label>
                    ))}
                  </div>
                </Td>
                <Td>
                  <Button
                    variant="secondary"
                    onClick={() => void toggleActive(user)}
                  >
                    {user.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
