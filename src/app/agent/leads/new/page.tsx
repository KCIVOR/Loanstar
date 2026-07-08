"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
} from "@/components/admin/ui";

export default function NewLeadPage() {
  const router = useRouter();
  const [borrowerName, setBorrowerName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/agent/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrowerName,
          businessName: businessName || undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to create lead");
      }

      const data = (await res.json()) as { lead: { id: string } };
      router.push(`/agent/leads/${data.lead.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create lead");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New lead"
        description="Enter borrower details to start a lead"
        actions={
          <Link href="/agent">
            <Button variant="secondary">Back to leads</Button>
          </Link>
        }
      />

      <Card className="max-w-lg">
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}

          <div>
            <Label htmlFor="borrowerName">Borrower name</Label>
            <Input
              id="borrowerName"
              required
              value={borrowerName}
              onChange={(e) => setBorrowerName(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="businessName">Business / agency name</Label>
            <Input
              id="businessName"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create lead"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
