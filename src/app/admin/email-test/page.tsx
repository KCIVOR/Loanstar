"use client";

import { FormEvent, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
} from "@/components/admin/ui";

export default function EmailTestPage() {
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, templateSlug: "test" }),
      });
      const body = (await res.json()) as { error?: string; subject?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to send test email");
      }
      setMessage(`Test email sent: "${body.subject}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Email Test"
        description="Send a test email using the seeded template"
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

      <Card className="max-w-md">
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <Label htmlFor="email-to">Recipient email</Label>
            <Input
              id="email-to"
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <p className="text-xs text-zinc-500">
            Uses template slug &quot;test&quot; via Resend. Requires RESEND_API_KEY.
          </p>
          <Button type="submit" disabled={loading}>
            {loading ? "Sending…" : "Send test email"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
