"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Card,
  PageHeader,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";

type CheckType = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

type Mapping = {
  id: string;
  stage: string;
  sort_order: number;
  check_types: CheckType | CheckType[];
};

export default function ChecksPage() {
  const [checkTypes, setCheckTypes] = useState<CheckType[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/checks");
      if (!res.ok) throw new Error("Failed to load checks");
      const data = (await res.json()) as {
        checkTypes: CheckType[];
        mappings: Mapping[];
      };
      setCheckTypes(data.checkTypes);
      setMappings(data.mappings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Checks"
        description="Check types and stage-to-check mappings"
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Card className="mb-6">
        <h2 className="mb-3 font-medium text-neutral-900">Check types</h2>
        <Table>
          <thead>
            <tr>
              <Th>Slug</Th>
              <Th>Name</Th>
              <Th>Description</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {checkTypes.map((ct) => (
              <tr key={ct.id}>
                <Td className="font-mono text-xs">{ct.slug}</Td>
                <Td className="font-medium">{ct.name}</Td>
                <Td>{ct.description ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <h2 className="mb-3 font-medium text-neutral-900">Stage check mapping</h2>
        <Table>
          <thead>
            <tr>
              <Th>Stage</Th>
              <Th>Order</Th>
              <Th>Check</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {mappings.map((m) => {
              const ct = Array.isArray(m.check_types)
                ? m.check_types[0]
                : m.check_types;
              return (
                <tr key={m.id}>
                  <Td className="uppercase">{m.stage}</Td>
                  <Td>{m.sort_order}</Td>
                  <Td>{ct?.name ?? "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
