/** Render the source-faithful demand_letter_v2 preview (all 4 address/attention combinations) without touching template data. */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

import { SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW } from "../../src/lib/documents/fidelity/demand-letter-v2-preview";
import { loadDocRenderConfig } from "../../src/lib/documents/render/engine-config";
import { renderTemplateToPdf } from "../../src/lib/documents/render/index";
import { buildSampleContext } from "../../src/lib/documents/templates/fields";

const envFile = resolve("C:/Users/Rovick/Desktop/Loanstar System/loanstar/.env.local");

async function loadMainRuntimeEnvironment(): Promise<void> {
  const { loadRuntimeEnvironment } = await import("./render-generated-evidence.mts");
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

const vienovoBase = {
  ...commonSample,
  borrowerName: "VIENOVO PHILIPPINES, INC.",
  address: "2ND FLOOR UPRC1 BUILDING, 2230 CHINO ROCES AVE., BRGY. BANGKAL, MAKATI CITY",
  loanAccountNo: "LA000015",
  attentionName: "Mathieu Francis Marie Guillaume And Charo Mae Abadilla",
  attentionTitle: "Pres",
};

await renderOne("preview-demand-letter-v2-address-attention", SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW, {
  ...vienovoBase,
  hasAddress: true,
  hasAttentionLine: true,
});

await renderOne("preview-demand-letter-v2-no-address-attention", SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW, {
  ...vienovoBase,
  address: "",
  hasAddress: false,
  hasAttentionLine: true,
});

await renderOne("preview-demand-letter-v2-address-no-attention", SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW, {
  ...vienovoBase,
  hasAddress: true,
  hasAttentionLine: false,
});

await renderOne("preview-demand-letter-v2-no-address-no-attention", SOURCE_FAITHFUL_DEMAND_LETTER_V2_PREVIEW, {
  ...vienovoBase,
  address: "",
  hasAddress: false,
  hasAttentionLine: false,
});
