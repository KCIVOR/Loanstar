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
} from "@/components/admin/ui";

type Setting = {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
};

export default function ConfigPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [penaltyRate, setPenaltyRate] = useState("");
  const [coverageRatio, setCoverageRatio] = useState("");
  const [aging30, setAging30] = useState("");
  const [aging60, setAging60] = useState("");
  const [aging90, setAging90] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/config");
      if (!res.ok) throw new Error("Failed to load config");
      const data = (await res.json()) as { settings: Setting[] };
      setSettings(data.settings);

      for (const s of data.settings) {
        if (s.key === "penalty_rate") setPenaltyRate(String(s.value));
        if (s.key === "coverage_ratio") setCoverageRatio(String(s.value));
        if (s.key === "aging_thresholds" && typeof s.value === "object") {
          const v = s.value as Record<string, number>;
          setAging30(String(v["30"] ?? ""));
          setAging60(String(v["60"] ?? ""));
          setAging90(String(v["90"] ?? ""));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          penalty_rate: Number(penaltyRate),
          coverage_ratio: Number(coverageRatio),
          aging_thresholds: {
            "30": Number(aging30),
            "60": Number(aging60),
            "90": Number(aging90),
          },
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to save");
      }
      setMessage("Configuration saved");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="System Config"
        description="Penalty rate, coverage ratio, and aging thresholds"
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

      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} className="max-w-md space-y-4">
          <div>
            <Label htmlFor="penalty">Penalty rate (decimal)</Label>
            <Input
              id="penalty"
              type="number"
              step="0.001"
              min="0"
              max="1"
              required
              value={penaltyRate}
              onChange={(e) => setPenaltyRate(e.target.value)}
            />
            <p className="mt-1 text-xs text-neutral-500">
              {settings.find((s) => s.key === "penalty_rate")?.description}
            </p>
          </div>
          <div>
            <Label htmlFor="coverage">Coverage ratio (decimal)</Label>
            <Input
              id="coverage"
              type="number"
              step="0.01"
              min="0"
              max="1"
              required
              value={coverageRatio}
              onChange={(e) => setCoverageRatio(e.target.value)}
            />
          </div>
          <div>
            <Label>Aging thresholds (days)</Label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <Input
                type="number"
                placeholder="30"
                value={aging30}
                onChange={(e) => setAging30(e.target.value)}
              />
              <Input
                type="number"
                placeholder="60"
                value={aging60}
                onChange={(e) => setAging60(e.target.value)}
              />
              <Input
                type="number"
                placeholder="90"
                value={aging90}
                onChange={(e) => setAging90(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save configuration"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
