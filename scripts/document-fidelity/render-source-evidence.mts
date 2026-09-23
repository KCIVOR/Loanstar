import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, parse, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import { listSourceVariants } from "../../src/lib/documents/fidelity/source-registry";
import {
  loadDocRenderConfig,
  type DocRenderConnection,
  type ResolvedDocRenderConfig,
} from "../../src/lib/documents/render/engine-config";

const retainedSourceRoots = [
  "C:/Users/Rovick/Downloads/SFCalculator",
  "C:/Users/Rovick/Downloads/LSLGC Calculator and Docs",
];

type CommandResult = {
  stdout: string;
  stderr: string;
};

type SourceEvidenceArguments = {
  id: string;
  outdir: string;
};

function normalisePath(path: string): string {
  return resolve(path).replace(/\\/g, "/").toLowerCase();
}

export function assertSafeEvidenceOutputDirectory(outputDirectory: string): void {
  const candidate = normalisePath(outputDirectory);

  for (const sourceRoot of retainedSourceRoots) {
    const normalizedRoot = normalisePath(sourceRoot);
    if (candidate === normalizedRoot || candidate.startsWith(`${normalizedRoot}/`)) {
      throw new Error("Evidence output must not be written below a retained client source directory.");
    }
  }
}

function assertContainedPath(rootDirectory: string, candidatePath: string): void {
  const relation = relative(rootDirectory, candidatePath);
  if (relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))) return;
  throw new Error("Evidence artifact destination must be contained in the approved evidence directory.");
}

async function assertNoReparsePointComponents(directory: string): Promise<void> {
  const parsed = parse(directory);
  let current = parsed.root;
  for (const component of directory.slice(parsed.root.length).split(/[\\/]+/).filter(Boolean)) {
    current = resolve(current, component);
    const details = await lstat(current);
    if (details.isSymbolicLink()) {
      throw new Error(`Evidence output directory must not contain a reparse point: ${current}`);
    }
  }
}

export async function prepareEvidenceOutputDirectory(outputDirectory: string): Promise<string> {
  assertSafeEvidenceOutputDirectory(outputDirectory);
  const requestedDirectory = resolve(outputDirectory);
  await mkdir(requestedDirectory, { recursive: true });
  await assertNoReparsePointComponents(requestedDirectory);
  const approvedDirectory = await realpath(requestedDirectory);
  assertContainedPath(approvedDirectory, resolve(approvedDirectory, "."));
  return approvedDirectory;
}

function evidenceArtifactPath(approvedDirectory: string, filename: string): string {
  const destination = resolve(approvedDirectory, filename);
  assertContainedPath(approvedDirectory, destination);
  return destination;
}

export async function assertArtifactDestinationWritable(
  approvedDirectory: string,
  filename: string,
): Promise<string> {
  const destination = evidenceArtifactPath(approvedDirectory, filename);
  try {
    const details = await lstat(destination);
    if (details.isSymbolicLink()) {
      throw new Error(`Evidence artifact has a pre-existing reparse point: ${destination}`);
    }
    throw new Error(`Evidence artifact destination already exists: ${destination}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return destination;
    throw error;
  }
}

async function assertNoExistingPageArtifacts(approvedDirectory: string): Promise<void> {
  for (const entry of await readdir(approvedDirectory)) {
    if (/^page-\d+\.png$/i.test(entry)) {
      await assertArtifactDestinationWritable(approvedDirectory, entry);
    }
  }
}

function parseArguments(arguments_: readonly string[]): SourceEvidenceArguments {
  let id: string | undefined;
  let outdir: string | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--id") id = arguments_[index + 1];
    if (argument === "--outdir") outdir = arguments_[index + 1];
  }

  if (!id || !outdir || !isAbsolute(outdir)) {
    throw new Error("Usage: render-source-evidence --id <variant-id> --outdir <absolute-path>");
  }

  return { id, outdir };
}

function runCommand(command: string, arguments_: string[]): Promise<CommandResult> {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, arguments_, { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", rejectCommand);
    child.on("close", (code) => {
      if (code === 0) {
        resolveCommand({ stdout, stderr });
        return;
      }
      rejectCommand(new Error(`${command} failed with exit code ${code}: ${stderr || stdout}`));
    });
  });
}

async function commandVersion(command: string, arguments_: string[]): Promise<string> {
  const result = await runCommand(command, arguments_);
  return (result.stdout || result.stderr).trim();
}

export function assertConfiguredGotenberg(config: ResolvedDocRenderConfig): DocRenderConnection {
  if (config.engine !== "chromium" || config.misconfigured || !config.connection.url) {
    throw new Error("Source evidence requires the configured Chromium/Gotenberg conversion path.");
  }
  return config.connection;
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export async function artifactMetadata(path: string): Promise<{ path: string; sha256: string; bytes: number }> {
  const details = await stat(path);
  return { path, sha256: await sha256(path), bytes: details.size };
}

export function sanitizeRendererOrigin(url: string): string {
  return new URL(url).origin;
}

function authHeaders(connection: DocRenderConnection): Record<string, string> {
  if (!connection.user || !connection.pass) return {};
  return {
    authorization: `Basic ${Buffer.from(`${connection.user}:${connection.pass}`).toString("base64")}`,
  };
}

async function gotenbergVersion(connection: DocRenderConnection): Promise<string> {
  const response = await fetch(`${connection.url}/version`, { headers: authHeaders(connection) });
  const text = await response.text();
  return response.ok ? text.trim() : `unavailable (HTTP ${response.status})`;
}

async function convertCopiedSourceViaGotenberg(
  copiedSourcePath: string,
  convertedCopyPath: string,
  connection: DocRenderConnection,
): Promise<void> {
  const form = new FormData();
  const copiedBytes = await readFile(copiedSourcePath);
  form.append(
    "files",
    new Blob([copiedBytes], { type: "application/msword" }),
    basename(copiedSourcePath),
  );
  const response = await fetch(`${connection.url}/forms/libreoffice/convert`, {
    method: "POST",
    headers: authHeaders(connection),
    body: form,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gotenberg LibreOffice conversion returned ${response.status}: ${detail.slice(0, 500)}`);
  }
  await writeFile(convertedCopyPath, new Uint8Array(await response.arrayBuffer()), { flag: "wx" });
}

export async function renderSourceEvidence({ id, outdir }: SourceEvidenceArguments): Promise<void> {
  const variant = listSourceVariants().find((entry) => entry.id === id);
  if (!variant) throw new Error(`Unknown source variant: ${id}`);

  await stat(variant.sourcePath);
  const gotenberg = assertConfiguredGotenberg(await loadDocRenderConfig());
  const approvedOutputDirectory = await prepareEvidenceOutputDirectory(outdir);

  const sourceCopyPath = await assertArtifactDestinationWritable(
    approvedOutputDirectory,
    `source-original${extname(variant.sourcePath)}`,
  );
  await copyFile(variant.sourcePath, sourceCopyPath, constants.COPYFILE_EXCL);
  const sourceHash = await sha256(variant.sourcePath);
  const copiedHash = await sha256(sourceCopyPath);
  if (sourceHash !== copiedHash) throw new Error("Retained source hash changed while copying evidence.");

  const convertedCopyPath = await assertArtifactDestinationWritable(
    approvedOutputDirectory,
    `${basename(sourceCopyPath, extname(sourceCopyPath))}.pdf`,
  );
  await convertCopiedSourceViaGotenberg(sourceCopyPath, convertedCopyPath, gotenberg);
  const pagePrefix = evidenceArtifactPath(approvedOutputDirectory, "page");
  const rasterizer = process.env.CODEX_BUNDLED_PDFTOPPM_PATH
    ?? "C:/Users/Rovick/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe";
  await assertNoExistingPageArtifacts(approvedOutputDirectory);
  await runCommand(rasterizer, ["-png", "-r", "150", convertedCopyPath, pagePrefix]);

  const pageFiles: string[] = [];
  for (let index = 1; ; index += 1) {
    const pagePath = `${pagePrefix}-${index}.png`;
    try {
      await stat(pagePath);
      assertContainedPath(approvedOutputDirectory, pagePath);
      pageFiles.push(pagePath);
    } catch {
      break;
    }
  }
  if (pageFiles.length === 0) throw new Error("PDF rasterization did not produce PNG pages.");

  const evidence = {
    variantId: variant.id,
    source: { path: variant.sourcePath, sha256: sourceHash },
    retainedOriginalCopy: sourceCopyPath,
    convertedCopy: await artifactMetadata(convertedCopyPath),
    pageCount: pageFiles.length,
    pages: await Promise.all(pageFiles.map(artifactMetadata)),
    renderer: {
      gotenbergLibreOffice: {
        origin: sanitizeRendererOrigin(gotenberg.url),
        endpoint: "/forms/libreoffice/convert",
        version: await gotenbergVersion(gotenberg),
        uploadedFile: basename(sourceCopyPath),
        requestField: "files",
      },
      rasterizer: {
        command: rasterizer,
        version: await commandVersion(rasterizer, ["-v"]),
        commandArguments: ["-png", "-r", "150", convertedCopyPath, pagePrefix],
        format: "png",
        dpi: 150,
      },
    },
  };
  await writeFile(
    await assertArtifactDestinationWritable(approvedOutputDirectory, "evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  renderSourceEvidence(parseArguments(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
