import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const {
  artifactMetadata,
  assertArtifactDestinationWritable,
  assertConfiguredGotenberg,
  assertSafeEvidenceOutputDirectory,
  prepareEvidenceOutputDirectory,
  sanitizeRendererOrigin,
} = await import(
  new URL("../../../../../scripts/document-fidelity/render-source-evidence.mts", import.meta.url).href,
);

test("rejects evidence output paths below retained client source directories", () => {
  assert.throws(
    () => assertSafeEvidenceOutputDirectory("C:/Users/Rovick/Downloads/SFCalculator/evidence"),
    /must not be written below a retained client source directory/i,
  );
  assert.throws(
    () => assertSafeEvidenceOutputDirectory("C:/Users/Rovick/Downloads/LSLGC Calculator and Docs/evidence"),
    /must not be written below a retained client source directory/i,
  );
});

test("requires the configured Chromium Gotenberg conversion path", () => {
  assert.deepEqual(
    assertConfiguredGotenberg({
      engine: "chromium",
      misconfigured: false,
      connection: { url: "https://gotenberg.example", user: "user", pass: "pass" },
    }),
    { url: "https://gotenberg.example", user: "user", pass: "pass" },
  );
  assert.throws(
    () => assertConfiguredGotenberg({
      engine: "pdfmake",
      misconfigured: false,
      connection: { url: "https://gotenberg.example", user: "", pass: "" },
    }),
    /configured Chromium\/Gotenberg/i,
  );
});

test("allows an evidence output directory outside retained client sources", () => {
  assert.doesNotThrow(() => {
    assertSafeEvidenceOutputDirectory("C:/workspace/tmp/document-fidelity/sf-disclosure");
  });
});

test("sanitizes renderer origins without userinfo, query, or paths", () => {
  assert.equal(
    sanitizeRendererOrigin("https://user:secret@gotenberg.example:8443/private?token=secret#fragment"),
    "https://gotenberg.example:8443",
  );
});

test("records SHA-256 and byte size for an evidence artifact", async () => {
  const directory = await mkdtemp(join(tmpdir(), "source-evidence-metadata-"));
  const artifact = join(directory, "artifact.bin");
  await writeFile(artifact, "evidence");
  try {
    assert.deepEqual(await artifactMetadata(artifact), {
      path: artifact,
      sha256: "ee8250fb76e094b34b471f13a73dbbe51d1ae142e9df59d7c0d31ec20f0a0a8e",
      bytes: 8,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a symlinked evidence directory when the platform permits it", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "source-evidence-link-"));
  const target = join(root, "target");
  const link = join(root, "link");
  try {
    const { mkdir, symlink } = await import("node:fs/promises");
    await mkdir(target);
    try {
      await symlink(target, link, "junction");
    } catch (error) {
      t.skip(`Symlink/junction creation is unavailable: ${String(error)}`);
      return;
    }
    await assert.rejects(() => prepareEvidenceOutputDirectory(link), /reparse point/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a pre-existing source artifact symlink before it can be overwritten", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "source-evidence-artifact-link-"));
  const artifact = join(directory, "source-original.doc");
  try {
    const { symlink } = await import("node:fs/promises");
    try {
      await symlink("C:/Users/Rovick/Downloads/SFCalculator/DISC.doc", artifact, "file");
    } catch (error) {
      t.skip(`Symlink creation is unavailable: ${String(error)}`);
      return;
    }
    await assert.rejects(
      () => assertArtifactDestinationWritable(directory, "source-original.doc"),
      /pre-existing reparse point/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
