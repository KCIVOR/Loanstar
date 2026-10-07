import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/Rovick/Downloads/StartupLab_SDLC_Progress_Tracker.xlsx";
const outputDir = "outputs/loanstar-sdlc-timeline";
const outputPath = `${outputDir}/StartupLab_SDLC_Progress_Tracker_Updated.xlsx`;
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));

// Project Info: LoanStar row 9. The existing workbook uses 2026 dates.
const projectInfo = workbook.worksheets.getItem("Project Info");
projectInfo.getRange("E9:F9").values = [[new Date(2026, 5, 1), new Date(2026, 8, 25)]];
projectInfo.getRange("E9:F9").format.numberFormat = "mmm d, yyyy";

// Preserve the Project Summary logic while replacing unsupported full-column
// COUNTIFS references with the populated modules range.
const summary = workbook.worksheets.getItem("Project Summary");
summary.getRange("C5").formulas = [["=COUNTIFS('Modules Progress'!$A$5:$A$104,$A5,'Modules Progress'!$O$5:$O$104,\"Completed\")"]];
summary.getRange("C5:C20").fillDown();
summary.getRange("E5").formulas = [["=COUNTIFS('Modules Progress'!$A$5:$A$104,$A5,'Modules Progress'!$O$5:$O$104,\"Not Started\")"]];
summary.getRange("E5:E20").fillDown();

const gantt = workbook.worksheets.getItem("Gantt Timeline");
// Clear only the existing LoanStar timeline fills, preserving all labels and layout.
gantt.getRange("C120:AL138").format.fill = "#FFFFFF";

const barColor = "#4472C4";
const timeline = [
  // First-week-of-June site visit and analysis.
  ["W120:X120"],
  // Development runs after analysis through the end of August.
  ["Y121:AH131"],
  // Final internal review and testing before client UAT.
  ["AI132:AI132"],
  ["AJ133:AK133"],
  // UAT completed September 22–25 (September week 4).
  ["AL134:AL134"],
];
for (const [address] of timeline) gantt.getRange(address).format.fill = barColor;

workbook.recalculate();

const check = await workbook.inspect({
  kind: "table",
  range: "Project Info!A4:H10",
  include: "values,formulas",
  tableMaxRows: 7,
  tableMaxCols: 8,
});
console.log(check.ndjson);
const ganttCheck = await workbook.inspect({
  kind: "table",
  range: "Gantt Timeline!A118:AL138",
  include: "values,formulas",
  tableMaxRows: 21,
  tableMaxCols: 38,
});
console.log(ganttCheck.ndjson);
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "Gantt Timeline",
  range: "A118:AL138",
  scale: 2,
  format: "png",
});
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(`${outputDir}/LoanStar_Gantt_preview.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`OUTPUT ${outputPath}`);
