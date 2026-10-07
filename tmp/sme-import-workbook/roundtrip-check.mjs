import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const path = "C:/Users/Rovick/Desktop/Loanstar System/loanstar/outputs/sme-legacy-import-dummy/legacy-import-template-sme-dummy-data.xlsx";
const input = await FileBlob.load(path);
const workbook = await SpreadsheetFile.importXlsx(input);
const check = await workbook.inspect({ kind: "table", range: "SME Import!A1:CN4", include: "values,formulas", tableMaxRows: 4, tableMaxCols: 92 });
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 300 }, summary: "round-trip formula error scan" });
console.log(check.ndjson);
console.log(errors.ndjson);
