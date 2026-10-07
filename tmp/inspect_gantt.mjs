import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load("C:/Users/Rovick/Downloads/StartupLab_SDLC_Progress_Tracker.xlsx"));
const sheet = wb.worksheets.getItem("Gantt Timeline");
for (const range of ["A1:AP45", "A46:AP100", "A101:AP138"]) {
  const r = await wb.inspect({kind:"table,formula", sheetId: sheet.sheetId, range, include:"values,formulas", maxChars:25000, tableMaxRows:60, tableMaxCols:42, tableMaxCellChars:100});
  console.log(`RANGE ${range}\n${r.ndjson}`);
}
const preview = await wb.render({sheetName:"Gantt Timeline",autoCrop:"all",scale:1,format:"png"});
await fs.writeFile("tmp/Gantt_Timeline.png", new Uint8Array(await preview.arrayBuffer()));
