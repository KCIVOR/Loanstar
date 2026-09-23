# Document source evidence

This folder records source references and reproducible visual evidence for document-fidelity work. Client originals remain read-only authorities; evidence is generated from copied originals and is only used for QA comparison.

## Generate source evidence

The command requires the configured Admin Chromium/Gotenberg service. It reads the saved renderer configuration through `loadDocRenderConfig()`, rejects a non-Chromium or unconfigured service, uploads only the disposable copy to Gotenberg's LibreOffice conversion endpoint, and uses bundled Poppler to rasterize the returned PDF. It never sends a retained client source file or uses a desktop LibreOffice installation.

```powershell
node --import tsx scripts/document-fidelity/render-source-evidence.mts --id sf-disclosure-statement --outdir C:\absolute\path\to\tmp\document-fidelity\sf-disclosure
```

The command accepts one registered source variant and an absolute output directory. It rejects output paths inside either client source directory. It copies the retained legacy original to the output directory, hashes the retained original, converts only that copy to PDF, rasterizes PNG pages, and writes `evidence.json` with the source path/hash, converted-copy path, page count, Gotenberg endpoint/version, and rasterizer version.

The generated PDF and PNG files are QA-only intermediates. They are not replacements for the originals and must not be uploaded or used as production document templates.

## Established source geometry

`sf-disclosure-statement` (`DISC.doc`) was rendered through the configured Gotenberg LibreOffice endpoint on 2026-09-22 and produced exactly one 150-DPI PNG page. Visual inspection confirmed a compact single-page layout with underline-based borrower, value, rate, amount, and signature fields; the source form does not use grid tables for those fields. Its one-page geometry is the reference for the later generated Disclosure Statement comparison; no template body is changed by this evidence step.

## Generated Disclosure Statement comparison

On 2026-09-22, the active published `disclosure_statement` was rendered through the configured
Chromium/Gotenberg path with `buildSampleContext()`. It produced one PDF page and one 150-DPI PNG,
which matches the `sf-disclosure-statement` source page count. This is page-count evidence only;
the generated document is **not** yet a strict geometry match.

Remaining visual differences observed in the side-by-side PNG review:

- The generated body occupies substantially less vertical space, with a large unused lower-page
  area; the source uses the page through the borrower/co-borrower acknowledgement area.
- The source uses a sans-serif family and a smaller, higher title block; the generated output uses
  a serif family, a larger title, and a lower logo/title origin.
- The source order is borrower, company, then address. The generated order is borrower, address,
  then company; their underline lengths and left/right coordinates also differ.
- Source item 10 includes three ruled columns (`Nature`, `Rate`, and `Amount`). The generated item
  10 has no corresponding ruled-entry area.
- The source has separate borrower and co-borrower signature/date rows. This sample generated
  output contains one centered borrower signature/date arrangement only.
- The source certification block includes a ruled authorized-signatory line and a separate
  position line; the generated certification labels and rule positions differ.
- Checkbox/rate/date underlines and numeric columns do not share the source's exact coordinates or
  widths. The generated PDF also adds a `Page 1 of 1` footer, which is not present in the source
  evidence page.

No template body or database record was changed by this comparison. Later fidelity work must retain
the one-page result while resolving every item above against `DISC.doc` and the applicable borrower
variant.
