/** Render the source-faithful consent_form preview (both isCorporateBorrower branches) without touching template data. */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

import { SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW } from "../../src/lib/documents/fidelity/consent-form-preview";
import { loadDocRenderConfig } from "../../src/lib/documents/render/engine-config";
import { renderTemplateToPdf } from "../../src/lib/documents/render/index";
import { buildSampleContext } from "../../src/lib/documents/templates/fields";

const envFile = resolve("C:/Users/Rovick/Desktop/Loanstar System/loanstar/.env.local");

async function loadMainRuntimeEnvironment(): Promise<void> {
  const { loadRuntimeEnvironment } = await import("./render-generated-evidence");
  await loadRuntimeEnvironment(envFile);
}

function run(command: string, arguments_: string[]): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, arguments_, { shell: false, windowsHide: true });
    let output = "";
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolveRun() : reject(new Error(`${command} failed: ${output}`)));
  });
}

await loadMainRuntimeEnvironment();
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
      throw new Error(`Preview output directory must be fresh: ${outputDirectory}/${entry}`);
    }
  }
  const pdf = await renderTemplateToPdf(body, context, { engine: "chromium", connection: config.connection });
  const pdfPath = resolve(outputDirectory, "preview.pdf");
  await writeFile(pdfPath, pdf, { flag: "wx" });
  await run(rasterizer, ["-png", "-r", "150", pdfPath, resolve(outputDirectory, "page")]);
  console.log(name, "->", pdfPath);
}

const commonSample = buildSampleContext();

await renderOne("preview-consent-form-corporate", SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, {
  ...commonSample,
  borrowerName: "COMCEN SECURITY SERVICES INC.",
  isCorporateBorrower: true,
  borrowerRepresentative: "HARLIN GLEEPERF JAGDON ABAYON II",
  coBorrowerName: "",
});

await renderOne("preview-consent-form-individual", SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, {
  ...commonSample,
  borrowerName: "GDD CONSTRUCTION",
  isCorporateBorrower: false,
  borrowerRepresentative: "",
  coBorrowerName: "RENE SANTOS",
});

await renderOne("preview-consent-form-individual-solo", SOURCE_FAITHFUL_CONSENT_FORM_PREVIEW, {
  ...commonSample,
  borrowerName: "ELVEN DEL MONTE CAYANAN",
  isCorporateBorrower: false,
  borrowerRepresentative: "",
  coBorrowerName: "",
});
