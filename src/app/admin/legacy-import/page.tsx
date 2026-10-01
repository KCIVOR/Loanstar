"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  FileDropzone,
  Input,
  PageHeader,
  Select,
  Stepper,
  Table,
  Td,
  Th,
  type StepperStep,
} from "@/components/ui";
import { toCsv } from "@/lib/legacy-import/csv";
import {
  type ColumnMapping,
  type LegacySegment,
  FIELD_BY_KEY,
  canValidate,
  duplicateTargets,
  fieldsForSegment,
  requiredCoverage,
} from "@/lib/legacy-import/fields";
import {
  type CellOverrides,
  applyOverrides,
  flaggedColumns,
  mergeResults,
  templateCsv,
} from "@/lib/legacy-import/fixes";
import { type CellValue, isBlankRow } from "@/lib/legacy-import/normalize";
import { type LoadedWorkbook, parseLegacyFile } from "@/lib/legacy-import/parse-file";
import { suggestMapping } from "@/lib/legacy-import/suggest";
import {
  type InputRow,
  type RowResult,
  flagDuplicateLoanNos,
  summarize,
} from "@/lib/legacy-import/validate";

type Preset = {
  id: string;
  name: string;
  segment: LegacySegment;
  header_row: number;
  mapping: ColumnMapping[];
  updated_at: string;
};

type Step = "upload" | "map" | "review" | "import";
type ReviewFilter = "issues" | "error" | "warning" | "all";

const STEPS: { key: Step; label: string; description: string }[] = [
  { key: "upload", label: "Upload", description: "File, sheet & segment" },
  { key: "map", label: "Map", description: "File column → system field" },
  { key: "review", label: "Review & Fix", description: "Validate and correct rows" },
  { key: "import", label: "Import", description: "Write to the system" },
];

const CHUNK_SIZE = 1000;
const RESULT_PREVIEW_LIMIT = 500;

async function readError(res: Response, fallback: string) {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

function downloadText(text: string, name: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LegacyImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<LoadedWorkbook | null>(null);
  const [sheetName, setSheetName] = useState<string>("");
  const [headerRow, setHeaderRow] = useState(1);
  const [segment, setSegment] = useState<LegacySegment>("seafarer");
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetId, setPresetId] = useState<string>("");
  const [presetName, setPresetName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Review: raw per-row results (before the file-wide duplicate pass), cell fixes, exclusions.
  const [rawResults, setRawResults] = useState<RowResult[] | null>(null);
  const [overrides, setOverrides] = useState<CellOverrides>({});
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<ReviewFilter>("issues");

  const sheetNames = workbook?.sheetNames ?? [];
  const sheet = useMemo(
    () => (workbook && sheetName ? { name: sheetName, rows: workbook.readSheet(sheetName) } : null),
    [workbook, sheetName],
  );

  const headers = useMemo<CellValue[]>(
    () => (sheet ? (sheet.rows[headerRow - 1] ?? []) : []),
    [sheet, headerRow],
  );

  const dataRows = useMemo<InputRow[]>(() => {
    if (!sheet) return [];
    const out: InputRow[] = [];
    for (let i = headerRow; i < sheet.rows.length; i++) {
      const cells = sheet.rows[i];
      if (!cells || isBlankRow(cells)) continue;
      out.push({ rowNumber: i + 1, cells });
    }
    return out;
  }, [sheet, headerRow]);

  const rowByNumber = useMemo(() => new Map(dataRows.map((r) => [r.rowNumber, r])), [dataRows]);

  const resetReview = () => {
    setRawResults(null);
    setOverrides({});
    setExcluded(new Set());
    setEditing(null);
  };

  const pendingPreset = useRef<Preset | null>(null);

  // Re-suggest whenever the header row / sheet / segment changes; a preset
  // being loaded takes precedence over the suggestion (by column index).
  useEffect(() => {
    const base = headers.length ? suggestMapping(headers, segment) : [];
    const p = pendingPreset.current;
    pendingPreset.current = null;
    setMapping(
      p
        ? base.map((m) => ({ ...m, target: p.mapping.find((x) => x.index === m.index)?.target ?? null }))
        : base,
    );
    resetReview();
  }, [headers, segment]);

  const loadPresets = useCallback(async () => {
    const res = await fetch("/api/admin/legacy-import/mappings");
    if (!res.ok) {
      setError(await readError(res, "Failed to load saved mappings"));
      return;
    }
    const data = (await res.json()) as { mappings: Preset[] };
    setPresets(data.mappings);
  }, []);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setNotice(null);
    resetReview();
    setBusy("Reading file…");
    try {
      const parsed = await parseLegacyFile(file);
      setWorkbook(parsed);
      setFileName(file.name);
      const names = parsed.sheetNames;
      const preferred =
        names.find((n) => /^(sf|sme) import$/i.test(n)) ??
        names.find((n) => n.toLowerCase() === "data") ??
        names[0];
      setSheetName(preferred ?? "");
      const hint = `${preferred ?? ""} ${file.name}`;
      if (/sme/i.test(hint)) setSegment("sme");
      else if (/sf|seafarer/i.test(hint)) setSegment("seafarer");
      setHeaderRow(preferred && /import$/i.test(preferred) ? 2 : 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
      setWorkbook(null);
      setFileName(null);
    } finally {
      setBusy(null);
    }
  };

  const changeFile = () => {
    setWorkbook(null);
    setFileName(null);
    setSheetName("");
    setMapping([]);
    resetReview();
    setError(null);
    setNotice(null);
    setStep("upload");
  };

  const segmentFields = useMemo(() => fieldsForSegment(segment), [segment]);
  const dupes = useMemo(() => new Set(duplicateTargets(mapping)), [mapping]);
  const coverage = useMemo(() => requiredCoverage(mapping, segment), [mapping, segment]);
  const missingGating = coverage.filter((c) => !c.covered && c.gating);
  const missingWarn = coverage.filter((c) => !c.covered && !c.gating);
  const mappedCount = mapping.filter((m) => m.target).length;
  const mappingReady = mapping.length > 0 && dataRows.length > 0 && canValidate(mapping, segment);

  const setTarget = (index: number, target: string | null) => {
    setMapping((prev) => prev.map((m) => (m.index === index ? { ...m, target } : m)));
    resetReview();
  };

  const applyPreset = (p: Preset) => {
    setPresetName(p.name);
    setNotice(`Loaded mapping "${p.name}".`);
    if (p.segment === segment && p.header_row === headerRow) {
      setMapping((prev) =>
        prev.map((m) => ({ ...m, target: p.mapping.find((x) => x.index === m.index)?.target ?? null })),
      );
      resetReview();
      return;
    }
    pendingPreset.current = p;
    setSegment(p.segment);
    setHeaderRow(p.header_row);
  };

  const savePreset = async () => {
    const name = presetName.trim();
    if (!name) {
      setError("Enter a name for the mapping.");
      return;
    }
    const exists = presets.some((p) => p.name === name);
    if (exists && !window.confirm(`Overwrite the saved mapping "${name}"?`)) return;
    setError(null);
    setBusy("Saving mapping…");
    try {
      const res = await fetch("/api/admin/legacy-import/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, segment, header_row: headerRow, mapping, overwrite: exists }),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to save mapping"));
      const data = (await res.json()) as { mapping: Preset };
      setPresetId(data.mapping.id);
      setNotice(`Saved mapping "${name}".`);
      await loadPresets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mapping");
    } finally {
      setBusy(null);
    }
  };

  const deletePreset = async () => {
    const p = presets.find((x) => x.id === presetId);
    if (!p || !window.confirm(`Delete the saved mapping "${p.name}"?`)) return;
    setBusy("Deleting mapping…");
    try {
      const res = await fetch(`/api/admin/legacy-import/mappings?id=${encodeURIComponent(p.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to delete mapping"));
      setPresetId("");
      setNotice(`Deleted mapping "${p.name}".`);
      await loadPresets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete mapping");
    } finally {
      setBusy(null);
    }
  };

  const validateChunked = async (rows: InputRow[], label: (from: number, to: number) => string) => {
    const active = mapping.filter((m) => m.target);
    const all: RowResult[] = [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      setBusy(label(i + 1, Math.min(i + CHUNK_SIZE, rows.length)));
      const res = await fetch("/api/admin/legacy-import/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment, mapping: active, rows: rows.slice(i, i + CHUNK_SIZE) }),
      });
      if (!res.ok) throw new Error(await readError(res, "Validation failed"));
      const data = (await res.json()) as { results: RowResult[] };
      all.push(...data.results);
    }
    return all;
  };

  // Final results = raw results + file-wide duplicate pass, minus excluded rows.
  const results = useMemo(() => {
    if (!rawResults) return null;
    return flagDuplicateLoanNos(rawResults.filter((r) => !excluded.has(r.rowNumber)));
  }, [rawResults, excluded]);
  const summary = useMemo(() => (results ? summarize(results) : null), [results]);

  const runValidation = async () => {
    setError(null);
    setNotice(null);
    setEditing(null);
    try {
      const rows = dataRows.map((r) => applyOverrides(r, overrides));
      const all = await validateChunked(
        rows,
        (from, to) => `Validating rows ${from}–${to} of ${rows.length}…`,
      );
      setRawResults(all);
      setStep("review");

      const final = flagDuplicateLoanNos(all.filter((r) => !excluded.has(r.rowNumber)));
      const s = summarize(final);
      const runRes = await fetch("/api/admin/legacy-import/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: fileName ?? "unknown",
          segment,
          mapping_id: presets.some((p) => p.id === presetId) ? presetId : null,
          mapping,
          total_rows: s.total,
          valid_rows: s.valid + s.warning,
          warning_rows: s.warning,
          error_rows: s.error,
        }),
      });
      if (!runRes.ok) setError(await readError(runRes, "Validated, but the audit log entry failed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setBusy(null);
    }
  };

  const startEdit = (rowNumber: number) => {
    const row = rowByNumber.get(rowNumber);
    if (!row) return;
    const fixed = applyOverrides(row, overrides);
    const d: Record<number, string> = {};
    for (const m of mapping) {
      if (!m.target) continue;
      const v = fixed.cells[m.index];
      d[m.index] = v === null || v === undefined ? "" : String(v);
    }
    setDraft(d);
    setEditing(rowNumber);
  };

  const saveFix = async (rowNumber: number) => {
    const row = rowByNumber.get(rowNumber);
    if (!row || !rawResults) return;
    const original = row.cells;
    const changed: Record<number, string> = {};
    for (const [idx, value] of Object.entries(draft)) {
      const i = Number(idx);
      const before = original[i];
      const beforeStr = before === null || before === undefined ? "" : String(before);
      if (value !== beforeStr) changed[i] = value;
    }
    const nextOverrides = { ...overrides };
    if (Object.keys(changed).length) nextOverrides[rowNumber] = changed;
    else delete nextOverrides[rowNumber];
    setError(null);
    try {
      const [updated] = await validateChunked(
        [applyOverrides(row, nextOverrides)],
        () => `Re-checking row ${rowNumber}…`,
      );
      setOverrides(nextOverrides);
      if (updated) setRawResults(mergeResults(rawResults, [updated]));
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-check failed");
    } finally {
      setBusy(null);
    }
  };

  const toggleExcluded = (rowNumber: number) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
    if (editing === rowNumber) setEditing(null);
  };

  const downloadReport = () => {
    if (!rawResults) return;
    const finalByRow = new Map((results ?? []).map((r) => [r.rowNumber, r]));
    const rows: unknown[][] = [
      ["Row", "Status", "Legacy Borrower No.", "Legacy Loan No.", "Name", "Fixed in review", "Errors", "Warnings"],
      ...rawResults.map((raw) => {
        const r = finalByRow.get(raw.rowNumber) ?? raw;
        const isExcluded = excluded.has(raw.rowNumber);
        return [
          r.rowNumber,
          isExcluded ? "excluded" : r.status,
          r.legacyBorrowerNo ?? "",
          r.legacyLoanNo ?? "",
          r.name ?? "",
          overrides[r.rowNumber] ? "yes" : "",
          isExcluded ? "" : r.errors.join(" | "),
          isExcluded ? "" : r.warnings.join(" | "),
        ];
      }),
    ];
    downloadText(
      toCsv(rows),
      `legacy-import-validation-${(fileName ?? "file").replace(/\.[^.]+$/, "")}.csv`,
    );
  };

  const fixedCount = Object.keys(overrides).length;
  const finalByRow = useMemo(() => new Map((results ?? []).map((r) => [r.rowNumber, r])), [results]);
  const reviewRows = useMemo(() => {
    if (!rawResults) return [];
    return rawResults
      .map((raw) => ({ raw, final: finalByRow.get(raw.rowNumber) ?? null }))
      .filter(({ raw, final }) => {
        const status = final?.status ?? raw.status;
        const isExcluded = excluded.has(raw.rowNumber);
        if (filter === "all") return true;
        if (filter === "issues") return isExcluded || status !== "valid";
        return !isExcluded && status === filter;
      });
  }, [rawResults, finalByRow, excluded, filter]);

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const stepperSteps: StepperStep[] = STEPS.map((s, i) => ({
    label: s.label,
    description: s.description,
    state: i < stepIndex ? "done" : i === stepIndex ? "current" : "todo",
  }));

  return (
    <div>
      <PageHeader
        title="Legacy Data Import"
        description="Upload a legacy SF/SME sheet, map its columns, then review and fix rows before import. Nothing is written to borrowers or loans yet."
      />

      <Card className="mb-6">
        <Stepper steps={stepperSteps} />
      </Card>

      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {notice ? <div className="mb-4"><Alert variant="success">{notice}</Alert></div> : null}
      {busy ? <div className="mb-4"><Alert variant="info">{busy}</Alert></div> : null}

      {/* ── Step 1: Upload ─────────────────────────────────────────────── */}
      {step === "upload" ? (
        <Card className="mb-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-navy-900">Upload file</h2>
              <p className="text-sm text-slate-600">
                Any .xlsx, .xlsm or .csv. You will match its columns to system fields in the next step.
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => downloadText(templateCsv("seafarer"), "legacy-import-template-sf.csv")}>
                SF template
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => downloadText(templateCsv("sme"), "legacy-import-template-sme.csv")}>
                SME template
              </Button>
            </div>
          </div>

          {fileName && workbook ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-navy-900">{fileName}</p>
                <p className="text-xs text-slate-500">
                  {sheetNames.length} sheet(s) · {dataRows.length} non-blank data row(s) below header row {headerRow}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={changeFile}>
                Change file
              </Button>
            </div>
          ) : (
            <FileDropzone
              className="mb-4"
              accept=".xlsx,.xlsm,.csv"
              hint="XLSX, XLSM or CSV"
              disabled={Boolean(busy)}
              onFiles={(files) => void onFile(files[0])}
            />
          )}

          {workbook ? (
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Sheet</span>
                <Select value={sheetName} onChange={(e) => setSheetName(e.target.value)}>
                  {sheetNames.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Header row</span>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={headerRow}
                    onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => setHeaderRow(2)}>
                    Template (2)
                  </Button>
                </div>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Segment</span>
                <Select value={segment} onChange={(e) => setSegment(e.target.value as LegacySegment)}>
                  <option value="seafarer">Seafarer (SF)</option>
                  <option value="sme">SME</option>
                </Select>
              </label>
            </div>
          ) : null}

          <div className="mt-6 flex justify-end">
            <Button type="button" disabled={!workbook || !dataRows.length || Boolean(busy)} onClick={() => setStep("map")}>
              Continue to mapping →
            </Button>
          </div>
        </Card>
      ) : null}

      {/* ── Step 2: Map ────────────────────────────────────────────────── */}
      {step === "map" ? (
        <>
          <Card className="mb-6">
            <h2 className="mb-3 font-display text-lg font-semibold text-navy-900">Saved mappings</h2>
            <div className="grid gap-3 md:grid-cols-4">
              <Select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                <option value="">— Select a saved mapping —</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.segment}, header row {p.header_row})</option>
                ))}
              </Select>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!presetId || !headers.length || Boolean(busy)}
                  onClick={() => {
                    const p = presets.find((x) => x.id === presetId);
                    if (p) applyPreset(p);
                  }}
                >
                  Load
                </Button>
                <Button type="button" variant="danger-soft" disabled={!presetId || Boolean(busy)} onClick={() => void deletePreset()}>
                  Delete
                </Button>
              </div>
              <Input placeholder="Mapping name" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
              <Button type="button" disabled={!mapping.length || Boolean(busy)} onClick={() => void savePreset()}>
                {presets.some((p) => p.name === presetName.trim()) ? "Overwrite mapping" : "Save mapping"}
              </Button>
            </div>
          </Card>

          <Card className="mb-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-navy-900">Map columns</h2>
              <span className="text-sm text-slate-600">
                {fileName} · {mappedCount} of {mapping.length} column(s) mapped · {dataRows.length} row(s)
              </span>
            </div>
            {missingGating.length ? (
              <div className="mb-3">
                <Alert variant="warning">
                  Required fields not mapped: {missingGating.map((c) => c.label).join(", ")}
                </Alert>
              </div>
            ) : null}
            {missingWarn.length ? (
              <div className="mb-3">
                <Alert variant="info">
                  Required by the system but absent from legacy files (reported as row warnings, not blocking):{" "}
                  {missingWarn.map((c) => c.label).join(", ")}
                </Alert>
              </div>
            ) : null}
            {dupes.size ? (
              <div className="mb-3">
                <Alert>
                  The same target is mapped more than once:{" "}
                  {[...dupes].map((k) => FIELD_BY_KEY.get(k)?.label ?? k).join(", ")}
                </Alert>
              </div>
            ) : null}
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>#</Th>
                    <Th>File header</Th>
                    <Th>Sample values</Th>
                    <Th>Maps to</Th>
                  </tr>
                </thead>
                <tbody>
                  {mapping.map((m) => (
                    <tr key={m.index}>
                      <Td>{m.index + 1}</Td>
                      <Td>{m.header || <span className="text-slate-400">(blank)</span>}</Td>
                      <Td className="max-w-xs truncate text-xs text-slate-600">
                        {dataRows
                          .slice(0, 3)
                          .map((r) => r.cells[m.index])
                          .filter((v) => v !== null && v !== undefined && v !== "")
                          .map(String)
                          .join(" · ")}
                      </Td>
                      <Td>
                        <Select
                          value={m.target ?? ""}
                          onChange={(e) => setTarget(m.index, e.target.value || null)}
                          className={m.target && dupes.has(m.target) ? "border-red-500" : undefined}
                        >
                          <option value="">Ignore</option>
                          {segmentFields.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}{f.required ? " *" : ""}
                            </option>
                          ))}
                        </Select>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="mt-4 flex flex-wrap justify-between gap-3">
              <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => setStep("upload")}>
                ← Back to upload
              </Button>
              <Button type="button" disabled={!mappingReady || Boolean(busy)} onClick={() => void runValidation()}>
                Validate &amp; review →
              </Button>
            </div>
          </Card>
        </>
      ) : null}

      {/* ── Step 3: Review & Fix ───────────────────────────────────────── */}
      {step === "review" && summary && rawResults ? (
        <Card className="mb-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-navy-900">Review &amp; fix</h2>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => void runValidation()}>
                Re-validate all
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={downloadReport}>
                Download report (CSV)
              </Button>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: "Included", value: summary.total, cls: "text-navy-900" },
              { label: "Valid", value: summary.valid, cls: "text-green-700" },
              { label: "Warnings", value: summary.warning, cls: "text-amber-700" },
              { label: "Errors", value: summary.error, cls: "text-red-700" },
              { label: "Excluded", value: excluded.size, cls: "text-slate-500" },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-slate-200 p-3 text-center">
                <p className={`text-2xl font-bold ${k.cls}`}>{k.value}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
              </div>
            ))}
          </div>

          {summary.error > 0 ? (
            <div className="mb-4">
              <Alert variant="warning">
                {summary.error} row(s) have errors. Click <strong>Fix</strong> to correct the values in place, or{" "}
                <strong>Exclude</strong> rows that should not be imported.
                {fixedCount ? ` ${fixedCount} row(s) fixed so far.` : ""}
              </Alert>
            </div>
          ) : (
            <div className="mb-4">
              <Alert variant="success">
                No errors in the {summary.total} included row(s)
                {summary.warning ? ` (${summary.warning} with warnings)` : ""}. Ready for import.
              </Alert>
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">Show:</span>
            <Select value={filter} onChange={(e) => setFilter(e.target.value as ReviewFilter)} className="w-auto">
              <option value="issues">Rows with issues</option>
              <option value="error">Errors only</option>
              <option value="warning">Warnings only</option>
              <option value="all">All rows</option>
            </Select>
            <span className="text-slate-500">{reviewRows.length} row(s)</span>
          </div>

          {reviewRows.length ? (
            <div className="max-h-[70vh] overflow-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Row</Th>
                    <Th>Status</Th>
                    <Th>Loan No.</Th>
                    <Th>Name</Th>
                    <Th>Issues</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {reviewRows.slice(0, RESULT_PREVIEW_LIMIT).map(({ raw, final }) => {
                    const r = final ?? raw;
                    const isExcluded = excluded.has(raw.rowNumber);
                    const isEditing = editing === raw.rowNumber;
                    const flagged = isEditing ? flaggedColumns(r, mapping) : null;
                    return (
                      <Fragment key={raw.rowNumber}>
                        <tr className={isExcluded ? "opacity-50" : r.status === "error" ? "bg-red-50" : undefined}>
                          <Td>{r.rowNumber}</Td>
                          <Td>
                            {isExcluded ? (
                              <Badge variant="neutral">Excluded</Badge>
                            ) : (
                              <Badge variant={r.status === "error" ? "danger" : r.status === "warning" ? "warning" : "success"}>
                                {r.status}
                              </Badge>
                            )}
                            {overrides[r.rowNumber] ? <div className="mt-1 text-xs text-teal-700">fixed</div> : null}
                          </Td>
                          <Td>{r.legacyLoanNo ?? ""}</Td>
                          <Td>{r.name ?? ""}</Td>
                          <Td className="text-xs">
                            {isExcluded ? null : (
                              <>
                                {r.errors.map((e) => <div key={e} className="text-red-700">{e}</div>)}
                                {r.warnings.map((w) => <div key={w} className="text-amber-700">{w}</div>)}
                              </>
                            )}
                          </Td>
                          <Td>
                            <div className="flex gap-2">
                              {!isExcluded ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={Boolean(busy)}
                                  onClick={() => (isEditing ? setEditing(null) : startEdit(raw.rowNumber))}
                                >
                                  {isEditing ? "Close" : "Fix"}
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={Boolean(busy)}
                                onClick={() => toggleExcluded(raw.rowNumber)}
                              >
                                {isExcluded ? "Include" : "Exclude"}
                              </Button>
                            </div>
                          </Td>
                        </tr>
                        {isEditing ? (
                          <tr>
                            <Td colSpan={6} className="bg-slate-50">
                              <p className="mb-3 text-xs text-slate-600">
                                Edit row {raw.rowNumber}. Highlighted fields are named in this row&apos;s issues.
                                Changes apply only to this import, not to your file.
                              </p>
                              <div className="grid gap-3 md:grid-cols-3">
                                {mapping
                                  .filter((m) => m.target)
                                  .sort((a, b) => Number(flagged?.has(b.index)) - Number(flagged?.has(a.index)))
                                  .map((m) => {
                                    const f = FIELD_BY_KEY.get(m.target!);
                                    const hot = flagged?.has(m.index);
                                    return (
                                      <label key={m.index} className="flex flex-col gap-1 text-xs">
                                        <span className={hot ? "font-semibold text-red-700" : "font-medium text-slate-700"}>
                                          {f?.label ?? m.target}
                                          {f?.type === "date" ? " (YYYY-MM-DD)" : ""}
                                        </span>
                                        <Input
                                          value={draft[m.index] ?? ""}
                                          onChange={(e) => setDraft((d) => ({ ...d, [m.index]: e.target.value }))}
                                          className={hot ? "border-red-400" : undefined}
                                        />
                                      </label>
                                    );
                                  })}
                              </div>
                              <div className="mt-3 flex gap-2">
                                <Button type="button" size="sm" disabled={Boolean(busy)} onClick={() => void saveFix(raw.rowNumber)}>
                                  Save &amp; re-check
                                </Button>
                                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                                  Cancel
                                </Button>
                              </div>
                            </Td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </Table>
              {reviewRows.length > RESULT_PREVIEW_LIMIT ? (
                <p className="mt-2 text-sm text-slate-500">
                  Showing the first {RESULT_PREVIEW_LIMIT} of {reviewRows.length} rows — download the CSV for all.
                </p>
              ) : null}
            </div>
          ) : (
            <Alert variant="success">No rows match this filter.</Alert>
          )}

          <div className="mt-4 flex flex-wrap justify-between gap-3">
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => setStep("map")}>
              ← Back to mapping
            </Button>
            <Button
              type="button"
              disabled={summary.error > 0 || summary.total === 0 || Boolean(busy)}
              onClick={() => setStep("import")}
            >
              Continue to import →
            </Button>
          </div>
        </Card>
      ) : null}

      {/* ── Step 4: Import (locked) ────────────────────────────────────── */}
      {step === "import" && summary ? (
        <Card className="mb-6">
          <h2 className="mb-3 font-display text-lg font-semibold text-navy-900">Import</h2>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Ready to import", value: summary.total },
              { label: "With warnings", value: summary.warning },
              { label: "Fixed in review", value: fixedCount },
              { label: "Excluded", value: excluded.size },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-slate-200 p-3 text-center">
                <p className="text-2xl font-bold text-navy-900">{k.value}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
              </div>
            ))}
          </div>
          <div className="mb-4">
            <Alert variant="warning">
              Import is locked pending client confirmation on outstanding balances and payments. The legacy files carry
              no balance data, so imported accounts would show the full loan as unpaid. Your mapping can be saved and
              this validation report downloaded in the meantime.
            </Alert>
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => setStep("review")}>
              ← Back to review
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={downloadReport}>
                Download report (CSV)
              </Button>
              <Button type="button" disabled title="Pending client confirmation on balances">
                Import {summary.total} row(s)
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
