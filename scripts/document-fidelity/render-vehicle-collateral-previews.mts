/**
 * Render the 3 vehicle-collateral fidelity fixes (deed_of_chattel_mortgage,
 * cancellation_of_chattel_mortgage, voluntary_surrender_deed_auto) through
 * the real Gotenberg pipeline, once with a single vehicle and once with two,
 * so the fixed `<div data-repeat="vehicles">` per-vehicle key/value table
 * geometry can be visually compared against the source .doc screenshots
 * (antiword-extracted text already confirmed the field labels/order; this
 * confirms the rendered PDF actually stacks one small table per vehicle
 * rather than the old wide single-table-with-header-row layout).
 */
import { mkdir, readdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

import { SOURCE_FAITHFUL_DEED_OF_CHATTEL_MORTGAGE_PREVIEW } from "../../src/lib/documents/fidelity/deed-of-chattel-mortgage-preview";
import { SOURCE_FAITHFUL_CANCELLATION_OF_CHATTEL_MORTGAGE_PREVIEW } from "../../src/lib/documents/fidelity/cancellation-of-chattel-mortgage-preview";
import { SOURCE_FAITHFUL_VOLUNTARY_SURRENDER_DEED_AUTO_PREVIEW } from "../../src/lib/documents/fidelity/voluntary-surrender-deed-auto-preview";
import { loadDocRenderConfig } from "../../src/lib/documents/render/engine-config";
import { renderTemplateToPdf } from "../../src/lib/documents/render/index";
import { buildSampleContext } from "../../src/lib/documents/templates/fields";

const outputDirectory = resolve("tmp/document-fidelity/vehicle-collateral-preview");
const envFile = resolve("..", "..", ".env.local");

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
    child.on("close", (code) => (code === 0 ? resolveRun() : reject(new Error(`${command} failed: ${output}`))));
  });
}

await loadMainRuntimeEnvironment();
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const config = await loadDocRenderConfig();
if (config.engine !== "chromium" || config.misconfigured || !config.connection.url) {
  throw new Error("Vehicle-collateral preview requires the configured Chromium/Gotenberg renderer.");
}

const oneVehicle = [
  {
    makeYearModel: "Toyota Vios 2012",
    engineNo: "1234567894561420",
    chassisNo: "LKJLKASJDLK13215646",
    plateNo: "TWO489",
    crNo: "123654",
    mvFileNo: "139-000000123456",
    registeredOwner: "Rene Dela Pena",
  },
];
const twoVehicles = [
  ...oneVehicle,
  {
    makeYearModel: "Honda Click 2018",
    engineNo: "9876543210ABCDE",
    chassisNo: "MNPQRS7654321000",
    plateNo: "ABC123",
    crNo: "998877",
    mvFileNo: "139-000000998877",
    registeredOwner: "Juan Dela Cruz",
  },
];

const rasterizer = process.env.CODEX_BUNDLED_PDFTOPPM_PATH
  ?? "C:/Users/Rovick/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe";

async function renderOne(name: string, body: string, vehicles: unknown[]): Promise<void> {
  const context = {
    ...buildSampleContext(),
    borrowerName: "NACIONAL, MARILEN SANCHEZ / NACIONAL, RONN BENEDICT SANCHEZ",
    address: "BLOCK 7 LOT 40 KRONER ST., VILLA CAROLINA 1, TUNASAN, MUNTINLUPA CITY",
    lenderRepresentative: "KRISTOFFER JOHN C. DELA CRUZ",
    principalAndCentavosInWords: "Fifty One Thousand Twenty Pesos & Forty One Cents",
    principal: "51,020.41",
    termsInWords: "Three (3)",
    interestRateInWords: "Two and Twenty-five hundredths percent (2.25%)",
    totalLoanAndCentavosInWords: "Fifty Four Thousand Four Hundred Sixty Four Pesos & Twenty Nine Cents",
    totalLoan: "54,464.29",
    executionDate: "October 1, 2026",
    executionPlace: "Makati City",
    vehicles,
  };
  const pdf = await renderTemplateToPdf(body, context, {
    engine: "chromium",
    connection: config.connection,
  });
  const pdfPath = resolve(outputDirectory, `${name}.pdf`);
  await writeFile(pdfPath, pdf, { flag: "wx" });
  await run(rasterizer, ["-png", "-r", "150", pdfPath, resolve(outputDirectory, name)]);
  console.log(pdfPath);
}

await renderOne("deed_of_chattel_mortgage-1vehicle", SOURCE_FAITHFUL_DEED_OF_CHATTEL_MORTGAGE_PREVIEW, oneVehicle);
await renderOne("deed_of_chattel_mortgage-2vehicles", SOURCE_FAITHFUL_DEED_OF_CHATTEL_MORTGAGE_PREVIEW, twoVehicles);
await renderOne("cancellation_of_chattel_mortgage-1vehicle", SOURCE_FAITHFUL_CANCELLATION_OF_CHATTEL_MORTGAGE_PREVIEW, oneVehicle);
await renderOne("cancellation_of_chattel_mortgage-2vehicles", SOURCE_FAITHFUL_CANCELLATION_OF_CHATTEL_MORTGAGE_PREVIEW, twoVehicles);
await renderOne("voluntary_surrender_deed_auto-1vehicle", SOURCE_FAITHFUL_VOLUNTARY_SURRENDER_DEED_AUTO_PREVIEW, oneVehicle);
await renderOne("voluntary_surrender_deed_auto-2vehicles", SOURCE_FAITHFUL_VOLUNTARY_SURRENDER_DEED_AUTO_PREVIEW, twoVehicles);

const pages = (await readdir(outputDirectory)).filter((name) => /\.png$/i.test(name));
console.log(`Rendered ${pages.length} page images to ${outputDirectory}`);
