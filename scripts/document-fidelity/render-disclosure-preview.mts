/** Render the source-faithful SF disclosure preview without touching template data. */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

import { SOURCE_FAITHFUL_DISCLOSURE_PREVIEW } from "../../src/lib/documents/fidelity/disclosure-preview";
import { loadDocRenderConfig } from "../../src/lib/documents/render/engine-config";
import { renderTemplateToPdf } from "../../src/lib/documents/render/index";
import { buildSampleContext } from "../../src/lib/documents/templates/fields";

const outputDirectory = resolve("tmp/document-fidelity/disclosure-source-faithful-preview");
const envFile = resolve("..", "..", ".env.local");

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
await mkdir(outputDirectory, { recursive: true });
if ((await readdir(outputDirectory)).length > 0) {
  throw new Error(`Preview output directory must be fresh and empty: ${outputDirectory}`);
}

const config = await loadDocRenderConfig();
if (config.engine !== "chromium" || config.misconfigured || !config.connection.url) {
  throw new Error("Disclosure preview requires the configured Chromium/Gotenberg renderer.");
}

const context = {
  ...buildSampleContext(),
  businessCompanyName: "ALSTER INTERNATIONAL SERVICES, INC.",
  borrowerName: "ELVEN DEL MONTE CAYANAN",
  coBorrowerName: "MARIEVIC FLORES CAYANAN",
  address: "BLOCK 9 LOT 15 PHASE 1 SECTION 6 PABAHAY 2000 BRGY. MUZON SAN JOSE DEL MONTE BULACAN 3023",
  lenderRepresentative: "KRISTOFFER JOHN C. DELA CRUZ",
  lenderRepresentativeTitle: "PRESIDENT",
  todayDate: "7/20/2026",
  interestRate: "2.25%",
  amountFinanced: "57,100.45",
  netLoanAmount: "50,000.00",
  financeChargeInterest: "10,278.08",
  totalInstallmentPayments: "67,378.53",
  installmentCount: "6",
  monthlyAmortization: "11,229.76",
  disclosureFromDate: "July 2026",
  disclosureToDate: "February 2027",
  securityFee: "1,284.76",
  processingFee: "3,426.03",
  notaryFee: "57.10",
  docStamp: "246.39",
  adminCost: "2,086.17",
  nonFinanceCharges: "7,100.45",
};

const pdf = await renderTemplateToPdf(SOURCE_FAITHFUL_DISCLOSURE_PREVIEW, context, {
  engine: "chromium",
  connection: config.connection,
});
const pdfPath = resolve(outputDirectory, "disclosure-preview.pdf");
await writeFile(pdfPath, pdf, { flag: "wx" });
const rasterizer = process.env.CODEX_BUNDLED_PDFTOPPM_PATH
  ?? "C:/Users/Rovick/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe";
await run(rasterizer, ["-png", "-r", "150", pdfPath, resolve(outputDirectory, "page")]);
const pages = (await readdir(outputDirectory)).filter((name) => /^page-\d+\.png$/i.test(name));
if (pages.length !== 1) throw new Error(`Disclosure preview must render as one page; got ${pages.length}.`);
console.log(pdfPath);
