import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { validateRows, summarize, EMPTY_EXISTING } from "../../src/lib/legacy-import/validate";
import { suggestMapping as mapHeaders } from "../../src/lib/legacy-import/suggest";
import { canValidate } from "../../src/lib/legacy-import/fields";

const path = "C:/Users/Rovick/Desktop/Loanstar System/loanstar/outputs/sme-legacy-import-dummy/legacy-import-template-sme-dummy-data.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
const sheet = workbook.worksheets.getItem("SME Import");
const values = sheet.getRange("A1:CN4").values as (string | number | boolean | null)[][];
const rows = values.map((r) => r.map((v) => v ?? null));
const headers = rows[0];
const mapping = mapHeaders(headers, "sme");
if (!canValidate(mapping, "sme")) throw new Error("Auto-mapping did not cover all gating fields");
const results = validateRows(rows.slice(1).map((cells, index) => ({ rowNumber: index + 2, cells })), mapping, "sme", EMPTY_EXISTING);
const summary = summarize(results);
if (summary.error !== 0 || summary.warning !== 0 || summary.valid !== 3) {
  throw new Error(`Validation failed: ${JSON.stringify({ summary, results })}`);
}
console.log(JSON.stringify({ autoMapped: mapping.filter((m) => m.target).length, summary, statuses: results.map((r) => r.status) }));
