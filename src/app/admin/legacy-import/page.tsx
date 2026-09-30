"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
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
import { type CellValue, isBlankRow } from "@/lib/legacy-import/normalize";
import { type LoadedWorkbook, parseLegacyFile } from "@/lib/legacy-import/parse-file";
import { suggestMapping } from "@/lib/legacy-import/suggest";
import {
  type InputRow,
  type RowResult,
  type ValidationSummary,
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

export default function LegacyImportPage() {
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
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [summary, setSummary] = useState<ValidationSummary | null>(null);

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

  const resetResults = () => {
    setResults(null);
    setSummary(null);
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
    setResults(null);
    setSummary(null);
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
    resetResults();
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
      if (/sme/i.test(hint)) setSegment("sme");
      else if (/sf|seafarer/i.test(hint)) setSegment("seafarer");
      setHeaderRow(preferred && /import$/i.test(preferred) ? 2 : 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
      setWorkbook(null);
      setFileName(null);
    } finally {
      setBusy(null);
    }
  };

  const segmentFields = useMemo(() => fieldsForSegment(segment), [segment]);
  const dupes = useMemo(() => new Set(duplicateTargets(mapping)), [mapping]);
  const coverage = useMemo(() => requiredCoverage(mapping, segment), [mapping, segment]);
  const missingGating = coverage.filter((c) => !c.covered && c.gating);
  const missingWarn = coverage.filter((c) => !c.covered && !c.gating);
  const validateEnabled = mapping.length > 0 && dataRows.length > 0 && canValidate(mapping, segment) && !busy;

  const setTarget = (index: number, target: string | null) => {
    setMapping((prev) => prev.map((m) => (m.index === index ? { ...m, target } : m)));
    resetResults();
  };

  const applyPreset = (p: Preset) => {
    setPresetName(p.name);
    setNotice(`Loaded mapping "${p.name}".`);
    if (p.segment === segment && p.header_row === headerRow) {
      setMapping((prev) =>
        prev.map((m) => ({ ...m, target: p.mapping.find((x) => x.index === m.index)?.target ?? null })),
      );
      resetResults();
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

  const runValidation = async () => {
    setError(null);
    setNotice(null);
    resetResults();
    const active = mapping.filter((m) => m.target);
    const all: RowResult[] = [];
    try {
      for (let i = 0; i < dataRows.length; i += CHUNK_SIZE) {
        setBusy(`Validating rows ${i + 1}–${Math.min(i + CHUNK_SIZE, dataRows.length)} of ${dataRows.length}…`);
        const res = await fetch("/api/admin/legacy-import/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ segment, mapping: active, rows: dataRows.slice(i, i + CHUNK_SIZE) }),
        });
        if (!res.ok) throw new Error(await readError(res, "Validation failed"));
        const data = (await res.json()) as { results: RowResult[] };
        all.push(...data.results);
      }
      const final = flagDuplicateLoanNos(all);
      const s = summarize(final);
      setResults(final);
      setSummary(s);

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

  const downloadReport = () => {
    if (!results) return;
    const rows: unknown[][] = [
      ["Row", "Status", "Legacy Borrower No.", "Legacy Loan No.", "Name", "Errors", "Warnings"],
      ...results.map((r) => [
        r.rowNumber,
        r.status,
        r.legacyBorrowerNo ?? "",
        r.legacyLoanNo ?? "",
        r.name ?? "",
        r.errors.join(" | "),
        r.warnings.join(" | "),
      ]),
    ];
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `legacy-import-validation-${(fileName ?? "file").replace(/\.[^.]+$/, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const problemRows = results?.filter((r) => r.status !== "valid") ?? [];

  return (
    <div>
      <PageHeader
        title="Legacy Data Import"
        description="Dry run only: upload a legacy SF/SME sheet, map its columns, and validate. Nothing is written to borrowers or loans."
      />

      {error ? <div className="mb-4"><Alert>{error}</Alert></div> : null}
      {notice ? <div className="mb-4"><Alert variant="success">{notice}</Alert></div> : null}
      {busy ? <div className="mb-4"><Alert variant="info">{busy}</Alert></div> : null}

      <Card className="mb-6">
        <h2 className="mb-3 font-display text-lg font-semibold text-navy-900">1. File</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="font-medium">Upload (.xlsx, .xlsm, .csv)</span>
            <input
              type="file"
              accept=".xlsx,.xlsm,.csv"
              disabled={Boolean(busy)}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            {fileName ? <span className="text-slate-500">{fileName}</span> : null}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Sheet</span>
            <Select value={sheetName} onChange={(e) => setSheetName(e.target.value)} disabled={!sheetNames.length}>
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
          <div className="flex items-end text-sm text-slate-600 md:col-span-3">
            {sheet ? `${dataRows.length} non-blank data row(s) below header row ${headerRow}.` : "No file loaded."}
          </div>
        </div>
      </Card>

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

      {mapping.length ? (
        <Card className="mb-6">
          <h2 className="mb-3 font-display text-lg font-semibold text-navy-900">2. Map columns</h2>
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
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" disabled={!validateEnabled} onClick={() => void runValidation()}>
              Validate (dry run)
            </Button>
            <Button type="button" variant="secondary" disabled title="Pending client confirmation on balances">
              Import (coming soon – pending client confirmation on balances)
            </Button>
          </div>
        </Card>
      ) : null}

      {summary && results ? (
        <Card className="mb-6">
          <h2 className="mb-3 font-display text-lg font-semibold text-navy-900">3. Validation result</h2>
          <div className="mb-4 flex flex-wrap gap-6 text-sm">
            <span>Total: <strong>{summary.total}</strong></span>
            <span className="text-green-700">Valid: <strong>{summary.valid}</strong></span>
            <span className="text-amber-700">Warnings: <strong>{summary.warning}</strong></span>
            <span className="text-red-700">Errors: <strong>{summary.error}</strong></span>
            <Button type="button" variant="outline" size="sm" onClick={downloadReport}>
              Download report (CSV)
            </Button>
          </div>
          {problemRows.length ? (
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Row</Th>
                    <Th>Status</Th>
                    <Th>Loan No.</Th>
                    <Th>Name</Th>
                    <Th>Issues</Th>
                  </tr>
                </thead>
                <tbody>
                  {problemRows.slice(0, RESULT_PREVIEW_LIMIT).map((r) => (
                    <tr key={r.rowNumber}>
                      <Td>{r.rowNumber}</Td>
                      <Td className={r.status === "error" ? "text-red-700" : "text-amber-700"}>{r.status}</Td>
                      <Td>{r.legacyLoanNo ?? ""}</Td>
                      <Td>{r.name ?? ""}</Td>
                      <Td className="text-xs">
                        {r.errors.map((e) => <div key={e} className="text-red-700">{e}</div>)}
                        {r.warnings.map((w) => <div key={w} className="text-amber-700">{w}</div>)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {problemRows.length > RESULT_PREVIEW_LIMIT ? (
                <p className="mt-2 text-sm text-slate-500">
                  Showing the first {RESULT_PREVIEW_LIMIT} of {problemRows.length} rows with issues — download the CSV for all.
                </p>
              ) : null}
            </div>
          ) : (
            <Alert variant="success">All rows passed validation.</Alert>
          )}
        </Card>
      ) : null}
    </div>
  );
}
