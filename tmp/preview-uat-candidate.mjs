import fs from "node:fs/promises";
import { FileBlob, PresentationFile } from "file:///C:/Users/Rovick/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const presentation = await PresentationFile.importPptx(await FileBlob.load("C:/Users/Rovick/Desktop/Loanstar System/loanstar/output/Loanstar_UAT_Progress_Presentation_updated_v2.pptx"));
const slide = presentation.resolve("sl/vaxsvy10");
const image = await slide.export({ format: "png", scale: 2 });
await fs.writeFile("C:/Users/Rovick/Desktop/Loanstar System/loanstar/tmp/slide-15-final.png", new Uint8Array(await image.arrayBuffer()));
const snapshot = await presentation.inspect({ target: { id: "tb/7itgz6to", beforeLines: 0, afterLines: 0 }, kind: "table", maxChars: 3000 });
console.log(snapshot.ndjson);
