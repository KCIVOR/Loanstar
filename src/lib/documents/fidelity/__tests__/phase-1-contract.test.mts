import { readFile } from "node:fs/promises";
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
