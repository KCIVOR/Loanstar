"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import {
  Alert,
  Button,
  cn,
  EmptyState,
  Input,
  Label,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  StatusBadge,
  Table,
  Td,
  Th,
} from "@/components/ui";

type DocGenerationEligibility = "always" | "optional" | "hidden";

type TemplateRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
  seafarerGeneration: DocGenerationEligibility;
  smeGeneration: DocGenerationEligibility;
  publishedVersionNo: number | null;
  updatedAt: string;
};

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;

const STATUS_CHIPS: Array<{ id: "all" | "active" | "inactive"; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
];

const SEGMENT_CHIPS: Array<{ id: "all" | "seafarer" | "sme"; label: string }> = [
  { id: "all", label: "All" },
  { id: "seafarer", label: "Seafarer" },
  { id: "sme", label: "SME" },
];

export default function DocumentTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Search and filter states
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [segmentFilter, setSegmentFilter] = useState<"all" | "seafarer" | "sme">("all");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryFilter, statusFilter, segmentFilter, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * pageSize;
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
        search: debouncedSearch,
        category: categoryFilter,
        status: statusFilter === "all" ? "" : statusFilter,
        segment: segmentFilter === "all" ? "" : segmentFilter,
      });
      const res = await fetch(`/api/admin/document-templates?${params}`);
      if (!res.ok) throw new Error("Failed to load templates");
      const data = (await res.json()) as {
        templates: TemplateRow[];
        total: number;
        limit: number;
        offset: number;
      };
      setTemplates(data.templates);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, categoryFilter, statusFilter, segmentFilter]);

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

  // Extract unique categories from current templates
  const categories = useMemo(() => {
    return Array.from(
      new Set(templates.map((t) => t.category).filter((c) => c !== null)),
    ).sort();
  }, [templates]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);

  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (categoryFilter ? 1 : 0) +
    (segmentFilter !== "all" ? 1 : 0);

  const summaryStart = templates.length ? (safePage - 1) * pageSize + 1 : 0;
  const summaryEnd = (safePage - 1) * pageSize + templates.length;

  function categoryPillLabel(): string {
    return categoryFilter || "Unknown";
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

      <div className="card mb-4" style={{ overflow: "visible" }}>
        <div className="tbl-toolbar" style={{ padding: "13px 14px" }}>
          <div className="gsearch" style={{ maxWidth: 300, flex: 1, minWidth: 190 }}>
            <span className="icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              className="input"
              style={{ height: 37, paddingRight: 12, borderRadius: "var(--r-md)" }}
              placeholder="Search name, slug, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="active-pill-row">
            {statusFilter !== "all" ? (
              <span className="active-pill">
                {statusFilter === "active" ? "Active" : "Inactive"}
                <button
                  type="button"
                  aria-label="Clear status filter"
                  onClick={() => setStatusFilter("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {segmentFilter !== "all" ? (
              <span className="active-pill">
                {segmentFilter === "seafarer" ? "Seafarer" : "SME"}
                <button
                  type="button"
                  aria-label="Clear segment filter"
                  onClick={() => setSegmentFilter("all")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {categoryFilter ? (
              <span className="active-pill">
                {categoryPillLabel()}
                <button
                  type="button"
                  aria-label="Clear category filter"
                  onClick={() => setCategoryFilter("")}
                >
                  ×
                </button>
              </span>
            ) : null}
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="clear-link"
                onClick={() => {
                  setStatusFilter("all");
                  setSegmentFilter("all");
                  setCategoryFilter("");
                }}
              >
                Clear all
              </button>
            ) : null}
          </div>

          <div className="sp">
            <button
              type="button"
              className={cn("btn btn-outline", filterPanelOpen && "is-on")}
              onClick={() => setFilterPanelOpen((open) => !open)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                width={16}
                height={16}
                aria-hidden
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filters
              {activeFilterCount > 0 ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 16,
                    height: 16,
                    padding: "0 4px",
                    borderRadius: "var(--r-full)",
                    background: "var(--teal-600)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className={cn("filter-panel", filterPanelOpen && "is-open")}>
          <div className="filter-group">
            <span className="filter-group-label">Status</span>
            <div className="filter-bar">
              {STATUS_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", statusFilter === chip.id && "is-on")}
                  onClick={() => setStatusFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-group-label">Segment availability</span>
            <div className="filter-bar">
              {SEGMENT_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={cn("fchip", segmentFilter === chip.id && "is-on")}
                  onClick={() => setSegmentFilter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-group-label">Category</span>
            <div className="filter-bar">
              <button
                type="button"
                className={cn("fchip", !categoryFilter && "is-on")}
                onClick={() => setCategoryFilter("")}
              >
                All categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={cn("fchip", categoryFilter === cat && "is-on")}
                  onClick={() => setCategoryFilter(cat ?? "")}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mb-4">
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
              {Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <Td colSpan={6}>
                    <Skeleton variant="line" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : total === 0 && !search && !categoryFilter && statusFilter === "all" ? (
        <EmptyState
          title="No templates yet"
          description="Create your first document template to get started."
          action={<Button onClick={() => setShowForm(true)}>New template</Button>}
        />
      ) : templates.length === 0 ? (
        <EmptyState
          title="No matching templates"
          description="Try a different search term or filter."
          showMark={false}
        />
      ) : (
        <>
          <div className="mb-4">
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
                      <Link
                        href={`/admin/document-templates/${tpl.id}`}
                        className="hover:text-accent"
                      >
                        {tpl.name}
                      </Link>
                    </Td>
                    <Td className="mono text-sm text-ink-500">{tpl.slug}</Td>
                    <Td className="text-sm text-ink-500">{tpl.category ?? "—"}</Td>
                    <Td className="mono text-sm">
                      {tpl.publishedVersionNo
                        ? `v${tpl.publishedVersionNo}`
                        : "— (draft only)"}
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
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
              <span>Show</span>
              <Select
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                }}
                style={{ width: 72, height: 34 }}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
              <span>per page</span>
            </div>
            <Pagination
              page={safePage}
              pageCount={pageCount}
              onPageChange={setPage}
              summary={`Showing ${summaryStart}–${summaryEnd} of ${total}`}
            />
          </div>
        </>
      )}
    </div>
  );
}
