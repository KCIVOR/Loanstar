"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Spinner,
  Textarea,
} from "@/components/ui";

type EmailTemplate = {
  slug: string;
  name: string;
  subject: string;
  bodyHtml: string;
  updatedAt: string;
};

const SAMPLE_BORROWER_NAME = "Juan Dela Cruz";

const CARDS: Array<{
  slug: "application_denied" | "application_approved";
  title: string;
  badgeVariant: "danger" | "success";
  badgeLabel: string;
  showRejectCallout?: boolean;
}> = [
  {
    slug: "application_denied",
    title: "Reject",
    badgeVariant: "danger",
    badgeLabel: "application_denied",
    showRejectCallout: true,
  },
  {
    slug: "application_approved",
    title: "Accept",
    badgeVariant: "success",
    badgeLabel: "application_approved",
  },
];

function previewHtml(bodyHtml: string): string {
  return bodyHtml.replaceAll("{{borrower_name}}", SAMPLE_BORROWER_NAME);
}

export default function DecisionEmailTemplatesPage() {
  const [templates, setTemplates] = useState<
    Record<string, { subject: string; bodyHtml: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingSlug, setSavingSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/email-templates");
      const body = (await res.json()) as {
        error?: string;
        templates?: EmailTemplate[];
      };
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to load email templates");
      }

      const next: Record<string, { subject: string; bodyHtml: string }> = {};
      for (const t of body.templates ?? []) {
        next[t.slug] = { subject: t.subject, bodyHtml: t.bodyHtml };
      }
      setTemplates(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateField(
    slug: string,
    field: "subject" | "bodyHtml",
    value: string,
  ) {
    setTemplates((prev) => ({
      ...prev,
      [slug]: {
        subject: prev[slug]?.subject ?? "",
        bodyHtml: prev[slug]?.bodyHtml ?? "",
        [field]: value,
      },
    }));
  }

  async function handleSave(slug: string) {
    const current = templates[slug];
    if (!current) return;

    setSavingSlug(slug);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/email-templates/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: current.subject,
          bodyHtml: current.bodyHtml,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        template?: EmailTemplate;
      };
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to save template");
      }
      if (body.template) {
        setTemplates((prev) => ({
          ...prev,
          [slug]: {
            subject: body.template!.subject,
            bodyHtml: body.template!.bodyHtml,
          },
        }));
      }
      setMessage(`Saved ${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingSlug(null);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Decision Emails"
          description="Edit Accept/Reject SMTP templates. Keep the Meridian header, logo, and footer when changing copy."
        />
        <div className="flex items-center gap-2 text-ink-500">
          <Spinner />
          <span className="text-sm">Loading templates…</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Decision Emails"
        description="Edit Accept/Reject SMTP templates. Keep the Meridian header, logo, and footer when changing copy."
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

      <p className="mb-4 text-sm text-ink-500">
        SMTP is configured under{" "}
        <Link
          href="/admin/config"
          className="font-medium text-navy-700 underline underline-offset-2 hover:text-navy-900"
        >
          Admin → Config
        </Link>
        . Send a test from{" "}
        <Link
          href="/admin/email-test"
          className="font-medium text-navy-700 underline underline-offset-2 hover:text-navy-900"
        >
          Email Test
        </Link>
        .
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {CARDS.map((card) => {
          const draft = templates[card.slug] ?? {
            subject: "",
            bodyHtml: "",
          };
          const missing = !templates[card.slug];

          return (
            <Card key={card.slug}>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-navy-900">
                  {card.title}
                </h2>
                <Badge variant={card.badgeVariant}>{card.badgeLabel}</Badge>
              </div>

              {card.showRejectCallout ? (
                <div className="mb-4">
                  <Alert variant="warning">
                    Do not include why the loan was denied. Reasons are
                    confidential.
                  </Alert>
                </div>
              ) : null}

              {missing ? (
                <Alert className="mb-4">
                  Template &quot;{card.slug}&quot; was not found. Seed it before
                  editing.
                </Alert>
              ) : null}

              <div className="space-y-4">
                <div>
                  <Label htmlFor={`${card.slug}-subject`} required>
                    Subject
                  </Label>
                  <Input
                    id={`${card.slug}-subject`}
                    value={draft.subject}
                    onChange={(e) =>
                      updateField(card.slug, "subject", e.target.value)
                    }
                    disabled={missing}
                  />
                </div>

                <div>
                  <Label htmlFor={`${card.slug}-body`} required>
                    Body (HTML)
                  </Label>
                  <Textarea
                    id={`${card.slug}-body`}
                    rows={10}
                    className="font-mono text-sm"
                    value={draft.bodyHtml}
                    onChange={(e) =>
                      updateField(card.slug, "bodyHtml", e.target.value)
                    }
                    disabled={missing}
                  />
                  <p className="mt-1 text-xs text-ink-500">
                    Allowed variable:{" "}
                    <code className="rounded bg-surface-2 px-1 py-0.5">
                      {"{{borrower_name}}"}
                    </code>
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-navy-900">
                    Preview
                  </p>
                  <div
                    className="min-h-[8rem] rounded-md border border-line-soft bg-white p-4 text-sm text-ink-700"
                    dangerouslySetInnerHTML={{
                      __html: previewHtml(draft.bodyHtml),
                    }}
                  />
                  <p className="mt-1 text-xs text-ink-500">
                    Sample name: {SAMPLE_BORROWER_NAME}
                  </p>
                </div>

                <Button
                  type="button"
                  loading={savingSlug === card.slug}
                  disabled={missing || savingSlug !== null}
                  onClick={() => void handleSave(card.slug)}
                >
                  Save
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
