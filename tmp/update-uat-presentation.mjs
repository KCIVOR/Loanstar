import fs from "node:fs/promises";
import { FileBlob, PresentationFile } from "file:///C:/Users/Rovick/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const source = "C:/Users/Rovick/Desktop/Loanstar_UAT_Progress_Presentation.pptx";
const draft = "C:/Users/Rovick/Desktop/Loanstar System/loanstar/.codex-finalizer/loanstar-uat-progress-candidate.pptx";

const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
const table = presentation.resolve("tb/7itgz6to");

table.setValues([
  ["Issue ID", "Type / Impact", "Agreed Action", "Owner", "Target / Retest"],
  ["UAT-025", "Defect: agent information missing from loan applications", "Added staff-editable agent assignment and form display", "Rovick Romasanta", "Closed today"],
  ["UAT-040", "Defect: committee hold could not be cleared", "Added clear-hold action; return application to committee review", "Rovick Romasanta", "Closed today"],
  ["UAT-076", "Enhancement: User Management filtering and account separation", "Added role filters, pagination, and borrower/staff separation", "Rovick Romasanta", "Closed today"],
  ["UAT-078 / 079", "Defect: deactivated account retained access", "Disabled access immediately; reactivation requires fresh access", "Rovick Romasanta", "Closed today"],
  ["UAT-094", "Defect: restricted-page message unclear", "Added clear restricted-access message and safe return route", "Rovick Romasanta", "Closed today"],
  ["Meeting follow-up", "Agent dashboard showed organisation-wide Agent data", "Scoped Agent dashboard analytics to the signed-in Agent", "Rovick Romasanta", "Closed today"],
]);

for (let row = 0; row < table.rowCount; row += 1) {
  for (let column = 0; column < table.columnCount; column += 1) {
    const cell = table.getCell(row, column);
    cell.text.style = {
      typeface: "Aptos",
      fontSize: row === 0 ? 12 : 10,
      bold: row === 0,
      color: row === 0 ? "#FFFFFF" : "#1A1A1A",
      autoFit: "shrinkText",
    };
  }
}

await fs.mkdir("C:/Users/Rovick/Desktop/Loanstar System/loanstar/.codex-finalizer", { recursive: true });
await (await PresentationFile.exportPptx(presentation)).save(draft);
console.log(draft);
