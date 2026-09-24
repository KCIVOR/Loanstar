/** Render the source-faithful PN / DL2 / AR ATM (both variants) previews without touching template data. */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

import { SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW } from "../../src/lib/documents/fidelity/promissory-note-preview";
import { SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW } from "../../src/lib/documents/fidelity/demand-letter-second-notice-preview";
import { SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW } from "../../src/lib/documents/fidelity/ar-atm-voucher-preview";
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

await renderOne("preview-promissory-note", SOURCE_FAITHFUL_PROMISSORY_NOTE_PREVIEW, {
  ...commonSample,
  borrowerName: "ELVEN DEL MONTE CAYANAN",
  coBorrowerName: "MARIEVIC FLORES CAYANAN",
  address: "BLOCK 9 LOT 15 PHASE 1 SECTION 6 PABAHAY 2000 BRGY. MUZON SAN JOSE DEL MONTE BULACAN 3023",
  promissoryNoteNo: "PN303401",
  principal: "57,100.45",
  principalAndCentavosInWords: "Fifty Seven Thousand One Hundred Pesos & Forty Five Cents",
  interestRateInWords: "Two and Twenty Five hundredths percent (2.25%)",
  addonMonthsInWords: "Eight (8)",
  disclosureFromDate: "July 2026",
  disclosureToDate: "February 2027",
  totalLoan: "67,378.53",
  totalLoanAndCentavosInWords: "Sixty Seven Thousand Three Hundred Seventy Eight Pesos & Fifty Three Cents",
  termsInWords: "Six (6)",
  monthlyAmortization: "11,229.76",
  monthlyAmortizationAndCentavosInWords: "Eleven Thousand Two Hundred Twenty Nine Pesos & Seventy Six Cents",
  firstPaymentDate: "September 15, 2026",
  loanMaturityDate: "February 15, 2027",
  executionDate: "July 20, 2026",
  notaryDocNo: "",
  notaryPageNo: "",
  notaryBookNo: "",
  notarySeries: "",
});

await renderOne("preview-demand-letter-second-notice", SOURCE_FAITHFUL_DEMAND_LETTER_SECOND_NOTICE_PREVIEW, {
  ...commonSample,
  borrowerName: "ELVEN DEL MONTE CAYANAN",
  loanAccountNo: "LA201270",
  bouncedChecks: [],
});

await renderOne("preview-ar-atm-voucher-no-spouse", SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW, {
  ...commonSample,
  borrowerName: "ELVEN DEL MONTE CAYANAN",
  address: "BLOCK 9 LOT 15 PHASE 1 SECTION 6 PABAHAY 2000 BRGY. MUZON SAN JOSE DEL MONTE BULACAN 3023",
  totalLoan: "67,378.53",
  totalLoanAndCentavosInWords: "Sixty Seven Thousand Three Hundred Seventy Eight Pesos & Fifty Three Cents",
  termsInWords: "Six (6)",
  monthlyAmortization: "11,229.76",
  monthlyAmortizationAndCentavosInWords: "Eleven Thousand Two Hundred Twenty Nine Pesos & Seventy Six Cents",
  firstPaymentDate: "September 15, 2026",
  hasSpouse: false,
  spouseName: "",
});

await renderOne("preview-ar-atm-voucher-with-spouse", SOURCE_FAITHFUL_AR_ATM_VOUCHER_PREVIEW, {
  ...commonSample,
  borrowerName: "ELVEN DEL MONTE CAYANAN",
  address: "BLOCK 9 LOT 15 PHASE 1 SECTION 6 PABAHAY 2000 BRGY. MUZON SAN JOSE DEL MONTE BULACAN 3023",
  totalLoan: "67,378.53",
  totalLoanAndCentavosInWords: "Sixty Seven Thousand Three Hundred Seventy Eight Pesos & Fifty Three Cents",
  termsInWords: "Six (6)",
  monthlyAmortization: "11,229.76",
  monthlyAmortizationAndCentavosInWords: "Eleven Thousand Two Hundred Twenty Nine Pesos & Seventy Six Cents",
  firstPaymentDate: "September 15, 2026",
  hasSpouse: true,
  spouseName: "MARIEVIC FLORES CAYANAN",
});
