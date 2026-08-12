"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Label,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { STAGES } from "@/lib/constants";

type DocumentType = {
  id: string;
  slug: string;
  name: string;
};

type LoanSegment = "seafarer" | "sme";
type EntityTypeFilter = "" | "individual" | "corporate";

type ChecklistItem = {
  id: string;
  stage: string;
  segment: LoanSegment;
  entityType: "individual" | "corporate" | null;
  isRequired: boolean;
  isOptionalFlag: boolean;
  sortOrder: number;
  documentType: DocumentType | null;
};

export default function ChecklistsAdminPage() {
  const [stage, setStage] = useState<string>("intake");
  const [segment, setSegment] = useState<LoanSegment>("seafarer");
  const [entityType, setEntityType] = useState<EntityTypeFilter>("");
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [allItems, setAllItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newDocTypeId, setNewDocTypeId] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stageParams = new URLSearchParams({ stage, segment });
      if (entityType) {
        stageParams.set("entityType", entityType);
      } else {
        stageParams.set("entityType", "none");
      }

      const [stageRes, allRes] = await Promise.all([
        fetch(`/api/admin/stage-checklists?${stageParams.toString()}`),
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
  }, [stage, segment, entityType]);

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
          segment,
          entityType: segment === "sme" ? entityType || null : null,
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
          segment: item.segment,
          entityType: item.entityType,
        }),
      });
      if (!res.ok) throw new Error("Failed to update item");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function handleRemove(id: string) {
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
        description="Configure required documents per workflow stage and loan segment"
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

      <Card className="mb-6 grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="stage">Stage</Label>
          <Select
            id="stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="mt-1"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="segment">Segment</Label>
          <Select
            id="segment"
            value={segment}
            onChange={(e) => {
              const next = e.target.value as LoanSegment;
              setSegment(next);
              if (next === "seafarer") setEntityType("");
            }}
            className="mt-1"
          >
            <option value="seafarer">Seafarer</option>
            <option value="sme">SME</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="entityType">Entity type</Label>
          <Select
            id="entityType"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as EntityTypeFilter)}
            className="mt-1"
            disabled={segment !== "sme"}
          >
            <option value="">Common (both)</option>
            <option value="individual">Individual</option>
            <option value="corporate">Corporate</option>
          </Select>
        </div>
      </Card>

      {loading ? (
        <Spinner />
      ) : (
        <>
          <Card className="mb-6">
            <h2 className="mb-3 font-display text-lg font-semibold text-navy-900">
              Checklist items — {stage.replace(/_/g, " ")} / {segment}
              {segment === "sme"
                ? ` / ${entityType || "common"}`
                : ""}
            </h2>
            {items.length === 0 ? (
              <EmptyState
                title="No items for this filter"
                description="Add a document type below."
                showMark={false}
              />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Document</Th>
                    <Th>Entity</Th>
                    <Th>Required</Th>
                    <Th num>Order</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <Td className="font-medium text-ink-900">
                        {item.documentType?.name ?? "—"}
                      </Td>
                      <Td>{item.entityType ?? "common"}</Td>
                      <Td>
                        {item.isRequired ? (
                          <Badge variant="warning">Required</Badge>
                        ) : (
                          <Badge variant="neutral">Optional</Badge>
                        )}
                      </Td>
                      <Td num>{item.sortOrder}</Td>
                      <Td>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void handleToggleRequired(item)}
                          >
                            Toggle req/opt
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setConfirmRemoveId(item.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 font-display text-lg font-semibold text-navy-900">
              Add document type
            </h2>
            {availableTypes.length === 0 ? (
              <EmptyState
                title="All document types assigned"
                description="Every known document type is already in this filtered checklist."
                showMark={false}
              />
            ) : (
              <form
                onSubmit={(e) => void handleAdd(e)}
                className="flex flex-wrap items-end gap-3"
              >
                <div className="min-w-[200px] flex-1">
                  <Label htmlFor="docType">Document type</Label>
                  <Select
                    id="docType"
                    value={newDocTypeId}
                    onChange={(e) => setNewDocTypeId(e.target.value)}
                    className="mt-1"
                    required
                  >
                    <option value="">Select…</option>
                    {availableTypes.map((dt) => (
                      <option key={dt.id} value={dt.id}>
                        {dt.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  type="submit"
                  loading={adding}
                  disabled={!newDocTypeId}
                >
                  Add to checklist
                </Button>
              </form>
            )}
          </Card>
        </>
      )}

      <ConfirmDialog
        open={confirmRemoveId !== null}
        title="Remove checklist item?"
        message="This document type will be removed from the stage checklist."
        confirmLabel="Remove"
        variant="danger"
        onCancel={() => setConfirmRemoveId(null)}
        onConfirm={() => {
          if (!confirmRemoveId) return;
          void handleRemove(confirmRemoveId).then(() =>
            setConfirmRemoveId(null),
          );
        }}
      />
    </div>
  );
}
