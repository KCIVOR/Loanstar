"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { MIN_PF_RATE } from "@/lib/loan-types/g2";
import {
  Alert,
  Button,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
  Table,
  Td,
  Th,
} from "@/components/ui";

type LoanType = {
  id: string;
  name: string;
  interest_rate: number;
  pf_rate: number;
  segment: "seafarer" | "sme" | null;
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
  const [segment, setSegment] = useState<"seafarer" | "sme">("seafarer");
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
    if (segment !== "sme" && pf < MIN_PF_RATE) {
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
          segment,
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
            <Select
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as "all" | "active" | "inactive")
              }
              className="w-auto min-w-[9rem]"
              aria-label="Filter loan types"
            >
              <option value="all">All</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </Select>
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
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" form="enroll-rate-form" loading={saving}>
              Enroll new rate version
            </Button>
          </>
        }
      >
        <form
          id="enroll-rate-form"
          onSubmit={(e) => void handleEnroll(e)}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="lt-name" required>
              Loan type name
            </Label>
            <Input
              id="lt-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="REGULAR"
            />
          </div>
          <div>
            <Label htmlFor="lt-segment" required>
              Segment
            </Label>
            <Select
              id="lt-segment"
              value={segment}
              onChange={(e) =>
                setSegment(e.target.value as "seafarer" | "sme")
              }
            >
              <option value="seafarer">Seafarer</option>
              <option value="sme">SME</option>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="lt-interest" required>
                Interest rate (decimal)
              </Label>
              <Input
                id="lt-interest"
                type="number"
                step="0.0001"
                required
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className="mono"
              />
            </div>
            <div>
              <Label htmlFor="lt-pf" required>
                PF rate (decimal
                {segment === "sme"
                  ? "; G2 floor does not apply"
                  : `, min ${(MIN_PF_RATE * 100).toFixed(3)}%`}
                )
              </Label>
              <Input
                id="lt-pf"
                type="number"
                step="0.0001"
                required
                value={pfRate}
                onChange={(e) => setPfRate(e.target.value)}
                className="mono"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="lt-effective" required>
              Effective from
            </Label>
            <Input
              id="lt-effective"
              type="date"
              required
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
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
              <Th>Segment</Th>
              <Th num>Interest</Th>
              <Th num>PF Rate</Th>
              <Th>Status</Th>
              <Th>Effective</Th>
              <Th>Enrolled</Th>
            </tr>
          </thead>
          <tbody>
            {loanTypes.map((lt) => (
              <tr key={lt.id}>
                <Td className="font-medium text-ink-900">{lt.name}</Td>
                <Td className="capitalize text-sm">
                  {lt.segment ?? "seafarer"}
                </Td>
                <Td num>{formatRate(lt.interest_rate)}</Td>
                <Td num>{formatRate(lt.pf_rate)}</Td>
                <Td>
                  <StatusBadge active={lt.is_active} />
                </Td>
                <Td className="mono text-sm">
                  {lt.effective_from}
                  {lt.effective_to ? ` → ${lt.effective_to}` : ""}
                </Td>
                <Td className="mono text-xs text-ink-400">
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
