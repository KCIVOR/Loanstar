import { FileBlob, PresentationFile } from "file:///C:/Users/Rovick/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const presentation = await PresentationFile.importPptx(await FileBlob.load("C:/Users/Rovick/Desktop/Loanstar_UAT_Progress_Presentation.pptx"));
const table = presentation.resolve("tb/7itgz6to");
console.log(Object.keys(table));
console.log("rows", Object.keys(table.rows ?? {}));
console.log("cells", Object.keys(table.cells ?? {}));
console.log("getCell", typeof table.getCell, "set", typeof table.cells?.set);
console.log("table proto", Object.getOwnPropertyNames(Object.getPrototypeOf(table)));
console.log("rows proto", Object.getOwnPropertyNames(Object.getPrototypeOf(table.rows)));
console.log("cell", Object.getOwnPropertyNames(Object.getPrototypeOf(table.getCell(1, 1))));
table.setValues([["A", "B", "C", "D", "E"], ["1", "2", "3", "4", "5"], ["6", "7", "8", "9", "10"]]);
console.log("after", table.rowCount, table.columnCount, table.rows.length, table.getCell(2, 4).text.text);
