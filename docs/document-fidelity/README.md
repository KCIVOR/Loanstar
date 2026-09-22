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
