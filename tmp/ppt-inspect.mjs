import { FileBlob, PresentationFile } from "file:///C:/Users/Rovick/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";
import fs from "node:fs/promises";

const source = "C:/Users/Rovick/Desktop/Loanstar_UAT_Progress_Presentation.pptx";
const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
const snapshot = await presentation.inspect({
  kind: "deck,slide,textbox,shape,image,table,chart,notes,layout",
  maxChars: 30000,
});
console.log(snapshot.ndjson);
const slide = presentation.resolve("sl/vaxsvy10");
const png = await slide.export({ format: "png", scale: 2 });
await fs.writeFile("C:/Users/Rovick/Desktop/Loanstar System/loanstar/tmp/slide-15-before.png", new Uint8Array(await png.arrayBuffer()));
