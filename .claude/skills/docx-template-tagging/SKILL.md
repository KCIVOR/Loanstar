---
name: docx-template-tagging
description: Use this skill when the user uploads a real, filled .docx sample document (e.g. a promissory note, mortgage, or other LSLGC legal document) and wants it turned into a document_templates entry with merge tags, so it renders correctly for any real borrower via the docx-upload template pipeline (docxtemplater + Gotenberg's LibreOffice route). Also use it when regenerating/fixing an existing docx-format template that produces wrong or hardcoded data.
user-invocable: true
---

# Turning a filled .docx sample into a real, tagged template

## When this applies

The user uploads a real `.docx` (or points at one on disk / in Storage) that
is a **filled sample** — real values for one specific borrower/loan baked
into the text — and wants it usable as a live template for every borrower.
This is the preferred workflow over hand-rebuilding a document as HTML in
the TipTap admin editor: a real `.docx` gets pixel-perfect fidelity for
free (no schema ceiling, no reproducing tab-stops/fonts by hand), at the
cost of needing tags inserted directly in the file's XML.

## The workflow

1. **Get the raw bytes.** If the file is already uploaded as a
   `document_templates` draft (`format = 'docx'`), download it from the
   `document-template-assets` Storage bucket via a service-role script
   (read `.env.local` for `SUPABASE_SERVICE_ROLE_KEY`, never hardcode it).
   If the user handed you a local path, read it directly.

2. **Extract `word/document.xml`** with `pizzip` (already a project
   dependency — see `src/lib/documents/render/docx-merge.ts`). Work on this
   raw XML string with plain Node scripts in the scratchpad directory —
   don't try to parse/mutate it as a DOM; targeted string search-and-replace
   on exact `<w:t>...</w:t>` contents is far more reliable for OOXML.

3. **Find the real, established field name for every value** before tagging
   anything. Check, in order:
   - `src/lib/lra/template-context.ts` (`buildReleaseTemplateContext`'s
     `base` object) — the single shared context every release template
     merges against. Most scalar fields (`borrowerName`, `address`,
     `principal`, `principalAndCentavosInWords`, `interestRateInWords`,
     `firstPaymentDate`, `installmentDayOrdinal`, `executionDate`,
     `executionPlace`, `borrowerTin`, `notaryDocNo`/`PageNo`/`BookNo`/
     `Series`, etc.) already exist here.
   - `src/lib/lra/blri-data.ts` (`BlriData`) — where loan-computed fields
     like `firstPaymentDate`/`installmentDayOrdinal` are actually derived,
     if you need to add a new one.
   - `src/lib/lra/collateral-context.ts` — the **repeating collateral
     arrays**, `vehicles: DocumentVehicleRow[]` (`makeYearModel`, `plateNo`,
     `engineNo`, `chassisNo`, `mvFileNo`, `crNo`, `registeredOwner`) and
     `properties: DocumentPropertyRow[]` (`location`, `tctNo`, `areaSqm`,
     `technicalDescription`) — these back every mortgage-family document
     (`deed_of_chattel_mortgage`, `real_estate_mortgage`,
     `cancellation_of_chattel_mortgage`, `cancellation_of_real_estate_mortgage`,
     `spa_mortgage_cancellation`, `voluntary_surrender_deed_auto/_rem`).
   - `src/lib/documents/templates/fields.ts` (`FIELD_GROUPS` /
     `buildSampleContext`) — the admin-preview sample catalog. **A field
     missing here will make docx upload-time validation reject the
     template** even though real generation would work fine (validation
     merges against the sample context, not the real one) — add the field
     here too if it's genuinely new. Never invent a field name that isn't
     one of these unless nothing existing fits; if you must add one, add it
     to `template-context.ts` (with a comment on why it's blank if there's
     no data source yet, matching the `notaryDocNo`-style convention) *and*
     `fields.ts` in the same pass.

4. **Replace each hardcoded value's `<w:t>` content** with the matching
   `{{fieldName}}` tag. Do a **case-insensitive full-document sweep** for
   every source value before considering a field done — the same value
   (e.g. a borrower's name or address) is often duplicated across several
   *differently-formatted* runs: the opening paragraph, a signature block,
   a notary/ID table, and — easy to miss — a rotated vertical sidebar text
   box (`<w:txbxContent>`) that can repeat across every page as a linked
   frame chain, sometimes in a different case (ALL CAPS vs mixed case) than
   the main paragraph. Don't assume "found it once" means "found it
   everywhere."

5. **Watch for Word `LINK` fields with a stray artifact risk.** Real
   Excel-linked source documents often wrap a cached value in a full field
   structure: `fldChar begin` → `instrText" LINK Excel.Sheet...` → `fldChar
   separate` → the visible `<w:t>` result → `fldChar end`. Editing only the
   visible `<w:t>` while leaving the link wrapper intact is usually fine —
   **except** when the field carries a `\* MERGEFORMAT` switch, which can
   make LibreOffice render a stray glyph (observed: a trailing "X") next to
   the tag in a vertical/rotated text box. If you see an unexplained stray
   character after rendering, strip that field down to a single plain
   `<w:r><w:t>{{field}}</w:t></w:r>` run (removing the begin/instrText/
   separate/end wrapper entirely) rather than debugging the field further —
   it's dead weight pointing at a source Excel file that doesn't exist on
   the server anyway.

6. **Collapsing a repeating section can expose a stray-glyph artifact in
   unrelated absolute-positioned text boxes** (e.g. a rotated margin name
   label, seen on `deed_of_chattel_mortgage`). Deleting real content to
   collapse 3 sample vehicle tables into 1 loop row shortens the page,
   which can shift where a `position:absolute` VML text box (`<w:pict>` /
   `<v:shape>`) lands relative to page boundaries in LibreOffice's
   conversion — producing a small stray mark (observed: an "X") that
   wasn't there in the original, unedited render. This is NOT caused by
   the field/tag content itself (confirmed by isolating: swapping text
   alone doesn't trigger it, only removing bulk content does), and no
   full fix was found in the time spent on it — the practical options are
   (a) ship it and flag the cosmetic issue to the user (their call whether
   it matters), since it doesn't touch any real contract text, or (b)
   delete the decorative margin text box(es) entirely if the user doesn't
   need them. Don't sink excessive effort chasing this class of artifact —
   confirm real content is correct and unaffected first, then decide with
   the user rather than debugging indefinitely.

7. **Repeat structures (see "Reusable templates" below) before assuming a
   value is scalar** — count how many times a value-looking block repeats
   in the sample; if more than one, it's very likely a collateral/PDC/
   co-borrower loop, not several independent fields.

## Reusable templates with a variable-length section (e.g. mortgage collateral)

**The question:** a mortgage document's collateral table (or a PDC check
schedule, or a multi-co-borrower block) has a different number of rows
depending on the loan — one borrower has 1 vehicle, another has 3. What
should the user upload as the sample, since any single filled sample has a
*fixed* number of rows?

**The answer:** upload a sample with **at least 2 real filled rows** (3 is
even better) of that repeating section — not because the final template
will be limited to that count, but because seeing 2+ real instances side by
side is how you confirm the row's exact XML structure repeats identically
(same cell count, same formatting, no per-instance quirks) before
collapsing it. The uploaded row *count* itself is thrown away once tagging
is done — docxtemplater repeats whatever single tagged row you leave behind
however many times the real array has at render time (1 item, 5 items,
whatever), because the array (`vehicles`, `properties`, `demandChecks`,
`pdcSchedule`, etc.) genuinely varies at generation time regardless of what
the sample showed.

**Mechanically, once you've found the field name (step 3 above):**

- Keep exactly **one** instance of the repeating row/block in the XML;
  delete the rest of the sample's duplicate rows entirely.
- For a **table row**: put `{{#arrayFieldName}}` at the very start of the
  first cell's text and `{{/arrayFieldName}}` at the very end of the last
  cell's text, in that same row — this is docxtemplater's row-loop
  convention (a loop tag spanning a full `<w:tr>` repeats the row, not just
  the tag's inner text). Same open/close field name, exactly like this
  project's HTML convention `<tr data-repeat="vehicles">`.
- For a **paragraph block** (not a table row) — e.g. a repeated "parcel of
  land" description — wrap the whole paragraph or paragraph group the same
  way: `{{#properties}}` at the very start of the first paragraph, `{{/
  properties}}` at the very end of the last paragraph in that block.
  Matches the HTML convention's `<div data-repeat="properties">`.
- Tag each per-item value inside the row/block with the array item's own
  field name (e.g. `{{makeYearModel}}`, `{{plateNo}}`, `{{engineNo}}` for a
  vehicle row) — not the top-level context's names, docxtemplater resolves
  these against each array element while inside the loop.
- **Verify with a multi-item context, not just the 1-item sample context.**
  `buildSampleContext()` / a hand-built test context should include at
  least 2 array items so the merge test actually proves the row repeats
  (and that nothing outside the loop — headers, borders — gets duplicated
  or broken).

## Verification (do this before ever uploading)

1. `mergeDocxTemplate(bytes, context)` from
   `src/lib/documents/render/docx-merge.ts` — throws a specific, named
   error for any unresolved tag (case-sensitive), so a clean run here means
   every tag you wrote actually matches a real context key.
2. `officeToPdfViaGotenberg(mergedBytes, { connection })` from
   `src/lib/documents/render/gotenberg-office.ts` (connection via
   `loadDocRenderConfig()` from `engine-config.ts`) — renders the real PDF
   through the same LibreOffice route production uses.
3. Rasterize with the bundled Poppler `pdftoppm.exe` (see other sessions'
   commands — same binary used throughout this project) and **read every
   page** with the Read tool. Compare against the original source
   visually, not just by re-reading the XML text — formatting bugs (like
   the MERGEFORMAT artifact above) only show up in the rendered image.
4. Do a final case-insensitive sweep of the tagged XML for every literal
   value from the source sample (name, address, amounts, dates, ID
   numbers) to confirm zero hardcoded leftovers anywhere in the document.

## Publishing a new draft version

Insert directly into `document_template_versions` via a service-role
script (mirroring `uploadTemplateAssetBytes`/`buildTemplateAssetPath` from
`src/lib/documents/template-storage.ts`): upload the tagged `.docx` to
`document-template-assets` at `templates/{templateId}/{versionId}.docx`,
then insert a row with `status = 'draft'`, `format = 'docx'`,
`docx_storage_path` set, `body = null`. **Never set `status = 'published'`
yourself** — that action is gated and must be done by the user in the
Admin UI. Tell them a new draft version exists and needs publishing.

If you touched an *already-published* version's docx by mistake, the DB's
immutability trigger will simply reject the write — that's expected; make
a new draft version instead of trying to force it.

## Known infra gotcha (already fixed once, may resurface for a new project)

The `document-template-assets` Storage bucket's SELECT RLS policy must
allow reading a `published` version's file to **any authenticated user**,
matching `document_template_versions`' own long-standing rule (any
authenticated user may read a `published` row — see that table's original
migration comment). If real generation 500s with "Failed to download
template asset: Object not found" for a docx-format template, but you can
download the exact same file fine with the service-role key, this is
almost certainly the same RLS gap — check
`supabase/migrations/20260925140000_docx_template_assets_published_read.sql`
is applied to the target Supabase project.

## Housekeeping

- Delete every scratch file (`.mjs`/`.mts`/`.xml`/`.docx`/`.pdf`/`.png`) you
  create in the repo root or scratchpad once done — never commit them.
- If you generate a real document against a live loan application while
  testing (directly calling `generateReleaseDocumentBySlug` to reproduce a
  bug, for example), delete the resulting `generated_documents` row and its
  Storage object afterward unless it's already correct data the user
  wants kept — a debug run must never leave wrong data sitting on a real
  borrower's file.
- If you add a genuinely new field, add matching test coverage the same
  way `installmentDayOrdinal`/`borrowerIdIssuedOn` were added: a unit test
  on the field's computation (if any), an assertion in
  `template-context.test.mts` that it's wired into the shared context, and
  keep the repo's `fields.ts` sample in sync.
