import { FileBlob, PresentationFile } from "file:///C:/Users/Rovick/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";
const p = await PresentationFile.importPptx(await FileBlob.load("C:/Users/Rovick/Desktop/Loanstar_UAT_Progress_Presentation.pptx"));
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(p.slides)));
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(p.slides.getItem(14))));
