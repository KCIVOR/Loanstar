# Document Fidelity Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Establish source-backed SF and Disclosure template fidelity, including reproducible source evidence, explicit SF variant resolution, and Chromium-rendered comparison fixtures.

**Architecture:** Retained documents remain read-only source evidence. A repository manifest records each approved original's source path, checksum, variant dimensions, and required geometry. A pure resolver selects an SF variant from documented facts; database-backed template bodies are changed only after their matching evidence is present.

**Tech Stack:** TypeScript, Node test runner with tsx, Supabase, HTML/CSS document templates, Docker Gotenberg/Chromium.

---

### Task 1: Register source variants

**Files:**
- Create: `docs/document-fidelity/source-registry.json`
- Create: `src/lib/documents/fidelity/source-registry.ts`
- Test: `src/lib/documents/fidelity/__tests__/source-registry.test.mts`

- [ ] Write tests first for the SF disclosure lookup and the spouse/non-spouse ATM lookup. The lookup must return null when required dimensions are absent and must never select a Backup source.
- [ ] Run `node --import tsx --test src/lib/documents/fidelity/__tests__/source-registry.test.mts` and confirm it fails because the registry does not exist.
- [ ] Implement typed source entries for `DISC.doc`, `PN.doc`, `DL2 - No address.doc`, `AR ATM.doc`, and `AR ATM - With Spouse.doc`. Store their exact absolute paths, family, required variant dimensions, template slug, and known page target. Do not create fallback matching.
- [ ] Re-run the focused test and commit only these files with `feat: register SF document source variants`.

### Task 2: Resolve exact SF branches

**Files:**
- Create: `src/lib/documents/generators/sf-document-context.ts`
- Test: `src/lib/documents/generators/__tests__/sf-document-context.test.mts`

- [ ] Write tests first for Disclosure, Promissory Note, second demand notice without address, and ATM with/without spouse.
- [ ] Run the focused test and confirm the resolver is missing.
- [ ] Implement the pure resolver using the source registry. Require `hasSpouse` for ATM and return null for unsupported or incomplete input.
- [ ] Re-run the focused test and commit only this resolver and its test with `feat: resolve SF document source branches`.

### Task 3: Produce read-only source evidence

**Files:**
- Create: `scripts/document-fidelity/render-source-evidence.mts`
- Create: `docs/document-fidelity/README.md`
- Test: `src/lib/documents/fidelity/__tests__/source-registry.test.mts`

- [ ] Extend tests first so every source variant records an explicit page target only when established by source inspection.
- [ ] Implement a script accepting `--id <variant-id> --outdir <path>`. It must copy the legacy original to the supplied output directory, hash the retained original, convert the copy with the bundled LibreOffice runtime, render it to PNGs, and write `evidence.json` with hash, path, conversion details, and page count. It must never write below either client source directory.
- [ ] Render `sf-disclosure`, inspect the resulting PNG at full page size, and record the one-page geometry evidence in the README.
- [ ] Commit only this task with `feat: add document source rendering evidence`.

### Task 4: Gate generated output through Chromium

**Files:**
- Create: `scripts/document-fidelity/render-generated-evidence.mts`
- Test: `src/lib/documents/fidelity/__tests__/phase-1-contract.test.mts`
- Modify: `docs/document-fidelity/README.md`

- [ ] Write a failing source-contract test requiring the generated-evidence script to use `loadDocRenderConfig` and explicit `engine: "chromium"`.
- [ ] Implement `--slug <slug> --outdir <path>`: load the published template body with existing Supabase credentials, reject a non-Chromium renderer, render with configured Gotenberg, and write PDF/PNG output only under the supplied output directory. Do not mutate Supabase.
- [ ] Render `disclosure_statement` and compare it manually against `sf-disclosure`; record page count and every remaining visual difference in the README without modifying the template in this foundation phase.
- [ ] Run the focused Phase 1 suite and commit only this task with `test: gate phase one documents on Chromium evidence`.

