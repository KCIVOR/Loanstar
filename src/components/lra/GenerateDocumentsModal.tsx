"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  Pagination,
  Select,
  Spinner,
  Table,
  Td,
  Th,
} from "@/components/ui";

export type DocumentPickerItem = {
  slug: string;
  name: string;
  eligibility: "always" | "optional" | "hidden";
  canGenerate: boolean;
  generated: {
    documentId: string;
    generatedAt: string;
    signedAt: string | null;
    isFinalized: boolean;
    downloadUrl: string | null;
  } | null;
};

type PickerResponse = {
  mode: "curated" | "catalog";
  items: DocumentPickerItem[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

type EligibilityFilter = "all" | "required" | "optional";
type StatusFilter = "all" | "not_generated" | "generated" | "signed";

const PAGE_SIZE = 6;

function StatusCell({ item }: { item: DocumentPickerItem }) {
  if (!item.generated) {
    return <Badge variant="neutral">Not generated</Badge>;
  }
  if (item.generated.signedAt) {
    return <Badge variant="success">Signed</Badge>;
  }
  return (
    <Badge variant="teal">
      Generated {new Date(item.generated.generatedAt).toLocaleDateString()}
    </Badge>
  );
}

export function GenerateDocumentsModal({
  open,
  onClose,
  mode,
  applicationId,
  reloadToken,
  busySlug,
  onGenerate,
}: {
  open: boolean;
  onClose: () => void;
  mode: "curated" | "catalog";
  applicationId: string;
  /** Bump to force a refetch (e.g. after a generate/regenerate/remove). */
  reloadToken: number;
  busySlug: string | null;
  onGenerate: (slug: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [eligibility, setEligibility] = useState<EligibilityFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<PickerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce the search box; any new search resets to page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        search: debouncedSearch,
        eligibility,
        status,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const res = await fetch(
        `/api/lra/applications/${applicationId}/document-picker?${qs.toString()}`,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to load documents");
      }
      setData((await res.json()) as PickerResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [applicationId, debouncedSearch, eligibility, status, page]);

  useEffect(() => {
    if (!open) return;
    void fetchPage();
  }, [open, fetchPage, reloadToken]);

  const items = data?.items ?? [];
  const pageCount = data?.pageCount ?? 1;
  const total = data?.total ?? 0;
  const shownFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const shownTo = Math.min(page * PAGE_SIZE, total);

  return (
    <Modal
      open={open}
      title="Generate release documents"
      onClose={onClose}
      className="!max-w-4xl"
    >
      <p className="mb-4 text-sm text-ink-500">
        Generate the documents this loan needs. You can regenerate or remove any
        of them afterwards from the Generated documents list.
        {mode === "curated" ? (
          <> This loan uses the standard seafarer release packet.</>
        ) : null}
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Input
            type="search"
            placeholder="Search documents by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-500">
          Requirement
          <Select
            value={eligibility}
            onChange={(e) => {
              setEligibility(e.target.value as EligibilityFilter);
              setPage(1);
            }}
          >
            <option value="all">All</option>
            <option value="required">Required</option>
            <option value="optional">Optional</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-500">
          Status
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter);
              setPage(1);
            }}
          >
            <option value="all">All</option>
            <option value="not_generated">Not generated</option>
            <option value="generated">Generated</option>
            <option value="signed">Signed</option>
          </Select>
        </label>
      </div>

      {error ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="relative min-h-[240px]">
        {loading ? (
          <div className="absolute inset-0 z-10 grid place-items-center bg-white/60">
            <Spinner />
          </div>
        ) : null}
        <Table>
          <thead>
            <tr>
              <Th>Document</Th>
              <Th>Status</Th>
              <Th num>Action</Th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <Td colSpan={3} className="text-center text-sm text-ink-400">
                  {debouncedSearch || eligibility !== "all" || status !== "all"
                    ? "No documents match these filters."
                    : "No documents available for this loan."}
                </Td>
              </tr>
            ) : (
              items.map((item) => {
                const isBusy = busySlug === item.slug;
                const finalized = item.generated?.isFinalized ?? false;
                const label = item.generated ? "Regenerate" : "Generate";
                return (
                  <tr key={item.slug}>
                    <Td className="font-medium text-ink-900">
                      {item.name}
                      {item.eligibility === "optional" ? (
                        <span className="ml-2 align-middle text-[11px] font-normal uppercase tracking-wide text-ink-400">
                          optional
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <StatusCell item={item} />
                    </Td>
                    <Td num>
                      <span className="inline-flex items-center gap-3">
                        {item.generated?.downloadUrl ? (
                          <a
                            href={item.generated.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-semibold text-teal-700 hover:underline"
                          >
                            PDF
                          </a>
                        ) : null}
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={isBusy}
                          disabled={!item.canGenerate || finalized || isBusy}
                          title={
                            !item.canGenerate
                              ? "Template not published yet"
                              : finalized
                                ? "Document is finalized"
                                : undefined
                          }
                          onClick={() => onGenerate(item.slug)}
                        >
                          {label}
                        </Button>
                      </span>
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </div>

      <div className="mt-4">
        <Pagination
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
          summary={`${shownFrom}–${shownTo} of ${total}`}
        />
      </div>
    </Modal>
  );
}
