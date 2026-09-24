import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { loadDocRenderConfig } from "../../src/lib/documents/render/engine-config";
import type { DocRenderConnection, ResolvedDocRenderConfig } from "../../src/lib/documents/render/engine-config";
import { renderTemplateToPdf } from "../../src/lib/documents/render/index";
import { buildSampleContext } from "../../src/lib/documents/templates/fields";

export type GeneratedEvidenceArguments = {
  slug: string;
  outdir: string;
  envFile?: string;
};

type PublishedTemplateRow = {
  body: string;
};

type GeneratedEvidenceRuntimeEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type PublishedTemplateQuery = {
  select(columns: string): PublishedTemplateQuery;
  eq(column: string, value: string | boolean): PublishedTemplateQuery;
  limit(count: number): Promise<{
    data: Array<{ document_template_versions?: PublishedTemplateRow[] }> | null;
    error: { message: string } | null;
  }>;
};

export type GeneratedEvidenceSupabaseClient = {
  from(table: "document_templates"): PublishedTemplateQuery;
};

export type GeneratedEvidenceSupabaseClientFactory = (
  url: string,
  serviceRoleKey: string,
) => GeneratedEvidenceSupabaseClient;

type SourceEvidenceSafety = {
  assertArtifactDestinationWritable: (directory: string, filename: string) => Promise<string>;
  prepareEvidenceOutputDirectory: (directory: string) => Promise<string>;
};

async function sourceEvidenceSafety(): Promise<SourceEvidenceSafety> {
  return import(new URL("./render-source-evidence.mts", import.meta.url).href) as Promise<SourceEvidenceSafety>;
}

function requireArgument(value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error("Usage: render-generated-evidence --slug <slug> --outdir <absolute-path> [--env-file <absolute-path>]");
  }
  return value;
}

export function parseGeneratedEvidenceArguments(arguments_: readonly string[]): GeneratedEvidenceArguments {
  let slug: string | undefined;
  let outdir: string | undefined;
  let envFile: string | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--slug") slug = requireArgument(arguments_[index + 1]);
    if (argument === "--outdir") outdir = requireArgument(arguments_[index + 1]);
    if (argument === "--env-file") envFile = requireArgument(arguments_[index + 1]);
  }

  if (!slug || !outdir || !isAbsolute(outdir) || (envFile && !isAbsolute(envFile))) {
    throw new Error("Usage: render-generated-evidence --slug <slug> --outdir <absolute-path> [--env-file <absolute-path>]");
  }

  return { slug, outdir, ...(envFile ? { envFile } : {}) };
}

function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const quoted = rawValue.match(/^(["'])(.*)\1$/);
    values[key] = quoted ? quoted[2] : rawValue.replace(/\s+#.*$/, "");
  }
  return values;
}

export async function loadRuntimeEnvironment(envFile?: string): Promise<void> {
  if (!envFile) return;
  const values = parseEnvFile(await readFile(envFile, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export async function prepareEmptyGeneratedEvidenceOutputDirectory(outputDirectory: string): Promise<string> {
  const { prepareEvidenceOutputDirectory } = await sourceEvidenceSafety();
  const approvedDirectory = await prepareEvidenceOutputDirectory(outputDirectory);
  const entries = await readdir(approvedDirectory);
  if (entries.length > 0) {
    throw new Error("Generated evidence output directory must be empty.");
  }
  return approvedDirectory;
}

export async function assertGeneratedEvidenceOutputFiles(outputDirectory: string): Promise<void> {
  const entries = await readdir(outputDirectory, { withFileTypes: true });
  const allowedName = (name: string): boolean => name === "generated.pdf" || /^page-\d+\.png$/i.test(name);
  if (
    entries.some((entry) => !entry.isFile() || !allowedName(entry.name))
    || !entries.some((entry) => entry.name === "generated.pdf")
    || !entries.some((entry) => /^page-\d+\.png$/i.test(entry.name))
  ) {
    throw new Error("Generated evidence output may contain only generated.pdf and page-N.png files.");
  }
}

export function assertGeneratedEvidenceChromium(config: ResolvedDocRenderConfig): DocRenderConnection {
  if (config.engine !== "chromium" || config.misconfigured || !config.connection.url) {
    throw new Error("Generated evidence requires the configured Chromium/Gotenberg conversion path.");
  }
  return config.connection;
}

function runCommand(command: string, arguments_: string[]): Promise<void> {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, arguments_, { shell: false, windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.on("error", rejectCommand);
    child.on("close", (code) => {
      if (code === 0) return resolveCommand();
      rejectCommand(new Error(`${command} failed with exit code ${code}: ${output}`));
    });
  });
}

export async function fetchPublishedTemplateBody(
  slug: string,
  createSupabaseClient: GeneratedEvidenceSupabaseClientFactory = (url, serviceRoleKey) => (
    createClient(url, serviceRoleKey, { auth: { persistSession: false } }) as unknown as GeneratedEvidenceSupabaseClient
  ),
  runtimeEnvironment?: GeneratedEvidenceRuntimeEnvironment,
): Promise<string> {
  const url = runtimeEnvironment?.NEXT_PUBLIC_SUPABASE_URL ?? process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = runtimeEnvironment?.SUPABASE_SERVICE_ROLE_KEY ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) {
    throw new Error("Generated evidence requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY at runtime.");
  }
  const supabase = createSupabaseClient(url, serviceRoleKey);
  const { data, error } = await supabase
    .from("document_templates")
    .select("document_template_versions!inner(body, status)")
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("document_template_versions.status", "published")
    .limit(1);
  if (error) throw new Error(`Unable to load active published template ${slug}: ${error.message}`);
  const row = data?.[0] as { document_template_versions?: PublishedTemplateRow[] } | undefined;
  const body = row?.document_template_versions?.[0]?.body;
  if (!body) throw new Error(`No active published template body found for ${slug}.`);
  return body;
}

export async function renderGeneratedEvidence(arguments_: GeneratedEvidenceArguments): Promise<void> {
  await loadRuntimeEnvironment(arguments_.envFile);
  const outputDirectory = await prepareEmptyGeneratedEvidenceOutputDirectory(arguments_.outdir);
  const config = await loadDocRenderConfig();
  const { assertArtifactDestinationWritable } = await sourceEvidenceSafety();
  const connection = assertGeneratedEvidenceChromium(config);
  const body = await fetchPublishedTemplateBody(arguments_.slug);
  const pdf = await renderTemplateToPdf(body, buildSampleContext(), {
    engine: "chromium",
    connection,
  });
  const pdfPath = await assertArtifactDestinationWritable(outputDirectory, "generated.pdf");
  await writeFile(pdfPath, pdf, { flag: "wx" });

  const rasterizer = process.env.CODEX_BUNDLED_PDFTOPPM_PATH
    ?? "C:/Users/Rovick/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe";
  await runCommand(rasterizer, ["-png", "-r", "150", pdfPath, resolve(outputDirectory, "page")]);
  try {
    await stat(resolve(outputDirectory, "page-1.png"));
  } catch {
    throw new Error("Generated PDF rasterization did not produce PNG pages.");
  }
  await assertGeneratedEvidenceOutputFiles(outputDirectory);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const arguments_ = parseGeneratedEvidenceArguments(process.argv.slice(2));
    await renderGeneratedEvidence(arguments_);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
