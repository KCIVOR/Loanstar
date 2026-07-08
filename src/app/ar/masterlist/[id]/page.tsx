"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  Spinner,
} from "@/components/admin/ui";

type Lookup = {
  portfolios: Array<{ id: string; name: string }>;
  collectors: Array<{ id: string; email: string; full_name: string | null }>;
  remedialStaff: Array<{ id: string; email: string; full_name: string | null }>;
};

export default function ArMasterlistDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [lookups, setLookups] = useState<Lookup | null>(null);
  const [portfolioId, setPortfolioId] = useState("");
  const [collectorId, setCollectorId] = useState("");
  const [remedialId, setRemedialId] = useState("");
  const [transmittal, setTransmittal] = useState("pending");
  const [clearing, setClearing] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, lookupRes] = await Promise.all([
        fetch(`/api/ar/masterlist/${id}`),
        fetch("/api/ar/lookups"),
      ]);
      if (!recRes.ok) throw new Error("Failed to load");
      const recData = (await recRes.json()) as { record: Record<string, unknown> };
      setRecord(recData.record);
      setTransmittal(
        (recData.record.check_transmittal_status as string) ?? "pending",
      );
      setClearing((recData.record.check_clearing_status as string) ?? "pending");
      if (lookupRes.ok) {
        setLookups((await lookupRes.json()) as Lookup);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAssignment(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/ar/masterlist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId: portfolioId || null,
          collectorUserId: collectorId || null,
        }),
      });
      if (!res.ok) throw new Error("Assignment failed");
      setMessage("Assignment saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveCheckStatuses() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/ar/masterlist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkTransmittalStatus: transmittal,
          checkClearingStatus: clearing,
        }),
      });
      if (!res.ok) throw new Error("Failed to save check statuses");
      setMessage("Check statuses saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function turnOverRemedial() {
    if (!remedialId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/ar/masterlist/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remedialUserId: remedialId }),
      });
      if (!res.ok) throw new Error("Turnover failed");
      setMessage("Account turned over to remedial.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (!record) return <Alert>Record not found.</Alert>;

  const schedules = (record.amortization_schedules as Array<Record<string, unknown>>) ?? [];

  return (
    <div>
      <PageHeader
        title={(record.borrower_name as string) ?? "Account"}
        description={(record.loan_account_no as string) ?? undefined}
        actions={
          <Link href="/ar">
            <Button variant="secondary">Back</Button>
          </Link>
        }
      />

      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {message ? <div className="mb-4"><Alert variant="success">{message}</Alert></div> : null}

      <Card className="mb-6">
        <p className="text-sm text-neutral-500">Outstanding balance</p>
        <p className="text-2xl font-semibold">
          {Number(record.outstanding_balance).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
          })}
        </p>
        <p className="mt-2 text-sm text-neutral-600">
          {Number(record.terms)} ×{" "}
          {Number(record.monthly_amortization).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
          })}{" "}
          · Aging {String(record.aging_bucket)} · {String(record.account_status)}
        </p>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Assignment</h2>
        <form onSubmit={(e) => void saveAssignment(e)} className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Portfolio</Label>
            <Select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)}>
              <option value="">— Select —</option>
              {(lookups?.portfolios ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Collector</Label>
            <Select value={collectorId} onChange={(e) => setCollectorId(e.target.value)}>
              <option value="">— Select —</option>
              {(lookups?.collectors ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name ?? c.email}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" disabled={saving}>Save assignment</Button>
        </form>
      </Card>

      {Boolean(record.remedial_flag) ? null : (
        <Card className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Remedial turnover (91+ days)</h2>
          <div className="flex flex-wrap gap-2">
            <Select value={remedialId} onChange={(e) => setRemedialId(e.target.value)}>
              <option value="">— Remedial staff —</option>
              {(lookups?.remedialStaff ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name ?? r.email}
                </option>
              ))}
            </Select>
            <Button disabled={!remedialId || saving} onClick={() => void turnOverRemedial()}>
              Confirm turnover
            </Button>
          </div>
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Check transmittal & clearing</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Transmittal status</Label>
            <Select value={transmittal} onChange={(e) => setTransmittal(e.target.value)}>
              <option value="pending">Pending</option>
              <option value="transmitted">Transmitted</option>
              <option value="received">Received</option>
            </Select>
          </div>
          <div>
            <Label>Clearing status</Label>
            <Select value={clearing} onChange={(e) => setClearing(e.target.value)}>
              <option value="pending">Pending</option>
              <option value="clearing">Clearing (3-day)</option>
              <option value="cleared">Cleared</option>
            </Select>
          </div>
        </div>
        <Button
          className="mt-3"
          disabled={saving}
          onClick={() => void saveCheckStatuses()}
        >
          Save check statuses
        </Button>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Amortization schedule</h2>
        <ul className="divide-y divide-neutral-100 text-sm">
          {schedules.map((row) => (
            <li key={String(row.id)} className="flex justify-between py-2">
              <span>
                #{String(row.installment_no)} · {String(row.due_date)}
              </span>
              <span>
                {Number(row.amount_due).toLocaleString("en-PH", { minimumFractionDigits: 2 })}{" "}
                · {String(row.status)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
