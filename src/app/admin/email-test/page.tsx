"use client";

import { FormEvent, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
} from "@/components/ui";

const TEMPLATE_OPTIONS = [
  { value: "test", label: "Generic test" },
  { value: "application_denied", label: "Application denied" },
  { value: "application_approved", label: "Application approved" },
] as const;

type TemplateSlug = (typeof TEMPLATE_OPTIONS)[number]["value"];

export default function EmailTestPage() {
  const [to, setTo] = useState("");
  const [templateSlug, setTemplateSlug] = useState<TemplateSlug>("test");
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
        body: JSON.stringify({ to, templateSlug }),
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
        description="Send a test email using a seeded template via SMTP"
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
        <h2 className="mb-4 font-display text-lg font-semibold text-navy-900">
          Send test email
        </h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <Label htmlFor="email-to" required>
              Recipient email
            </Label>
            <Input
              id="email-to"
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="email-template">Template</Label>
            <Select
              id="email-template"
              value={templateSlug}
              onChange={(e) => setTemplateSlug(e.target.value as TemplateSlug)}
            >
              {TEMPLATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-ink-500">
            Loads the selected slug from <span className="mono">email_templates</span>{" "}
            via SMTP on System Config. Edit Approve/Deny copy at{" "}
            <span className="mono">/admin/email-templates</span>. Requires Email
            enabled and complete SMTP credentials under Admin → Config.
          </p>
          <Button type="submit" loading={loading}>
            Send test email
          </Button>
        </form>
      </Card>
    </div>
  );
}
