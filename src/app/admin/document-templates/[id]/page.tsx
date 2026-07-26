"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";
import { useParams } from "next/navigation";

import { TemplateEditor } from "@/components/admin/TemplateEditor";
import {
  Alert,
  Badge,
  Button,
  PageHeader,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";

type TemplateStatus = "draft" | "published" | "archived";

type Version = {
  id: string;
  versionNo: number;
  status: TemplateStatus;
  publishedAt: string | null;
  updatedAt: string;
  body: string;
};

type Template = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
};

const STARTER_BODY =
  '<h1>{{companyName}}</h1><p>Edit this template. Use the field palette on the right to insert merge fields.</p>';

function statusVariant(status: TemplateStatus): "success" | "warning" | "neutral" {
  if (status === "published") return "success";
  if (status === "draft") return "warning";
  return "neutral";
}

export default function TemplateEditorPage() {
  const params = useParams<{ id: string }>();
  const templateId = params.id;

  const [template, setTemplate] = useState<Template | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/document-templates/${templateId}`);
      if (!res.ok) throw new Error("Failed to load template");
      const data = (await res.json()) as { template: Template; versions: Version[] };
      setTemplate(data.template);
      setVersions(data.versions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const draft = versions.find((v) => v.status === "draft") ?? null;
  const published = versions.find((v) => v.status === "published") ?? null;
  const editorInitial = draft?.body ?? published?.body ?? STARTER_BODY;

  async function handleSaveDraft(body: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/document-templates/${templateId}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const b = (await res.json()) as { error?: string };
        throw new Error(b.error ?? "Failed to save draft");
      }
      setMessage("Draft saved");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!draft) return;
    setPublishing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/document-templates/${templateId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: draft.id }),
      });
      if (!res.ok) {
        const b = (await res.json()) as { error?: string };
        throw new Error(b.error ?? "Failed to publish");
      }
      setMessage(`Published v${draft.versionNo}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  }

  if (loading) return <Spinner />;
  if (!template) return <Alert>{error ?? "Template not found"}</Alert>;

  return (
    <div>
      <div className="mb-2">
        <Link href="/admin/document-templates" className="text-sm text-ink-400 hover:text-accent">
          ← All templates
        </Link>
      </div>
      <PageHeader
        title={template.name}
        description={
          template.description ??
          `Slug: ${template.slug}${template.category ? ` · ${template.category}` : ""}`
        }
        actions={
          <Button onClick={() => void handlePublish()} loading={publishing} disabled={!draft}>
            {draft ? `Publish v${draft.versionNo}` : "No draft to publish"}
          </Button>
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

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-ink-500">
        {published ? (
          <span>
            Live: <span className="mono">v{published.versionNo}</span>
          </span>
        ) : (
          <span>No published version yet — generation still uses the legacy renderer.</span>
        )}
        {draft ? (
          <Badge variant="warning">Unpublished draft v{draft.versionNo}</Badge>
        ) : null}
      </div>

      <TemplateEditor
        key={editorInitial.length /* reseed when the loaded body changes */}
        initialBody={editorInitial}
        onSaveDraft={handleSaveDraft}
        saving={saving}
      />

      {versions.length > 0 ? (
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-ink-700">Version history</h2>
          <Table>
            <thead>
              <tr>
                <Th>Version</Th>
                <Th>Status</Th>
                <Th>Published</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <Td className="mono">v{v.versionNo}</Td>
                  <Td>
                    <Badge variant={statusVariant(v.status)}>{v.status}</Badge>
                  </Td>
                  <Td className="mono text-xs text-ink-400">
                    {v.publishedAt ? new Date(v.publishedAt).toLocaleString() : "—"}
                  </Td>
                  <Td className="mono text-xs text-ink-400">
                    {new Date(v.updatedAt).toLocaleString()}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
