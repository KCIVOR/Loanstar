import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { SOURCE_FAITHFUL_LOAN_AGREEMENT_VIENOVO_PREVIEW } from "../../src/lib/documents/fidelity/loan-agreement-vienovo-preview";
import { loadDocRenderConfig } from "../../src/lib/documents/render/engine-config";
import { renderTemplateToPdf } from "../../src/lib/documents/render/index";
import { buildSampleContext } from "../../src/lib/documents/templates/fields";

const envFile = resolve("C:/Users/Rovick/Desktop/Loanstar System/loanstar/.env.local");
const { loadRuntimeEnvironment } = await import("./render-generated-evidence");
await loadRuntimeEnvironment(envFile);
const config = await loadDocRenderConfig();
if (config.engine !== "chromium" || config.misconfigured || !config.connection.url) {
  throw new Error("Preview requires the configured Chromium/Gotenberg renderer.");
}
const rasterizer = process.env.CODEX_BUNDLED_PDFTOPPM_PATH
  ?? "C:/Users/Rovick/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe";

async function renderOne(name: string, body: string, context: Record<string, unknown>): Promise<void> {
  const outputDirectory = resolve("tmp/document-fidelity", name);
  await mkdir(outputDirectory, { recursive: true });
  const existing = await readdir(outputDirectory);
  for (const entry of existing) {
    if (/^page-\d+\.png$/i.test(entry) || entry === "preview.pdf") {
      throw new Error(`fresh dir please: ${outputDirectory}/${entry}`);
    }
  }
  const pdf = await renderTemplateToPdf(body, context, { engine: "chromium", connection: config.connection });
  const pdfPath = resolve(outputDirectory, "preview.pdf");
  await writeFile(pdfPath, pdf, { flag: "wx" });
  await new Promise<void>((res, rej) => {
    const c = spawn(rasterizer, ["-png", "-r", "150", pdfPath, resolve(outputDirectory, "page")], { shell: false, windowsHide: true });
    let out = "";
    c.stderr.on("data", (d) => { out += d.toString(); });
    c.on("close", (code) => code === 0 ? res() : rej(new Error(out)));
  });
  console.log(name, "->", pdfPath);
}

await renderOne("preview-vienovo-fixed", SOURCE_FAITHFUL_LOAN_AGREEMENT_VIENOVO_PREVIEW, {
  ...buildSampleContext(),
  borrowerName: "VIENOVO PHILIPPINES, INC.",
  isCorporateBorrower: true,
  isQuarterly: false,
  isEvery2Months: true,
});
