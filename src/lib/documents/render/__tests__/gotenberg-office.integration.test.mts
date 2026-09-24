import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import PizZip from "pizzip";

import { officeToPdfViaGotenberg } from "../gotenberg-office";

/**
 * Gotenberg's LibreOffice conversion route (`/forms/libreoffice/convert`) —
 * confirmed reachable on this project's deployment via a one-off spike
 * before this feature was built (see the "Upload a Word file as template"
 * plan). SKIPPED unless `GOTENBERG_URL` is set, same convention as
 * chromium.integration.test.mts, because it needs the deployed service.
 */
const LIVE = Boolean(process.env.GOTENBERG_URL);

function buildMinimalDocx(): Buffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t>Gotenberg office-conversion integration test</w:t></w:r></w:p></w:body>
</w:document>`,
  );
  return zip.generate({ type: "nodebuffer" });
}

test("officeToPdfViaGotenberg: converts a minimal .docx to a valid PDF", { skip: !LIVE }, async () => {
  const docx = buildMinimalDocx();
  const pdf = await officeToPdfViaGotenberg(docx);
  assert.ok(pdf.length > 500);
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("latin1"), "%PDF-");
});

test(
  "officeToPdfViaGotenberg: converts the real Disclosure Statement source (.doc) — same file the document-fidelity spike used",
  { skip: !LIVE },
  async () => {
    // Best-effort: only runs if the source folder is present on this
    // machine (it's a local Downloads path, not part of the repo).
    const sourcePath = "C:/Users/Rovick/Downloads/SFCalculator/DISC.doc";
    let bytes: Buffer;
    try {
      bytes = await readFile(sourcePath);
    } catch {
      return;
    }
    const pdf = await officeToPdfViaGotenberg(bytes);
    assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("latin1"), "%PDF-");
  },
);
