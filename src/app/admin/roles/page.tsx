"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  Alert,
  Button,
  Input,
  Label,
  Modal,
  PageHeader,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";

type Role = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/roles");
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to load roles");
      }
      const data = (await res.json()) as { roles: Role[] };
      setRoles(data.roles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roles");
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
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to create role");
      }
      setName("");
      setDescription("");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create role");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Roles"
        description="Manage custom roles and module permissions"
        actions={
          <Button onClick={() => setShowForm(true)}>Create role</Button>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Modal
        open={showForm}
        title="Create role"
        onClose={() => setShowForm(false)}
      >
        <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
          <div>
            <Label htmlFor="role-name">Role name</Label>
            <Input
              id="role-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="role-desc">Description</Label>
            <Input
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create role"}
            </Button>
          </div>
        </form>
      </Modal>

      {loading ? (
        <Spinner />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Slug</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 bg-white">
            {roles.map((role) => (
              <tr key={role.id}>
                <Td className="font-medium text-neutral-900">{role.name}</Td>
                <Td>{role.slug}</Td>
                <Td>{role.is_system ? "System" : "Custom"}</Td>
                <Td>
                  <span
                    className={
                      role.is_active
                        ? "text-success-700"
                        : "text-neutral-400"
                    }
                  >
                    {role.is_active ? "Active" : "Inactive"}
                  </span>
                </Td>
                <Td>
                  <Link
                    href={`/admin/roles/${role.id}`}
                    className="text-sm text-neutral-900 hover:underline"
                  >
                    Edit
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
