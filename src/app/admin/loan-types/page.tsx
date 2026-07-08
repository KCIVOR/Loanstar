"use client";

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
import { MIN_PF_RATE } from "@/lib/loan-types/g2";

type LoanType = {
  id: string;
  name: string;
  interest_rate: number;
  pf_rate: number;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  enrolled_at: string;
};

export default function LoanTypesPage() {
  const [loanTypes, setLoanTypes] = useState<LoanType[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [pfRate, setPfRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/loan-types?filter=${filter}`);
      if (!res.ok) throw new Error("Failed to load loan types");
      const data = (await res.json()) as { loanTypes: LoanType[] };
      setLoanTypes(data.loanTypes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleEnroll(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const pf = Number(pfRate);
    if (pf < MIN_PF_RATE) {
      setError(
        `PF rate must be at least ${(MIN_PF_RATE * 100).toFixed(3)}% (G2 guard)`,
      );
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/loan-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          interestRate: Number(interestRate),
          pfRate: pf,
          effectiveFrom,
          deactivatePrevious: true,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to enroll rate");
      }
      setMessage("New rate version enrolled");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enroll");
    } finally {
      setSaving(false);
    }
  }

  function formatRate(rate: number) {
    return `${(rate * 100).toFixed(3)}%`;
  }

  return (
    <div>
      <PageHeader
        title="Loan Types"
        description="Rate table with effectivity versioning (G2 guard enforced)"
        actions={
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as "all" | "active" | "inactive")
              }
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
            <Button onClick={() => setShowForm(true)}>Enroll rate</Button>
          </div>
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

      <Modal
        open={showForm}
        title="Enroll new rate version"
        onClose={() => setShowForm(false)}
      >
        <form onSubmit={(e) => void handleEnroll(e)} className="space-y-4">
          <div>
            <Label htmlFor="lt-name">Loan type name</Label>
            <Input
              id="lt-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="REGULAR"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="lt-interest">Interest rate (decimal)</Label>
              <Input
                id="lt-interest"
                type="number"
                step="0.0001"
                required
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="lt-pf">PF rate (decimal, min {(MIN_PF_RATE * 100).toFixed(3)}%)</Label>
              <Input
                id="lt-pf"
                type="number"
                step="0.0001"
                required
                value={pfRate}
                onChange={(e) => setPfRate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="lt-effective">Effective from</Label>
            <Input
              id="lt-effective"
              type="date"
              required
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
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
              {saving ? "Enrolling…" : "Enroll new rate version"}
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
              <Th>Interest</Th>
              <Th>PF Rate</Th>
              <Th>Status</Th>
              <Th>Effective</Th>
              <Th>Enrolled</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 bg-white">
            {loanTypes.map((lt) => (
              <tr key={lt.id}>
                <Td className="font-medium">{lt.name}</Td>
                <Td>{formatRate(lt.interest_rate)}</Td>
                <Td>{formatRate(lt.pf_rate)}</Td>
                <Td>
                  <span className={lt.is_active ? "text-success-700" : "text-neutral-400"}>
                    {lt.is_active ? "Active" : "Inactive"}
                  </span>
                </Td>
                <Td>
                  {lt.effective_from}
                  {lt.effective_to ? ` → ${lt.effective_to}` : ""}
                </Td>
                <Td className="text-xs text-neutral-500">
                  {new Date(lt.enrolled_at).toLocaleString()}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
