import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildTemplateWorkbook } from "../src/lib/legacy-import/template-workbook";
import { templateFileName, templateSegments } from "../src/lib/legacy-import/template-files";

const outputDirectory = path.join(process.cwd(), "public", "legacy-import-templates");
await mkdir(outputDirectory, { recursive: true });

for (const segment of templateSegments) {
  const contents = await buildTemplateWorkbook(segment).xlsx.writeBuffer();
  await writeFile(path.join(outputDirectory, templateFileName(segment)), new Uint8Array(contents));
}
