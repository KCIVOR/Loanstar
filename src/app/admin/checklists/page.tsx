"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Label,
  PageHeader,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";
import { STAGES } from "@/lib/constants";

type DocumentType = {
  id: string;
  slug: string;
  name: string;
};

type ChecklistItem = {
  id: string;
  stage: string;
  isRequired: boolean;
  isOptionalFlag: boolean;
  sortOrder: number;
  documentType: DocumentType | null;
};

export default function ChecklistsAdminPage() {
  const [stage, setStage] = useState<string>("intake");
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [allItems, setAllItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newDocTypeId, setNewDocTypeId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stageRes, allRes] = await Promise.all([
        fetch(`/api/admin/stage-checklists?stage=${stage}`),
        fetch("/api/admin/stage-checklists"),
      ]);
      if (!stageRes.ok || !allRes.ok) throw new Error("Failed to load checklists");
      const stageData = (await stageRes.json()) as { items: ChecklistItem[] };
      const allData = (await allRes.json()) as { items: ChecklistItem[] };
      setItems(stageData.items ?? []);
      setAllItems(allData.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [stage]);

  useEffect(() => {
    void load();
  }, [load]);

  const documentTypes = useMemo(() => {
    const map = new Map<string, DocumentType>();
    for (const item of allItems) {
      if (item.documentType) map.set(item.documentType.id, item.documentType);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems]);

  const availableTypes = documentTypes.filter(
    (dt) => !items.some((i) => i.documentType?.id === dt.id),
  );

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newDocTypeId) return;
    setAdding(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/stage-checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          documentTypeId: newDocTypeId,
          isRequired: true,
          sortOrder: items.length + 1,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to add item");
      }
      setNewDocTypeId("");
      setMessage("Checklist item added.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  async function handleToggleRequired(item: ChecklistItem) {
    if (!item.documentType) return;
    setError(null);
    try {
      await fetch(`/api/admin/stage-checklists/${item.id}`, {
        method: "DELETE",
      });
      const res = await fetch("/api/admin/stage-checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: item.stage,
          documentTypeId: item.documentType.id,
          isRequired: !item.isRequired,
          isOptionalFlag: item.isRequired,
          sortOrder: item.sortOrder,
        }),
      });
      if (!res.ok) throw new Error("Failed to update item");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this checklist item?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/stage-checklists/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove item");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  return (
    <div>
      <PageHeader
        title="Checklists"
        description="Configure required documents per workflow stage"
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
        <Label htmlFor="stage">Stage</Label>
        <select
          id="stage"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="mt-1 w-full max-w-xs rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </Card>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <Card className="mb-6">
            <h2 className="mb-3 font-medium text-zinc-900">
              Checklist items — {stage.replace(/_/g, " ")}
            </h2>
            <Table>
              <thead>
                <tr>
                  <Th>Document</Th>
                  <Th>Required</Th>
                  <Th>Order</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {items.map((item) => (
                  <tr key={item.id}>
                    <Td className="font-medium">
                      {item.documentType?.name ?? "—"}
                    </Td>
                    <Td>
                      {item.isRequired ? (
                        <span className="text-xs font-medium text-zinc-900">
                          Required
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-500">Optional</span>
                      )}
                    </Td>
                    <Td>{item.sortOrder}</Td>
                    <Td>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          className="text-xs"
                          onClick={() => void handleToggleRequired(item)}
                        >
                          Toggle req/opt
                        </Button>
                        <Button
                          variant="danger"
                          className="text-xs"
                          onClick={() => void handleRemove(item.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {items.length === 0 ? (
              <p className="py-4 text-sm text-zinc-500">No items for this stage.</p>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-3 font-medium text-zinc-900">Add document type</h2>
            {availableTypes.length === 0 ? (
              <p className="text-sm text-zinc-500">
                All known document types are already in this stage checklist.
              </p>
            ) : (
              <form
                onSubmit={(e) => void handleAdd(e)}
                className="flex flex-wrap items-end gap-3"
              >
                <div className="min-w-[200px] flex-1">
                  <Label htmlFor="docType">Document type</Label>
                  <select
                    id="docType"
                    value={newDocTypeId}
                    onChange={(e) => setNewDocTypeId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                    required
                  >
                    <option value="">Select…</option>
                    {availableTypes.map((dt) => (
                      <option key={dt.id} value={dt.id}>
                        {dt.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" disabled={adding || !newDocTypeId}>
                  {adding ? "Adding…" : "Add to checklist"}
                </Button>
              </form>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
