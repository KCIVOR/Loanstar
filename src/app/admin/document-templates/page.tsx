"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import Link from "next/link";

import {
  Alert,
  Button,
  Input,
  Label,
  Modal,
  PageHeader,
  Spinner,
  StatusBadge,
  Table,
  Td,
  Th,
} from "@/components/ui";

type TemplateRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
  publishedVersionNo: number | null;
  updatedAt: string;
};

export default function DocumentTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/document-templates");
      if (!res.ok) throw new Error("Failed to load templates");
      const data = (await res.json()) as { templates: TemplateRow[] };
      setTemplates(data.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/document-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim(),
          name: name.trim(),
          category: category.trim() || null,
          description: description.trim() || null,
        }),
      });
      if (!res.ok) {
        const b = (await res.json()) as { error?: string };
        throw new Error(b.error ?? "Failed to create template");
      }
      setMessage("Template created");
      setShowForm(false);
      setSlug("");
      setName("");
      setCategory("");
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Document Templates"
        description="Superadmin-editable, versioned templates for system-generated documents"
        actions={<Button onClick={() => setShowForm(true)}>New template</Button>}
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
        title="New document template"
        onClose={() => setShowForm(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="new-template-form" loading={saving}>
              Create template
            </Button>
          </>
        }
      >
        <form id="new-template-form" onSubmit={(e) => void handleCreate(e)} className="space-y-4">
          <div>
            <Label htmlFor="tpl-name" required>
              Name
            </Label>
            <Input
              id="tpl-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Demand Letter"
            />
          </div>
          <div>
            <Label htmlFor="tpl-slug" required>
              Slug
            </Label>
            <Input
              id="tpl-slug"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="demand_letter"
              className="mono"
            />
            <p className="mt-1 text-xs text-ink-400">
              Lowercase letters, numbers, underscores. Generators resolve
              documents by this slug (e.g. <code>blri</code>,{" "}
              <code>promissory_note</code>).
            </p>
          </div>
          <div>
            <Label htmlFor="tpl-category">Category</Label>
            <Input
              id="tpl-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="release"
            />
          </div>
          <div>
            <Label htmlFor="tpl-desc">Description</Label>
            <Input
              id="tpl-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Final demand letter for 30-day defaults"
            />
          </div>
        </form>
      </Modal>

      {loading ? (
        <Spinner />
      ) : templates.length === 0 ? (
        <Alert>No templates yet. Create one to get started.</Alert>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Slug</Th>
              <Th>Category</Th>
              <Th>Published</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {templates.map((tpl) => (
              <tr key={tpl.id}>
                <Td className="font-medium text-ink-900">
                  <Link href={`/admin/document-templates/${tpl.id}`} className="hover:text-accent">
                    {tpl.name}
                  </Link>
                </Td>
                <Td className="mono text-sm text-ink-500">{tpl.slug}</Td>
                <Td className="text-sm text-ink-500">{tpl.category ?? "—"}</Td>
                <Td className="mono text-sm">
                  {tpl.publishedVersionNo ? `v${tpl.publishedVersionNo}` : "— (draft only)"}
                </Td>
                <Td>
                  <StatusBadge active={tpl.isActive} />
                </Td>
                <Td className="mono text-xs text-ink-400">
                  {new Date(tpl.updatedAt).toLocaleString()}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
