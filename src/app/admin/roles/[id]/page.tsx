"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { FieldRulesEditor } from "@/components/admin/FieldRulesEditor";
import { MODULES } from "@/lib/constants";
import type { FieldAccess } from "@/lib/permissions/types";

type PermissionRow = {
  id: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_execute_trigger: boolean;
  modules: { id: string; slug: string; name: string };
};

type FieldRuleRow = {
  id: string;
  field_rules: Record<string, FieldAccess>;
  modules: { id: string; slug: string; name: string };
};

type RoleDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  role_module_permissions: PermissionRow[];
  role_field_rules: FieldRuleRow[];
};

type ModuleRow = { id: string; slug: string; name: string };

const PERM_KEYS = [
  { key: "can_view", label: "View" },
  { key: "can_create", label: "Create" },
  { key: "can_edit", label: "Edit" },
  { key: "can_delete", label: "Delete" },
  { key: "can_execute_trigger", label: "Trigger" },
] as const;

export default function RoleDetailPage() {
  const params = useParams();
  const roleId = params.id as string;

  const [role, setRole] = useState<RoleDetail | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [fieldRules, setFieldRules] = useState<Record<string, FieldAccess>>({});
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [saving, setSaving] = useState(false);

  const [permState, setPermState] = useState<
    Record<
      string,
      {
        canView: boolean;
        canCreate: boolean;
        canEdit: boolean;
        canDelete: boolean;
        canExecuteTrigger: boolean;
      }
    >
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/roles/${roleId}`);
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to load role");
      }
      const data = (await res.json()) as { role: RoleDetail; modules: ModuleRow[] };
      setRole(data.role);
      setModules(data.modules);
      setName(data.role.name);

      const perms: typeof permState = {};
      for (const mod of MODULES) {
        const existing = data.role.role_module_permissions.find((p) => {
          const m = Array.isArray(p.modules) ? p.modules[0] : p.modules;
          return m?.slug === mod.slug;
        });
        perms[mod.slug] = {
          canView: existing?.can_view ?? false,
          canCreate: existing?.can_create ?? false,
          canEdit: existing?.can_edit ?? false,
          canDelete: existing?.can_delete ?? false,
          canExecuteTrigger: existing?.can_execute_trigger ?? false,
        };
      }
      setPermState(perms);

      if (data.role.role_field_rules.length > 0) {
        const first = data.role.role_field_rules[0];
        const mod = Array.isArray(first.modules)
          ? first.modules[0]
          : first.modules;
        setSelectedModuleId(mod?.id ?? "");
        setFieldRules(first.field_rules ?? {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load role");
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleModuleFieldRulesChange(moduleId: string) {
    setSelectedModuleId(moduleId);
    const rule = role?.role_field_rules.find((r) => {
      const m = Array.isArray(r.modules) ? r.modules[0] : r.modules;
      return m?.id === moduleId;
    });
    setFieldRules(rule?.field_rules ?? {});
  }

  async function saveName() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to update role");
      }
      setMessage("Role name saved");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function savePermissions() {
    if (!role) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const permissions = modules.map((m) => {
        const state = permState[m.slug] ?? {
          canView: false,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canExecuteTrigger: false,
        };
        return {
          moduleId: m.id,
          ...state,
        };
      });

      const res = await fetch(`/api/admin/roles/${roleId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to save permissions");
      }
      setMessage("Permissions saved");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function saveFieldRules() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const parsed = fieldRules;
      if (!selectedModuleId) {
        throw new Error("Select a module for field rules");
      }

      const res = await fetch(`/api/admin/roles/${roleId}/field-rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: [{ moduleId: selectedModuleId, fieldRules: parsed }],
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to save field rules");
      }
      setMessage("Field rules saved");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (!role) {
    return <Alert>Role not found</Alert>;
  }

  return (
    <div>
      <PageHeader
        title={role.name}
        description={`Slug: ${role.slug}${role.is_system ? " (system role)" : ""}`}
        actions={
          <Link href="/admin/roles" className="text-sm text-ink-muted hover:underline">
            ← Back to roles
          </Link>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {message ? (
        <div className="mb-4">
          <Alert variant="success">{message}</Alert>
        </div>
      ) : null}

      <Card className="mb-6">
        <h2 className="mb-3 font-medium text-ink">Role name</h2>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={() => void saveName()} disabled={saving}>
            Save
          </Button>
        </div>
      </Card>

      <Card className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-ink">Module permissions</h2>
          <Button onClick={() => void savePermissions()} disabled={saving}>
            Save permissions
          </Button>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Module</Th>
              {PERM_KEYS.map((p) => (
                <Th key={p.key}>{p.label}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((mod) => {
              const state = permState[mod.slug];
              return (
                <tr key={mod.slug}>
                  <Td className="font-medium text-ink">{mod.name}</Td>
                  {(
                    [
                      "canView",
                      "canCreate",
                      "canEdit",
                      "canDelete",
                      "canExecuteTrigger",
                    ] as const
                  ).map((key) => (
                    <Td key={key} className="text-center">
                      {/* Compact matrix cells — full Checkbox label would clutter columns */}
                      <input
                        type="checkbox"
                        aria-label={`${mod.name} ${key}`}
                        checked={state?.[key] ?? false}
                        onChange={(e) =>
                          setPermState((prev) => ({
                            ...prev,
                            [mod.slug]: {
                              ...prev[mod.slug],
                              [key]: e.target.checked,
                            },
                          }))
                        }
                        className="h-4 w-4 rounded border-neutral-300 accent-gold-400"
                      />
                    </Td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium text-ink">Field rules</h2>
          <Button onClick={() => void saveFieldRules()} disabled={saving}>
            Save field rules
          </Button>
        </div>
        <div className="mb-4">
          <Label htmlFor="field-module">Module</Label>
          <Select
            id="field-module"
            value={selectedModuleId}
            onChange={(e) => handleModuleFieldRulesChange(e.target.value)}
          >
            <option value="">Select module…</option>
            {role.role_module_permissions.map((p) => {
              const m = Array.isArray(p.modules) ? p.modules[0] : p.modules;
              if (!m) return null;
              return (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              );
            })}
          </Select>
        </div>
        <FieldRulesEditor
          rules={fieldRules}
          onChange={setFieldRules}
          disabled={!selectedModuleId || saving}
        />
      </Card>
    </div>
  );
}
