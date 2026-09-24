import test from "node:test";
import assert from "node:assert/strict";

import PizZip from "pizzip";

import { DocxTemplateMergeError, mergeDocxTemplate } from "../docx-merge";

/**
 * Builds the smallest valid .docx PizZip can open and docxtemplater can
 * process — just enough Office Open XML parts (no real Word app involved),
 * so this test needs no binary fixture checked into the repo. `bodyXml` is
 * the `<w:body>` inner content, e.g. one `<w:p><w:r><w:t>{{field}}</w:t>
 * </w:r></w:p>` per line/tag under test.
 */
function buildMinimalDocx(bodyXml: string): Buffer {
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
<w:body>${bodyXml}</w:body>
</w:document>`,
  );
  return zip.generate({ type: "nodebuffer" });
}

test("mergeDocxTemplate resolves a scalar {{field}} tag", () => {
  const docx = buildMinimalDocx(
    "<w:p><w:r><w:t>Borrower: {{borrowerName}}</w:t></w:r></w:p>",
  );
  const filled = mergeDocxTemplate(docx, { borrowerName: "Elven Del Monte Cayanan" });
  const zip = new PizZip(filled);
  const xml = zip.file("word/document.xml")!.asText();
  assert.match(xml, /Borrower: Elven Del Monte Cayanan/);
  assert.doesNotMatch(xml, /\{\{borrowerName\}\}/);
});

test("mergeDocxTemplate resolves a {{#loop}} over an array field, same context shape buildReleaseTemplateContext produces", () => {
  const docx = buildMinimalDocx(
    "<w:p><w:r><w:t>{{#vehicles}}{{makeYearModel}} {{/vehicles}}</w:t></w:r></w:p>",
  );
  const filled = mergeDocxTemplate(docx, {
    vehicles: [{ makeYearModel: "Toyota Vios 2020" }, { makeYearModel: "Honda City 2021" }],
  });
  const zip = new PizZip(filled);
  const xml = zip.file("word/document.xml")!.asText();
  assert.match(xml, /Toyota Vios 2020/);
  assert.match(xml, /Honda City 2021/);
});

test("mergeDocxTemplate resolves a {{#flag}}...{{/flag}} conditional (docxtemplater has no separate {{#if}} keyword — a truthy scalar under the same open/close tag name shows once, same as a one-item loop)", () => {
  const docx = buildMinimalDocx(
    "<w:p><w:r><w:t>{{#hasSpouse}}and spouse {{spouseName}}{{/hasSpouse}}</w:t></w:r></w:p>",
  );
  const shown = mergeDocxTemplate(docx, { hasSpouse: true, spouseName: "Marievic Flores Cayanan" });
  assert.match(
    new PizZip(shown).file("word/document.xml")!.asText(),
    /and spouse Marievic Flores Cayanan/,
  );

  const hidden = mergeDocxTemplate(docx, { hasSpouse: false, spouseName: "Marievic Flores Cayanan" });
  assert.doesNotMatch(
    new PizZip(hidden).file("word/document.xml")!.asText(),
    /Marievic Flores Cayanan/,
  );
});

test("mergeDocxTemplate throws DocxTemplateMergeError with a readable message when a file isn't a real zip/docx", () => {
  assert.throws(
    () => mergeDocxTemplate(Buffer.from("not a docx"), {}),
    (err: unknown) => err instanceof DocxTemplateMergeError && /not a valid \.docx/.test(err.message),
  );
});

test("mergeDocxTemplate throws DocxTemplateMergeError naming the bad tag on a malformed template", () => {
  // Unbalanced loop tag — opens {{#vehicles}} but never closes it.
  const docx = buildMinimalDocx(
    "<w:p><w:r><w:t>{{#vehicles}}{{makeYearModel}}</w:t></w:r></w:p>",
  );
  assert.throws(
    () => mergeDocxTemplate(docx, { vehicles: [] }),
    (err: unknown) => err instanceof DocxTemplateMergeError,
  );
});
