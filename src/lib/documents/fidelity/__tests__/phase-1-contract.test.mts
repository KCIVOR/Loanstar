import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const scriptUrl = new URL(
  "../../../../../scripts/document-fidelity/render-generated-evidence.mts",
  import.meta.url,
);

test("generated evidence renderer is locked to the configured Chromium path", async () => {
  const source = await readFile(fileURLToPath(scriptUrl), "utf8");

  assert.match(source, /loadDocRenderConfig/);
  assert.match(source, /engine:\s*"chromium"/);
  assert.doesNotMatch(source, /engine:\s*"pdfmake"/);
});

test("generated evidence CLI requires slug and an absolute empty output directory", async () => {
  const { parseGeneratedEvidenceArguments } = await import(scriptUrl.href);

  assert.deepEqual(
    parseGeneratedEvidenceArguments([
      "--slug", "disclosure_statement",
      "--outdir", "C:/workspace/tmp/generated-disclosure",
      "--env-file", "C:/workspace/.env.local",
    ]),
    {
      slug: "disclosure_statement",
      outdir: "C:/workspace/tmp/generated-disclosure",
      envFile: "C:/workspace/.env.local",
    },
  );
  assert.throws(
    () => parseGeneratedEvidenceArguments(["--slug", "disclosure_statement", "--outdir", "relative/output"]),
    /Usage: render-generated-evidence/i,
  );
});

test("generated evidence fetch selects only the active published template and never mutates", async () => {
  const { fetchPublishedTemplateBody } = await import(scriptUrl.href);
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    select(value: string) { calls.push(["select", value]); return this; },
    eq(column: string, value: unknown) { calls.push(["eq", column, value]); return this; },
    limit(value: number) {
      calls.push(["limit", value]);
      return Promise.resolve({ data: [{ document_template_versions: [{ body: "<p>published</p>" }] }], error: null });
    },
  };
  const createSupabaseClient = () => ({
    from(table: string) { calls.push(["from", table]); return query; },
  });

  const body = await fetchPublishedTemplateBody(
    "disclosure_statement",
    createSupabaseClient,
    { NEXT_PUBLIC_SUPABASE_URL: "https://supabase.example", SUPABASE_SERVICE_ROLE_KEY: "service-role" },
  );

  assert.equal(body, "<p>published</p>");
  assert.deepEqual(calls, [
    ["from", "document_templates"],
    ["select", "document_template_versions!inner(body, status)"],
    ["eq", "slug", "disclosure_statement"],
    ["eq", "is_active", true],
    ["eq", "document_template_versions.status", "published"],
    ["limit", 1],
  ]);
});

test("generated evidence rejects fallback and misconfigured Chromium renderers", async () => {
  const { assertGeneratedEvidenceChromium } = await import(scriptUrl.href);

  assert.throws(
    () => assertGeneratedEvidenceChromium({ engine: "pdfmake", misconfigured: false, connection: { url: "https://renderer.example", user: "", pass: "" } }),
    /Chromium\/Gotenberg/i,
  );
  assert.throws(
    () => assertGeneratedEvidenceChromium({ engine: "chromium", misconfigured: true, connection: { url: "", user: "", pass: "" } }),
    /Chromium\/Gotenberg/i,
  );
});

test("generated evidence rejects non-empty and retained-source output directories", async () => {
  const { prepareEmptyGeneratedEvidenceOutputDirectory } = await import(scriptUrl.href);
  const directory = await mkdtemp(join(tmpdir(), "generated-evidence-output-"));
  try {
    await writeFile(join(directory, "prior.pdf"), "prior");
    await assert.rejects(
      () => prepareEmptyGeneratedEvidenceOutputDirectory(directory),
      /must be empty/i,
    );
    await assert.rejects(
      () => prepareEmptyGeneratedEvidenceOutputDirectory("C:/Users/Rovick/Downloads/SFCalculator/generated-evidence"),
      /must not be written below a retained client source directory/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("generated evidence rejects output paths with a reparse-point component", async (t) => {
  const { prepareEmptyGeneratedEvidenceOutputDirectory } = await import(scriptUrl.href);
  const root = await mkdtemp(join(tmpdir(), "generated-evidence-link-"));
  const target = join(root, "target");
  const link = join(root, "link");
  try {
    await mkdir(target);
    try {
      await symlink(target, link, "junction");
    } catch (error) {
      t.skip(`Symlink/junction creation is unavailable: ${String(error)}`);
      return;
    }
    await assert.rejects(() => prepareEmptyGeneratedEvidenceOutputDirectory(link), /reparse point/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generated evidence output allowlist permits only the PDF and numbered page PNGs", async () => {
  const { assertGeneratedEvidenceOutputFiles } = await import(scriptUrl.href);
  const directory = await mkdtemp(join(tmpdir(), "generated-evidence-files-"));
  try {
    await writeFile(join(directory, "generated.pdf"), "pdf");
    await writeFile(join(directory, "page-1.png"), "png");
    await writeFile(join(directory, "page-2.png"), "png");
    await assert.doesNotReject(() => assertGeneratedEvidenceOutputFiles(directory));
    await writeFile(join(directory, "evidence.json"), "not permitted");
    await assert.rejects(() => assertGeneratedEvidenceOutputFiles(directory), /only generated\.pdf and page-N\.png/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
