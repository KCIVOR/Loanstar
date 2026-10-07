import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/Rovick/Downloads/StartupLab_SDLC_Progress_Tracker.xlsx";
const blob = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(blob);
const sheets = await workbook.inspect({ kind: "sheet", include: "id,name" });
console.log(sheets.ndjson);
for (const sheetName of ["Project Timeline", "Gantt Chart", "Gantt", "Project Info", "Modules Progress", "Roles Commitments"]) {
  try {
    const detail = await workbook.inspect({
      kind: "table,region,drawing",
      sheetId: sheetName,
      range: "A1:AZ80",
      maxChars: 18000,
      tableMaxRows: 80,
      tableMaxCols: 52,
      tableMaxCellChars: 100,
    });
    console.log(`DETAIL ${sheetName}\n${detail.ndjson}`);
    const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
    await fs.writeFile(`tmp/${sheetName.replaceAll(" ", "_")}.png`, new Uint8Array(await preview.arrayBuffer()));
    console.log(`RENDERED ${sheetName}`);
  } catch { /* sheet does not exist */ }
}
