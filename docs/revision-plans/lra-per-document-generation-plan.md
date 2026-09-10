# LRA per-document generation — pick-list modal + per-doc Generate/Regenerate/Remove + admin-set eligibility

**Status:** IMPLEMENTED (2026-09-10, direct) — all 11 phases, uncommitted on `develop`
**Branch:** `develop`
**Origin:** client agreed 2026-09-10 to replace the single auto-generate button.
Instead of the system pre-deciding the document set from release path + collateral
+ segment, the LRA officer opens a modal, sees a list of documents, and generates
/ regenerates each one individually — they already know which docs that loan needs.

**Includes Option B (chosen by the user 2026-09-10):** which documents are in
scope for Seafarer vs SME/Individual generation becomes an **admin setting on
each template** (Always / Optional / Hidden per segment group), instead of the
hardcoded `AUTO_GENERATED_SLUGS` list. The *conditions* (release path decides the
voucher pair; collateral type decides chattel/REM; a template must have a
published version) **stay in code** — they are logic, not preferences. See
section **G**.

---

## Confirmed scope (from the user, 2026-09-10)

1. **List contents by segment** — now driven by the per-template admin setting
   (section G), seeded to reproduce today's behaviour exactly.
   - **Seafarer ("SF"):** the modal shows every `release` template whose
     **`seafarer_generation`** is `always` or `optional`, then narrowed in code
     by release path (voucher pair) + published-version check. Seed makes this
     the current flat **7 rows**: BLRI, Promissory Note, Disclosure Statement,
     Letter of Intent, Loan Agreement, + the path voucher pair (Check Voucher +
     AR Check Voucher, or Cash Voucher + AR ATM Voucher). Seafarer loans **never
     carry collateral** (verified live 2026-09-10: all 57 seafarer applications
     have `collateral_type = 'none'`; `car_refinancing` / `real_estate` exist
     only on `sme` + `individual`), so chattel/REM stay `hidden` for seafarer.
   - **SME + Individual:** the modal shows every `release` template whose
     **`sme_generation`** is `always` or `optional` (seed = all of them except
     none are forced `hidden`). Still narrowed in code by collateral type
     (chattel/REM only when the loan carries that collateral) + published-version
     check. Needs a **search box** and **pagination** (client asked explicitly).
2. **Release path stays.** Still required, still drives which disbursement
   details go into the vouchers (`buildReleaseTemplateContext(..., path, ...)`).
   It just no longer *filters* the SME list.
3. **Status.** Keep the move to `awaiting_signatures`, but it now happens per
   generated document — generating the first doc moves the file into signing,
   and only generated docs are in the signing queue.
4. **Close gate unchanged.** Closing still requires the scanned-back
   `signed_check_voucher` + `signed_promissory_note` + `signed_disclosure_statement`
   (`REQUIRED_SIGNED_RELEASE_SLUGS`). Officer must still produce + sign those.
5. **Working area outside the modal.** After generation the docs show in a
   page section (the existing "Generated documents" Card) where the officer can
   **regenerate / remove / mark-signed** each one. The modal is the *menu*; the
   Card is the *working set*.

---

## Audit — how generation works today

### Status lifecycle (`src/lib/lra/constants.ts`)
`awaiting_path → pdc_encoding → ready_generate → awaiting_signatures →
awaiting_briefing → ready_release → released → closed`

### Trigger (`src/app/lra/applications/[id]/page.tsx`)
- One `<Button>` inside a Card shown when `rf.status ∈ {ready_generate, awaiting_signatures}`
  (line ~1433). Label flips to "Regenerate…" when `generatedDocuments.length > 0`.
- `generateDocs()` (line ~662) → `POST /api/lra/applications/[id]/generate` (no body).
- A second Card, "Generated documents" (line ~1470+), lists `data.generatedDocuments`
  with a PDF link + Mark/Unmark signed per row + "Mark all signed". This is the
  section the user wants to become the regenerate/remove working area.

### Endpoint (`src/app/api/lra/applications/[id]/generate/route.ts`)
`requireModulePermission("release_lra", "edit")` → load `release_files` by
`loan_application_id` → `generateReleaseDocuments(supabase, releaseFile.id, user.id)`
→ `writeAuditEvent({ trigger: "generate_documents", ...result })` → `jsonOk`.

### Service (`src/lib/lra/release-service.ts` `generateReleaseDocuments`, line 548)
1. Load `release_files` row; `releasePathsFromRow` → hard error if empty.
2. Status must be `ready_generate` or `awaiting_signatures`.
3. Load active computation (hard error if none), `loadBlriContext`, the
   application (`borrower_id, segment, collateral_type, borrowers (*)`).
4. `collateralSlugs = COLLATERAL_GENERATED_SLUGS[collateralType]` for
   `car_refinancing` / `real_estate`, else `[]`.
5. `slugs = [...new Set([...releasePaths.flatMap(p => AUTO_GENERATED_SLUGS[p]), ...collateralSlugs])]`.
6. Build one `templateContext` per selected path via `buildReleaseTemplateContext`.
7. **Per slug:** `getPublishedTemplate(slug)` (hard error if missing) → decide
   `contextPath` (`with_pdc` if slug is with-pdc-only, `without_pdc` if
   without-pdc-only, else `releasePaths[0]`) → `renderTemplateToPdf(published.body,
   ctx)` → `hashPdf` → `storagePath =
   \`${borrower_id}/release/${releaseFileId}/${slug}-${randomUUID()}.pdf\`` →
   `uploadDocumentBytes` → `generated_documents.upsert({ release_file_id,
   document_slug: slug, storage_path, content_hash, template_version_id,
   is_finalized:false, signed_at:null, signed_by:null, signature_hash:null,
   generated_at }, { onConflict: "release_file_id,document_slug" })`.
8. **After the loop (once):** `release_files.status = "awaiting_signatures"`,
   upsert the `briefings` checklist, `syncApplicationBlocker(..., "awaiting_signatures")`.
9. Return `{ status: "awaiting_signatures", slugs }`.

**Key facts for the refactor:**
- `generated_documents` has `UNIQUE (release_file_id, document_slug)` — per-slug
  upsert already works in isolation. FK `ON DELETE CASCADE` from `release_files`.
- The loop **never deletes** — regenerate today just re-upserts the same set;
  a doc removed from a path is orphaned, not pruned.
- `witnessSignGeneratedDocument` requires `release_files.status ===
  "awaiting_signatures"`; when **every** `generated_documents` row for the file
  has `signed_at`, it flips the file to `awaiting_briefing`.
- `unwitnessSignGeneratedDocument` refuses once the briefing is acknowledged.
- `closeRelease` sets `is_finalized = true` on all generated docs.

### Template catalog (`document_templates.category`, live)
`category = 'release'` (15 rows): `blri`, `promissory_note`, `disclosure_statement`,
`letter_of_intent`, `loan_agreement`, `check_voucher`, `ar_check_voucher`,
`cash_voucher`, `ar_atm_voucher`, `ar_cash_voucher`, `acknowledgement_receipt`,
`deed_of_chattel_mortgage`, `real_estate_mortgage`, `endorsement_letter`
(**no published version yet**).
`listTemplates()` already returns `{ slug, name, category, publishedVersionNo }`.

---

## Design

### A. Service refactor (`release-service.ts`)

`generateReleaseDocuments` has exactly **one caller** (the generate route) — low
blast radius. Extract a shared loader so the two entry points don't duplicate
setup:

```ts
async function loadReleaseGenerationContext(supabase, releaseFileId):
  Promise<{ file; releasePaths: ReleasePath[]; app; borrowerId: string;
            computation; blri; contextByPath: Map<ReleasePath, TemplateContext>;
            catalog: ReleaseTemplateRow[] }>
```

- All of steps 1–3 + 6 from the audit, **plus** the new `category = 'release'`
  catalog fetch (with `seafarer_generation` / `sme_generation` + published-version
  map). Hard-errors identical to today (no path → `ValidationError`, no
  computation → `Error`).

Then extract the per-slug body of the loop into:

```ts
async function generateOneReleaseDocument(
  supabase, releaseFileId, slug, ctxByPath, releasePaths, borrowerId, actorId,
): Promise<{ slug: string; contentHash: string; regenerated: boolean }>
```

- Resolves `getPublishedTemplate(slug)` (hard error if missing / unpublished).
- Same `contextPath` decision as today.
- Renders, hashes, uploads, upserts the one row (clears any prior
  `signed_at/signed_by/witnessed_by/signature_hash`).
- `regenerated` = whether a row for `(release_file_id, slug)` already existed.

`generateReleaseDocuments(...)` keeps its signature: calls
`loadReleaseGenerationContext`, resolves the slug list via
`autoGenerateSlugs(segmentGroup(app.segment), catalog, releasePaths, collateralType)`
(replaces the `AUTO_GENERATED_SLUGS`/`COLLATERAL_GENERATED_SLUGS` union), loops
`generateOneReleaseDocument`, then the once-only post-loop transition (step 8).
Used by "Generate all" (SF convenience + back-compat; for an SME app with no
`slug` it produces every `sme_generation = 'always'` doc — a sane fallback, not a
regression).

New:

```ts
export async function generateReleaseDocumentBySlug(
  supabase, releaseFileId, slug, actorId,
): Promise<{ slug: string; status: ReleaseFileStatus; regenerated: boolean }>
```

- Loads the file; `releasePathsFromRow` → hard error if empty.
- Status must be `ready_generate` or `awaiting_signatures` (same as today);
  hard error if `awaiting_briefing`+ (mirror `unwitnessSign`).
- `slug` must be an **allowed candidate** for this loan (see helper C) — reject
  anything else with `ValidationError`.
- Calls `loadReleaseGenerationContext`, then `generateOneReleaseDocument` once.
- Post-transition: if file was `ready_generate` → set `awaiting_signatures`
  (user-client write — `release_files_write` is `FOR ALL` under `release_lra`/
  `edit`, same as `generateReleaseDocuments` does today), upsert the `briefings`
  checklist, `syncApplicationBlocker`. If already `awaiting_signatures`, leave it.
- Returns the row's new state.

New:

```ts
export async function removeGeneratedDocument(supabase, releaseFileId, documentId, actorId)
```

- Load the `generated_documents` row (+ `release_files ( status )`).
- Refuse if `is_finalized`, or file status ∉ `{ready_generate, awaiting_signatures}`,
  or briefing acknowledged.
- Delete the storage object (best-effort) — no helper exists; inline
  `supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath])`
  (`DOCUMENT_BUCKET = "loan-documents"`, pattern in `api/account/avatar/route.ts`).
- Delete the row. **Requires the new RLS policy from section H** — today
  `generated_documents` has INSERT/SELECT/UPDATE policies only, so a user-client
  `.delete()` silently affects 0 rows. `removeGeneratedDocument` must assert the
  delete returned the row (`.select()` + check) and throw if not.
- **Post-delete transition** (mirror the sign path so the file can't get stuck):
  - 0 rows left → roll file back to `ready_generate`, `syncApplicationBlocker`.
  - ≥1 row left and **all** signed → advance to `awaiting_briefing` (same as the
    last sign would have).
  - otherwise unchanged.

New pure guard helpers (exported, unit-tested):

```ts
export function canModifyGeneratedDoc(status: ReleaseFileStatus, isFinalized: boolean, briefingAcknowledged: boolean): boolean
export function releaseTransitionAfterDelete(status, remainingCount, allRemainingSigned): ReleaseFileStatus | null
```

### B. Candidate list helper (`src/lib/lra/release-documents.ts`, new)

Pure functions over the `release` template catalog (which now carries the two
admin eligibility columns from section G) + the loan's path/collateral.

```ts
export type GenEligibility = "always" | "optional" | "hidden";
export type SegmentGroup = "seafarer" | "sme"; // individual maps to "sme"

export type ReleaseTemplateRow = {
  slug: string;
  name: string;
  publishedVersionNo: number | null;
  seafarerGeneration: GenEligibility;
  smeGeneration: GenEligibility;
};

export function segmentGroup(segment: "seafarer" | "sme" | "individual"): SegmentGroup
// seafarer -> "seafarer"; sme | individual -> "sme"

/** Does this template's path/collateral condition match this loan? (logic, not preference) */
export function templateConditionMatches(
  slug: string,
  releasePaths: ReleasePath[],
  collateralType: "none" | "car_refinancing" | "real_estate" | null,
): boolean
// check_voucher/ar_check_voucher     -> only if releasePaths includes "with_pdc"
// cash_voucher/ar_atm_voucher        -> only if releasePaths includes "without_pdc"
// deed_of_chattel_mortgage           -> only if collateralType === "car_refinancing"
// real_estate_mortgage               -> only if collateralType === "real_estate"
// everything else                    -> true

/** Rows shown in the modal for this loan. */
export function releaseDocumentCandidates(
  group: SegmentGroup,
  catalog: ReleaseTemplateRow[],
  releasePaths: ReleasePath[],
  collateralType: "none" | "car_refinancing" | "real_estate" | null,
): Array<{ slug: string; name: string; eligibility: GenEligibility; canGenerate: boolean }>
// keep rows where (group === "seafarer" ? seafarerGeneration : smeGeneration) !== "hidden"
//   AND templateConditionMatches(...)
// canGenerate = publishedVersionNo != null

/** Slugs auto-produced by "Generate all" (seafarer only today). */
export function autoGenerateSlugs(
  group: SegmentGroup,
  catalog: ReleaseTemplateRow[],
  releasePaths: ReleasePath[],
  collateralType: "none" | "car_refinancing" | "real_estate" | null,
): string[]
// candidates where eligibility === "always" && canGenerate
```

`generateReleaseDocumentBySlug`'s allow-check = the slug appears in
`releaseDocumentCandidates(...)` with `canGenerate: true`.
`generateReleaseDocuments` ("Generate all") uses `autoGenerateSlugs(...)` in
place of the old `AUTO_GENERATED_SLUGS`/`COLLATERAL_GENERATED_SLUGS` union.

### C. Workspace API (`src/app/api/lra/applications/[id]/route.ts` GET)

Add to the response:

```ts
documentPicker: {
  mode: "curated" | "catalog",   // = segmentGroup === "seafarer" ? "curated" : "catalog"
  items: Array<{
    slug: string;
    name: string;
    canGenerate: boolean;          // published template exists
    generated: {                   // null when not yet generated
      documentId: string;
      generatedAt: string;
      signedAt: string | null;
      downloadUrl: string | null;
    } | null;
  }>,
}
```

Built from `releaseDocumentCandidates(segmentGroup(app.segment), catalog,
releasePaths, collateralType)` joined to the existing `generatedDocs` query
(already loaded). `catalog` = `document_templates` where `category = 'release'`,
selecting `slug, name, seafarer_generation, sme_generation` + published-version
map (extend `listTemplates()` or a scoped query). `mode` in the response =
`segmentGroup(app.segment) === "seafarer" ? "curated" : "catalog"` — `"curated"`
renders the plain list, `"catalog"` adds search + pagination.

### D. Generate endpoint (`src/app/api/lra/applications/[id]/generate/route.ts`)

- `requireModulePermission("release_lra", "edit")` (unchanged). Parse an optional
  JSON body — tolerate an empty body (`await _request.json().catch(() => ({}))`).
- Body `{ slug?: string }`. `slug` present →
  `generateReleaseDocumentBySlug(supabase, releaseFile.id, slug, user.id)`;
  `writeAuditEvent({ actorId: user.id, moduleSlug: "release_lra",
  action: "execute_trigger", entityType: "release_file", entityId: releaseFile.id,
  afterData: { trigger: "generate_document", slug, ...result } })` — mirrors the
  current call, which uses `action: "execute_trigger"` +
  `afterData: { trigger: "generate_documents", ...result }`.
- No `slug` → `generateReleaseDocuments(...)` as today (SF "generate all").

New file `src/app/api/lra/applications/[id]/documents/[docId]/route.ts` (no
collision — today there is only `.../documents/route.ts` and
`.../documents/[docId]/sign/route.ts`):
- `DELETE` → `requireModulePermission("release_lra", "edit")` → resolve
  `release_files` by `loan_application_id` and verify the `generated_documents`
  row's `release_file_id` matches (same ownership-check pattern the `sign` route
  uses: `rf?.loan_application_id !== id` → 404) →
  `removeGeneratedDocument(supabase, releaseFile.id, docId, user.id)` →
  `writeAuditEvent({ ..., action: "delete", entityType: "generated_document",
  entityId: docId, afterData: { trigger: "remove_generated_document" } })`.
- The existing sign/unsign stays at `.../documents/[docId]/sign/route.ts`
  (`POST` = sign, `DELETE` = unsign) — untouched.

### E. Page (`src/app/lra/applications/[id]/page.tsx`)

- Replace the "Generate documents" Card's single `<Button>` with a
  **"Choose documents to generate"** button (shown for the same
  `rf.status ∈ {ready_generate, awaiting_signatures}` condition) that opens a new
  `<GenerateDocumentsModal>`.
- `<GenerateDocumentsModal>` (new component, medium width ≈ 560px) built from the
  existing primitives in `@/components/ui`: `Modal` (`open`, `title`, `onClose`,
  `children`, `footer`), `Input` for search, `Pagination` (`page`, `pageCount`,
  `onPageChange`, `summary`), `Button`.
  - Header + short helper text ("Generate the documents this loan needs. You can
    regenerate or remove any of them afterwards.").
  - `mode === "catalog"` → a search `Input` (filters by name/slug,
    case-insensitive) + `Pagination` (page size 8; `summary` = "x–y of n").
  - `mode === "curated"` → the list as-is (no search/pager needed, but harmless
    if shared).
  - Each row: doc name, a status pill
    (`Not generated` / `Generated {date}` / `Signed`), and a right-aligned
    `<Button size="sm">` — **Generate** (no row yet) or **Regenerate** (row
    exists). Disabled with a hint when `!canGenerate` ("Template not published yet").
  - Button → `POST /api/lra/applications/[id]/generate` with
    `{ slug }` → on success `await load({ silent: true })` (modal stays open,
    row pill updates).
- **"Generated documents" Card** (existing inline block ~L1470–1610, the
  `data.generatedDocuments.map` with `chk-list` rows — **not**
  `<GeneratedDocPanel>`, which is the separate `rendered_documents` /
  `renderAndStore` system used at ~L1833/1840 for standalone extras; leave that
  untouched) gains, per row, next to Mark/Unmark:
  - **Regenerate** → same `POST …/generate { slug }` (only when
    `rf.status ∈ {ready_generate, awaiting_signatures}` and not finalized;
    regenerating a signed doc clears its signature — confirm dialog).
  - **Remove** → `DELETE …/documents/[docId]` (confirm dialog; same status guard).
- No behavioural change to Mark signed / Mark all signed / briefing / close.

### F. Tests (`*.mts`, node:test)

- `src/lib/lra/__tests__/release-documents.test.mts` (new):
  `segmentGroup`, `templateConditionMatches` (path × collateral matrix),
  `releaseDocumentCandidates` (hidden rows dropped per group; condition filter;
  `canGenerate` from published version; unpublished `endorsement_letter` →
  `false`), `autoGenerateSlugs` (only `always` + published + condition-matched;
  seed fixture reproduces today's 7-slug seafarer set for each path).
- `src/lib/lra/__tests__/release-service.test.mts` (extend or new):
  `canModifyGeneratedDoc` (finalized / briefing-ack / status matrix),
  `releaseTransitionAfterDelete` (0 left → `ready_generate`; all signed →
  `awaiting_briefing`; mixed → null).
- `src/lib/lra/__tests__/auto-generated-slugs.test.mts` (existing) — update or
  retire: it asserts the old constant union; the equivalent assertion moves to
  `autoGenerateSlugs` over the seed fixture.
- Keep existing LRA tests green (status-lifecycle, mark-all-signed helpers).

---

## Validation (checked against live DB + source, 2026-09-10 — two passes)

**RLS — checked pass 2:**
- `generated_documents`: policies for INSERT / SELECT / UPDATE only, **no DELETE**
  → the Remove feature needs section **H**'s new policy. UPDATE policy is
  `is_finalized = false AND (is_super_admin() OR has_module_permission('release_lra','edit'))`,
  `WITH CHECK (is_finalized = false)` — H mirrors it.
- `document_templates_write` / `document_template_versions_write` are both
  `FOR ALL` under `is_super_admin() OR has_module_permission('system_config','edit')`
  → G2/G3 write via the user client with no new policy.
- `generated_documents_lra_select` also allows the borrower (`b.user_id = auth.uid()`),
  unaffected by this work.

**UI primitives — verified present in `@/components/ui`:** `Modal` (open/title/
onClose/children/footer, locks body scroll), `Pagination` (page/pageCount/
onPageChange/summary), `Input`, `Select`, `Textarea`, `Button`, `ConfirmDialog`,
`Card`. The LRA page also imports `GeneratedDocPanel` (`@/components/documents/`)
— that is the standalone `rendered_documents` panel (used ~L1833/1840), **not**
the release-packet block this plan edits.

**DB — verified real (pass 1):**
- `generated_documents` columns: `id, release_file_id, document_slug, storage_path,
  content_hash, is_finalized, finalized_at, signed_at, signed_by, signature_hash,
  generated_at, witnessed_by, template_version_id`. Constraint
  `UNIQUE (release_file_id, document_slug)` and FK `release_file_id → release_files(id)
  ON DELETE CASCADE` both present.
- `release_files.status` = `text`, default `'awaiting_path'`; `release_paths` =
  `text[]` default `'{}'`.
- `document_templates` columns: `id, slug, name, description, category, is_active,
  created_at, updated_at` — **no generation columns yet** (G1 adds them).
  `document_template_versions.status` = `text` default `'draft'`.
- `category = 'release'` slugs confirmed (15); `endorsement_letter` has no
  published version.
- Seafarer × collateral: all 57 seafarer apps `collateral_type = 'none'`.

**Source — verified real (pass 3):**
- `generateReleaseDocuments` has **one** caller (`api/lra/applications/[id]/generate/route.ts`);
  `render-store.ts` only name-drops it in a comment. Refactor blast radius = that route.
- `document_templates` has a `set_updated_at()` BEFORE UPDATE trigger →
  `updateTemplateMeta` needs no manual timestamp.
- `release_files_write` is `FOR ALL` under `release_lra`/`edit` → the per-slug
  status transition and the post-delete transition write via the **user client**
  (no service client needed; `generateReleaseDocuments` already does this today).
- No storage-delete helper in `lib/documents/storage.ts` (only `buildStoragePath`,
  `createSignedUploadUrl`, `createSignedDownloadUrl`, `uploadDocumentBytes`,
  `downloadDocumentBytes`) → `removeGeneratedDocument` calls
  `supabase.storage.from(DOCUMENT_BUCKET).remove([...])` inline.

**Source — verified real (pass 1):**
- `release-service.ts`: `generateReleaseDocuments` (L548), `witnessSignGeneratedDocument`
  (all-signed → `awaiting_briefing`, L786–809), `unwitnessSignGeneratedDocument`
  (refuses after briefing ack), `closeRelease` (sets `is_finalized = true`),
  `REQUIRED_SIGNED_RELEASE_SLUGS`. `releasePathsFromRow` is module-private (the
  refactor keeps the new fns in this same file).
- `constants.ts` exports `ReleasePath`, `ReleaseFileStatus`, `AUTO_GENERATED_SLUGS`,
  `COLLATERAL_GENERATED_SLUGS`, `allAutoGeneratedSlugs`, `isAutoGeneratedDocumentSlug`.
- Other callers of the constant to migrate: `src/lib/lra/combined-signing-upload.ts`
  (`isAutoGeneratedDocumentSlug`), `src/app/borrower/applications/[id]/page.tsx`
  (`allAutoGeneratedSlugs()`), tests `auto-generated-slugs.test.mts` +
  `constants.test.mts`.
- Helpers exist with these exact names/paths: `renderTemplateToPdf` + `hashPdf`
  (`lib/documents/render/index.ts`), `uploadDocumentBytes` + `createSignedDownloadUrl`
  (`lib/documents/storage.ts`), `buildReleaseTemplateContext`
  (`lib/lra/template-context.ts`), `loadBlriContext` (`lib/lra/blri-data.ts`),
  `syncApplicationBlocker` + `mapReleaseFileRow` (`lib/lra/blockers.ts`),
  `getActiveComputation` (`lib/csa/computation.ts`), `ensureDocumentSlots`
  (`lib/documents/checklist.ts`), `getPublishedTemplate` + `listTemplates` +
  `createTemplate` + `saveDraft` + `publishVersion` (`lib/documents/templates/service.ts`).
- Permissions: `PermissionAction = "view" | "create" | "edit" | "delete" |
  "execute_trigger"`; `release_lra` and `system_config` are real `ModuleSlug`s.
  Existing template routes use `system_config` `"view"` (GET), `"create"` (POST
  create), `"edit"` (draft/publish) — so G3's `PATCH` = `"edit"` is consistent.
- `writeAuditEvent` input keys: `actorId, moduleSlug, action, entityType,
  entityId, beforeData, afterData`. `AuditAction` includes `"update"` and
  `"delete"`.
- `src/app/api/lra/applications/[id]/documents/[docId]/route.ts` does not exist
  today → new file, no collision.
- Test runner: `npm test` = node:test over `src/lib/**/__tests__/*.mts` only.

**Gaps found and folded into the plan:**
- **`generated_documents` has no DELETE RLS policy** → Remove would no-op
  silently. Section **H** adds `generated_documents_lra_delete`. This was the one
  hard blocker; now covered.
- No metadata-update path exists for `document_templates` today (only body via
  `saveDraft`). G2's `updateTemplateMeta` + G3's `PATCH` are net-new — follow the
  `createTemplate` + audit shape already in `document-templates/route.ts`.
- `getPublishedTemplate` only checks `is_active` + a published version; it does
  **not** know about categories or the new columns — the candidate/eligibility
  filtering lives entirely in `release-documents.ts` + the workspace API, not here.
- The `contextPath` decision inside the loop references
  `AUTO_GENERATED_SLUGS.with_pdc/.without_pdc` to detect path-specific voucher
  slugs. After the constant is retired, keep a small local
  `PATH_SPECIFIC_SLUGS = { with_pdc: [...], without_pdc: [...] }` in
  `release-documents.ts` (or `templateConditionMatches`'s inverse) for that check.

---

## G. Admin per-template eligibility (Option B)

### G1. Migration (both folders, byte-identical)

`YYYYMMDDHHMMSS_release_template_generation_eligibility.sql`:

```sql
DO $$ BEGIN
  CREATE TYPE public.doc_generation_eligibility AS ENUM ('always','optional','hidden');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS seafarer_generation public.doc_generation_eligibility
    NOT NULL DEFAULT 'hidden',
  ADD COLUMN IF NOT EXISTS sme_generation public.doc_generation_eligibility
    NOT NULL DEFAULT 'hidden';

-- Seed = exact reproduction of today's hardcoded behaviour.
-- Core packet + all voucher slugs: auto for both groups (code still narrows
-- the voucher pair by release path).
UPDATE public.document_templates SET seafarer_generation = 'always', sme_generation = 'always'
 WHERE slug IN ('blri','promissory_note','disclosure_statement','letter_of_intent',
                'loan_agreement','check_voucher','ar_check_voucher',
                'cash_voucher','ar_atm_voucher');

-- Collateral docs: never seafarer; auto for SME (code still gates on collateral_type).
UPDATE public.document_templates SET seafarer_generation = 'hidden', sme_generation = 'always'
 WHERE slug IN ('deed_of_chattel_mortgage','real_estate_mortgage');

-- Not auto today, but real templates — make them pickable for SME only.
UPDATE public.document_templates SET seafarer_generation = 'hidden', sme_generation = 'optional'
 WHERE slug IN ('acknowledgement_receipt','ar_cash_voucher','endorsement_letter');
```

Non-`release` categories keep the `hidden` default (columns are ignored for them).
Apply via the `apply_migration` MCP (assigns its own timestamp; rename the local
file in **both** `loanstar/supabase/migrations/` and `supabase/migrations/` to
match, byte-identical) — same as section H.

### G2. Service (`src/lib/documents/templates/service.ts`)

- Extend `TEMPLATE_COLS` + `mapTemplate` + `DocumentTemplate` with
  `seafarerGeneration` / `smeGeneration`.
- New `updateTemplateMeta(supabase, id, { seafarerGeneration?, smeGeneration? }, actorId)`
  → `UPDATE document_templates SET seafarer_generation = ..., sme_generation = ...
  WHERE id = $1` then re-select. No manual `updated_at` — `document_templates`
  has a `set_updated_at()` BEFORE UPDATE trigger (verified). (There is no
  metadata-update service today — body edits go through `saveDraft`. This is the
  first one.)

### G3. Route

New `PATCH /api/admin/document-templates/[id]` in the existing
`src/app/api/admin/document-templates/[id]/route.ts`:
- `requireModulePermission("system_config", "edit")`.
- zod `{ seafarerGeneration?: enum, smeGeneration?: enum }`.
- `updateTemplateMeta(...)` → `writeAuditEvent({ action: "update", entityType:
  "document_template", afterData })` → `jsonOk`.

### G4. Admin UI (`src/app/admin/document-templates/[id]/page.tsx`)

- Show two `<select>`s (Always / Optional / Hidden) — **only when
  `template.category === "release"`** (hidden/irrelevant otherwise):
  - "Seafarer document generation"
  - "SME & Individual document generation"
- Small helper text: *"Always = generated automatically. Optional = LRA can pick
  it in the generate list. Hidden = not offered for this segment. Release path
  and collateral still decide which vouchers/mortgages actually apply."*
- Save via the new `PATCH`; optimistic `message` on success, refetch.

### G5. Meaning of the three values (document in the UI + code comments)

| value | Seafarer group | SME/Individual group |
|---|---|---|
| `always` | in the "Generate all" set (still subject to path/collateral/published) | shown in the picker; reserved for a future "generate recommended set" |
| `optional` | shown in the seafarer picker, not auto-generated | shown in the picker |
| `hidden` | not offered | not offered |

Today SME/Individual has no "Generate all" button (pick-only), so `always` and
`optional` render the same for that group — the distinction is kept for a later
"recommended set" action and to mirror the seafarer semantics.

---

## H. Migration — `generated_documents` DELETE policy (required for Remove)

`YYYYMMDDHHMMSS_generated_documents_lra_delete_policy.sql` (both folders,
byte-identical). Verified 2026-09-10: `generated_documents` has RLS enabled with
`generated_documents_lra_insert` / `_lra_select` / `_lra_update` only — **no
DELETE policy**, so `removeGeneratedDocument`'s row delete would silently affect
0 rows. Mirror the existing UPDATE policy exactly:

```sql
CREATE POLICY generated_documents_lra_delete ON public.generated_documents
  FOR DELETE TO authenticated
  USING (
    is_finalized = false
    AND (is_super_admin() OR has_module_permission('release_lra', 'edit'))
  );
```

(The `is_finalized = false` guard means a closed release's finalized docs can
never be deleted even by an LRA edit user — matches `removeGeneratedDocument`'s
app-layer check and the UPDATE policy's `WITH CHECK (is_finalized = false)`.)

Apply via the Supabase MCP `apply_migration` (assigns its own timestamp; rename
the local files to match). No change needed to `document_templates` policies —
`document_templates_write` is already `FOR ALL` under
`has_module_permission('system_config', 'edit')`, so G3's `PATCH` works as-is.

---

## Implementation constraints (Cursor handoff — read first)

**Follow this plan literally. If any step does not match the codebase you find,
STOP and flag it — do not improvise a workaround.** No drive-by refactors, no
renames outside the file list, no "while I'm here" cleanups.

### Files you may create
- `src/lib/lra/release-documents.ts`
- `src/app/api/lra/applications/[id]/documents/[docId]/route.ts`
- `src/components/lra/GenerateDocumentsModal.tsx` (or nearest existing folder for LRA components)
- `src/lib/lra/__tests__/release-documents.test.mts`
- `src/lib/lra/__tests__/release-service.test.mts` (only if not already present)
- 2 migration files × 2 folders (G1, H)

### Files you may modify (and only these)
- `src/lib/lra/release-service.ts` — the refactor in section A only
- `src/lib/lra/constants.ts` — remove the slug constants **only after** all
  callers below are migrated; keep `ReleasePath` + `ReleaseFileStatus` +
  `BLOCKER_BY_STATUS` + the `releaseStage*` / `canRecordRelease` exports
- `src/lib/lra/combined-signing-upload.ts` — swap `isAutoGeneratedDocumentSlug`
  for the new resolver (or a static "all release slugs" set)
- `src/app/borrower/applications/[id]/page.tsx` — swap `allAutoGeneratedSlugs()`
  for the equivalent (all `category='release'` slugs); **no other change to this file**
- `src/app/api/lra/applications/[id]/route.ts` — add `documentPicker` to the GET
  response, **additively** (do not rename/remove existing fields)
- `src/app/api/lra/applications/[id]/generate/route.ts` — optional `{ slug }` body
- `src/app/lra/applications/[id]/page.tsx` — the button→modal swap + the
  Regenerate/Remove row actions in the existing "Generated documents" inline block
- `src/lib/documents/templates/service.ts` — G2 (`TEMPLATE_COLS`, `mapTemplate`,
  `DocumentTemplate`, new `updateTemplateMeta`)
- `src/app/api/admin/document-templates/[id]/route.ts` — add `PATCH` (G3)
- `src/app/admin/document-templates/[id]/page.tsx` — 2 selects (G4)
- `src/lib/lra/__tests__/auto-generated-slugs.test.mts` — update or delete (F)
- `src/lib/lra/__tests__/constants.test.mts` — update only assertions that break

### Migrations
- Two files: **G1** (columns + enum + seed) and **H** (DELETE policy). Each must
  exist **byte-identical** in `loanstar/supabase/migrations/` AND
  `supabase/migrations/`.
- Apply via the `apply_migration` MCP tool (it assigns the timestamp — then
  rename the two local files to that exact name). Do **not** run `supabase db
  push`, do **not** invent a timestamp, do **not** edit any already-applied
  migration.
- G1's seed `UPDATE`s live **inside the migration** — do not run them as ad-hoc
  SQL against the live DB.

### Behaviour freeze (must be provably unchanged)
- For a **seafarer** loan, "Generate all" must still produce exactly the same 7
  slugs per release path as today. The `autoGenerateSlugs` unit test over the G1
  seed fixture is the proof — it must assert the current sets explicitly.
- Close gate (`REQUIRED_SIGNED_RELEASE_SLUGS`, `closeRelease`), the
  all-signed→`awaiting_briefing` rule, `unwitnessSign` guards, briefing,
  `initializeArAccount`, PDC encoding, release-path selection — untouched (see
  **DO NOT TOUCH** below).
- Workspace GET stays backward-compatible: `documentPicker` is added, nothing
  removed or retyped.

### RBAC / RLS
- Never substitute `createServiceClient()` for the user client to get past a
  missing policy. The one missing policy (generated_documents DELETE) is added
  properly in section **H**. (This is the fail-open lesson from Task 4 —
  `has_module_permission`, explicit grants, no bypass.)

### Stack rules
- Heavily-modified Next.js — per `AGENTS.md`, read the relevant guide in
  `node_modules/next/dist/docs/` before touching any `route.ts` / `page.tsx`
  signature or params shape. Match the existing route/page idioms in the files
  listed above; don't copy patterns from memory.
- No new npm dependencies. UI uses only `@/components/ui` primitives already in
  the repo (`Modal`, `Pagination`, `Input`, `Select`, `Button`, `ConfirmDialog`,
  `Card`). Confirms use `ConfirmDialog` like the rest of the page.
- Theme-aware / Meridian styling consistent with the surrounding page.

### Gates — run after every phase, all must pass before the next
1. `npx tsc --noEmit` clean.
2. `npx eslint` clean on **changed files only** — the pre-existing
   `react-hooks/set-state-in-effect` (`void load()`) warning on the LRA/DCR pages
   is **not yours to fix**; leave it.
3. `npm test` green. Baseline is 1635 passing; it must only go up. `.mts` +
   `node:test` / `node:assert/strict` only.
4. UI phase (E) + admin phase (G4): a manual browser check (dev server) — screenshot
   the modal, generate one doc, regenerate it, remove it, and the admin selects
   saving; paste results into the execution log.

### Process
- Work strictly through **Execution phases** below (11 phases, fixed order).
  Tests are written **inside** each phase, never deferred.
- **Cross-phase invariant:** after every phase, `npx tsc --noEmit`, `eslint` (on
  changed files), and `npm test` are all green, the dev server boots, and
  `git status` shows **only that phase's allowlisted files**. If a phase can't
  meet that, stop and flag — do not roll changes forward into the next phase.
- Do **not** `git commit`, `git push`, or create branches. Leave everything
  staged on `develop` for review.
- Any live-DB experiment: use a scratch/quarantined application only, and revert
  it in the same session.
- Append a row to the **EXECUTION LOG** at the end of this file per phase (what
  landed + how it was verified), same format as the other plans in
  `docs/revision-plans/`.

---

## Execution phases

11 phases, strict order. **The app builds, the dev server boots, and `npm test`
is green after every single phase.** Each phase lists: **Touch** (the only files
it may change) · **Do** (the surgical edits) · **Freeze** (what must stay
byte-identical) · **Gate** (must pass before the next phase) · **Isolation** (why
nothing unrelated can break).

### Phase 1 — `release-documents.ts` pure helper  *(design §B)*
- **Touch:** `src/lib/lra/release-documents.ts` (new), `src/lib/lra/__tests__/release-documents.test.mts` (new).
- **Do:** create the module: `GenEligibility`, `SegmentGroup`, `ReleaseTemplateRow`,
  `segmentGroup()`, `templateConditionMatches()`, `releaseDocumentCandidates()`,
  `autoGenerateSlugs()`, and `PATH_SPECIFIC_SLUGS` (the `with_pdc` / `without_pdc`
  voucher-slug arrays copied verbatim from `constants.ts` `AUTO_GENERATED_SLUGS`).
  Also export `RELEASE_DOCUMENT_SLUGS` (static set of all `category='release'`
  slugs, = today's `allAutoGeneratedSlugs()` union ∪ `acknowledgement_receipt`,
  `ar_cash_voucher`, `endorsement_letter`). No imports from `release-service` or
  any route; **nothing imports this file yet**.
- **Freeze:** everything else in the repo.
- **Gate:** tsc + eslint clean; tests cover the path×collateral matrix, `hidden`
  filtering, `canGenerate` from published version, and a **seed fixture that
  asserts the current 7 seafarer slugs for each release path**; `npm test` green.
- **Isolation:** additive dead code — zero runtime effect until Phase 3.

### Phase 2 — migration G1: eligibility columns + seed  *(design §G1)*
- **Touch:** `…_release_template_generation_eligibility.sql` in **both** migration folders.
- **Do:** exactly the SQL in §G1 — enum, `ADD COLUMN IF NOT EXISTS … DEFAULT 'hidden'`
  ×2, the three seed `UPDATE`s. Apply via `apply_migration` MCP, rename both local
  files to the assigned timestamp.
- **Freeze:** no code changes at all this phase.
- **Gate:** `list_migrations` shows it; `select slug, seafarer_generation,
  sme_generation from document_templates where category='release'` matches the
  §G1 table; `npm test` still green (nothing reads the columns yet).
- **Isolation:** columns inert until Phase 3.

### Phase 3 — `release-service.ts` refactor  *(design §A)*
- **Touch:** `src/lib/lra/release-service.ts` only (+ its test file).
- **Do:**
  - Add `loadReleaseGenerationContext()` — lift `generateReleaseDocuments` steps
    1–3 + 6 **verbatim**, add one select of the `category='release'` catalog with
    the two new columns + published-version map.
  - Add `generateOneReleaseDocument()` — the **current per-slug loop body
    (~L647–698) with its logic unchanged**, parameterised by `slug` + `ctxByPath`;
    the `contextPath` check now reads `PATH_SPECIFIC_SLUGS` from
    `release-documents.ts`.
  - Rewrite `generateReleaseDocuments` body only: `loadReleaseGenerationContext`
    → `autoGenerateSlugs(segmentGroup(app.segment), catalog, releasePaths,
    collateralType)` → loop `generateOneReleaseDocument` → the **unchanged**
    post-loop block. Signature + return shape identical.
  - Add `generateReleaseDocumentBySlug()`, `removeGeneratedDocument()`,
    `canModifyGeneratedDoc()`, `releaseTransitionAfterDelete()` per §A.
  - Drop the `AUTO_GENERATED_SLUGS` / `COLLATERAL_GENERATED_SLUGS` imports here;
    the constants stay defined in `constants.ts` (retired in Phase 11).
- **Freeze:** the render/hash/upload/upsert per-slug logic; the post-loop
  transition; `witnessSign*`, `unwitnessSign*`, `closeRelease`, `recordRelease`,
  `acknowledgeBriefing`, PDC fns — untouched.
- **Gate:** tsc + eslint; unit tests for the 4 new helpers; a test proving
  `generateReleaseDocuments` over the seed still emits today's seafarer sets per
  path; full `npm test` green.
- **Isolation:** the `generate` route still calls `generateReleaseDocuments()`
  with no body → byte-identical seafarer behaviour. New exports have no callers yet.

### Phase 4 — migration H: `generated_documents` DELETE policy  *(design §H)*
- **Touch:** `…_generated_documents_lra_delete_policy.sql` in **both** folders.
- **Do:** exactly the `CREATE POLICY` in §H. Apply via `apply_migration` MCP.
- **Gate:** policy visible in `pg_policies`; a rolled-back dry-run delete of a
  non-finalized row under an LRA-edit role affects 1 row, a finalized row affects 0.
- **Isolation:** additive policy; no code deletes yet.

### Phase 5 — endpoints  *(design §D)*
- **Touch:** `src/app/api/lra/applications/[id]/generate/route.ts`;
  `src/app/api/lra/applications/[id]/documents/[docId]/route.ts` (new).
- **Do:** generate route — parse body with `.catch(() => ({}))`, branch: `slug`
  present → `generateReleaseDocumentBySlug`, else → `generateReleaseDocuments`
  (current call, **unchanged**). New route — `DELETE` only, ownership check
  copied from the `sign` route (`rf?.loan_application_id !== id` → 404), call
  `removeGeneratedDocument`, `writeAuditEvent`.
- **Freeze:** the no-slug branch; `documents/[docId]/sign/route.ts`;
  `documents/route.ts` — not opened.
- **Gate:** tsc + eslint; manual — no-body `POST` still works, `{slug}` `POST`
  creates one row, `DELETE` removes one, finalized → 4xx.
- **Isolation:** the page still calls no-body `POST` until Phase 7.

### Phase 6 — workspace GET  *(design §C)*
- **Touch:** `src/app/api/lra/applications/[id]/route.ts` only.
- **Do:** after the existing `generatedDocs` load, build `documentPicker` and add
  it to the `jsonOk({…})` object. **Additive** — no existing key touched.
- **Freeze:** every existing response field, name and type.
- **Gate:** tsc; page still renders (ignores the new key); response shows all old
  keys + `documentPicker`.
- **Isolation:** payload-only addition.

### Phase 7 — page UI  *(design §E)*
- **Touch:** `src/app/lra/applications/[id]/page.tsx`;
  `src/components/lra/GenerateDocumentsModal.tsx` (new).
- **Do:**
  - Replace **only** the `<Button onClick={() => void generateDocs()}>` block
    (~L1433) with a "Choose documents to generate" button opening the modal.
    Keep `generateDocs()` (modal reuses it for per-row + optional "Generate all").
  - In the existing "Generated documents" inline block (`data.generatedDocuments.map`,
    ~L1470–1610), add `Regenerate` + `Remove` `<Button size="sm">`s beside the
    existing Mark/Unmark, each behind a `ConfirmDialog`, guarded by
    `canModifyGeneratedDoc`.
  - New modal from `Modal` + `Input` + `Pagination` + `Button`.
- **Freeze:** signing rows, Mark / Mark-all / Unmark handlers, briefing banner,
  close action, PDC card, path card, both `<GeneratedDocPanel>` usages (~L1833/1840).
- **Gate:** tsc + eslint (changed lines only — the pre-existing `void load()`
  warning stays); dev-server browser check: screenshot the modal, generate one /
  regenerate / remove, and confirm a seafarer "Generate all" still yields 7 →
  paste into EXECUTION LOG.

### Phase 8 — migrate the other two constant callers
- **Touch:** `src/lib/lra/combined-signing-upload.ts`;
  `src/app/borrower/applications/[id]/page.tsx`.
- **Do:** one line each — `isAutoGeneratedDocumentSlug(x)` → `RELEASE_DOCUMENT_SLUGS.has(x)`;
  `allAutoGeneratedSlugs()` → `RELEASE_DOCUMENT_SLUGS` (both from `release-documents.ts`).
- **Freeze:** all other logic in both files.
- **Gate:** tsc + eslint; `npm test` green; manual — borrower checklist and
  combined-upload screen still hide the same slug set.
- **Isolation:** `RELEASE_DOCUMENT_SLUGS` is defined to equal the old union, so
  behaviour is identical.

### Phase 9 — templates service  *(design §G2)*
- **Touch:** `src/lib/documents/templates/service.ts` only.
- **Do:** extend `TEMPLATE_COLS`, `TemplateRow`, `DocumentTemplate`, `mapTemplate`
  with `seafarerGeneration` / `smeGeneration`; add `updateTemplateMeta()`.
- **Freeze:** `saveDraft`, `publishVersion`, `getPublishedTemplate`, `listTemplates`
  return shape (only new optional fields added).
- **Gate:** tsc; existing admin template list + detail pages still load.

### Phase 10 — admin PATCH route  *(design §G3)*
- **Touch:** `src/app/api/admin/document-templates/[id]/route.ts` only — add `PATCH`,
  leave `GET` untouched.
- **Gate:** tsc; PATCH updates the two fields; audit row written; GET unchanged.

### Phase 11 — admin UI + retire the constants  *(design §G4)*
- **Touch:** `src/app/admin/document-templates/[id]/page.tsx`; `src/lib/lra/constants.ts`;
  `src/lib/lra/__tests__/auto-generated-slugs.test.mts`;
  `src/lib/lra/__tests__/constants.test.mts`.
- **Do:** admin page — two `<select>`s wired to the PATCH, rendered only for
  `template.category === "release"`. `constants.ts` — **grep the repo first** to
  confirm zero importers, then delete `AUTO_GENERATED_SLUGS`,
  `COLLATERAL_GENERATED_SLUGS`, `allAutoGeneratedSlugs`,
  `isAutoGeneratedDocumentSlug` (keep `ReleasePath`, `ReleaseFileStatus`,
  `BLOCKER_BY_STATUS`, `releaseStage*`, `canRecordRelease`). Rewrite the two test
  files to assert over `autoGenerateSlugs` + `RELEASE_DOCUMENT_SLUGS`.
- **Gate:** repo-wide grep for the four deleted symbols returns nothing; tsc +
  eslint + `npm test` green; browser check of the admin selects → EXECUTION LOG.

---

## DO NOT TOUCH

- Release path selection + PDC encoding (`setReleasePaths`, `savePdcChecks`) —
  still required, still the voucher-context source.
- The **conditions** kept in code (`templateConditionMatches`): path → voucher
  pair, collateral type → chattel/REM, published-version required. The admin
  flags gate *eligibility*, not these.
- `document_template_versions` publish/immutability flow, `saveDraft`,
  `publishVersion` — G only adds a metadata `PATCH`, it does not touch body/version.
- `witnessSignGeneratedDocument` "all signed → `awaiting_briefing`" rule and
  `unwitnessSignGeneratedDocument` guards.
- `closeRelease` / `REQUIRED_SIGNED_RELEASE_SLUGS` / `resolveSignedReleaseDocuments`
  (the scanned-back close gate).
- `renderTemplateToPdf`, `buildReleaseTemplateContext`, the template engine,
  `document_template_versions` immutability.
- `initializeArAccount`, `createPendingInternalTransfers`, `acknowledgeBriefing`.
- The borrower-facing read-only panels.

---

## Open confirmations (not blockers — sensible defaults chosen)

1. **SF still uses the modal** (pre-filtered by `seafarer_generation`), not the
   old single button. Assumed **yes** ("we will replace the document generation
   style"). A "Generate all" button can stay in the SF modal for convenience.
2. **Individual segment** groups with SME. Assumed **yes** ("even for collateral,
   individual, no collateral… all document").
3. **Regenerate a signed doc** clears that doc's signature and keeps the file in
   `awaiting_signatures`. Assumed **yes** (mirrors unmark-signed).
4. `endorsement_letter` shows in the SME list but **disabled** until Legal
   publishes it. Assumed **yes**.
5. **Seed values in G1** — the Always/Optional/Hidden starting point per template.
   Table above reproduces today's behaviour; client can retune any of them from
   the admin screen after launch. Worth a quick sign-off that
   `acknowledgement_receipt` / `ar_cash_voucher` starting as SME-`optional`
   (not `hidden`) is desired.

---

## EXECUTION LOG — 2026-09-10 (implemented directly at user request)

| Phase | What landed | Verify |
|---|---|---|
| **1** | `src/lib/lra/release-documents.ts` (new): `segmentGroup`, `templateConditionMatches`, `releaseDocumentCandidates`, `autoGenerateSlugs`, `PATH_SPECIFIC_SLUGS`, `RELEASE_DOCUMENT_SLUGS`. `__tests__/release-documents.test.mts` (new, 10 tests incl. seed fixture proving the seafarer 7-slug set per path). | tsc/eslint clean; `npm test` 1635 -> 1645. |
| **2** | Migration `20260910015839_release_template_generation_eligibility.sql` (both folders). Enum `doc_generation_eligibility` + `document_templates.seafarer_generation`/`sme_generation` (default `hidden`) + seed. | Applied via MCP. Live check: all 14 `release` slugs match the §G1 table; non-release stay `hidden`. |
| **3** | `release-service.ts` refactor: `loadReleaseGenerationContext` + `loadReleaseTemplateCatalog` + `generateOneReleaseDocument` + `finalizeGenerationTransition`; `generateReleaseDocuments` rewritten (same sig/return, uses `autoGenerateSlugs`); new `generateReleaseDocumentBySlug`, `removeGeneratedDocument`, `canModifyGeneratedDoc`, `releaseTransitionAfterDelete`. Dropped `AUTO_GENERATED_SLUGS`/`COLLATERAL_GENERATED_SLUGS` imports. `contextPath` now reads `PATH_SPECIFIC_SLUGS`. `__tests__/release-service.test.mts` +8 guard tests. | tsc clean (app src); eslint clean; `npm test` 1645 -> 1653. |
| **4** | Migration `20260910020330_generated_documents_lra_delete_policy.sql` (both folders) — `generated_documents_lra_delete` (`is_finalized = false AND (super_admin OR release_lra edit)`). | Applied via MCP; policy visible in `pg_policies`. E2E: an LRA-role delete removed the row (was previously a silent no-op). |
| **5** | `generate/route.ts` — optional `{ slug }` body -> `generateReleaseDocumentBySlug` else `generateReleaseDocuments`; audit `trigger: generate_document`. New `documents/[docId]/route.ts` — `DELETE` -> `removeGeneratedDocument` (sign-route ownership check, audit `action: delete`). | tsc/eslint clean. Browser E2E covered by Phase 7. |
| **6** | Workspace `GET /api/lra/applications/[id]` — additive `documentPicker: { mode, items[] }` from `releaseDocumentCandidates` + generated-doc join; app select gains `collateral_type`; `docsWithUrls` gains `generatedAt`. No existing field touched. | tsc/eslint clean; `npm test` 1653. |
| **7** | `page.tsx` — button -> `<GenerateDocumentsModal>` (new `src/components/lra/GenerateDocumentsModal.tsx`, `Modal`+`Input`+`Pagination`+`Badge`); `mode==='curated'` also keeps a "Generate all" secondary button; "Generated documents" card rows gain **Regenerate** + **Remove** (`ConfirmDialog` each, status/finalized/briefing guarded). `LraWorkspace` type extended. | tsc clean; eslint clean on changed lines (2 reported errors = the pre-existing `void load()` on untouched lines 467/475). **Browser E2E on AN300458 (SME, with_pdc):** modal = 10 items (7 always on-path + 3 optional; cash/atm & mortgages correctly excluded), search + pagination work; Generate `blri` -> row created, file -> `awaiting_signatures`, appears in Generated documents card with PDF/Mark/Regenerate/Remove; Remove -> confirm -> row deleted, file rolled back to `ready_generate`; audit events written; no console errors. Account left in original state. |
| **8** | `combined-signing-upload.ts` `isAutoGeneratedDocumentSlug` -> `RELEASE_DOCUMENT_SLUGS.has`; `borrower/applications/[id]/page.tsx` `allAutoGeneratedSlugs()` -> `RELEASE_DOCUMENT_SLUGS`. | tsc clean; eslint (1 pre-existing `void load()` on untouched line 242); `npm test` 1653. |
| **9** | `documents/templates/service.ts` — `DocumentTemplate`/`TemplateRow`/`mapTemplate`/`TEMPLATE_COLS` gain `seafarerGeneration`/`smeGeneration`; new `updateTemplateMeta` (no manual `updated_at` — trigger handles it). | tsc/eslint clean. |
| **10** | `api/admin/document-templates/[id]/route.ts` — new `PATCH` (`system_config` `edit`, zod enum, audit `action: update`), `GET` untouched. | tsc/eslint clean. |
| **11** | `admin/document-templates/[id]/page.tsx` — "Document generation" section with 2 `Select`s (Always/Optional/Hidden), shown only for `category === 'release'`, wired to `PATCH`. `constants.ts` — deleted `AUTO_GENERATED_SLUGS`, `COLLATERAL_GENERATED_SLUGS`, `allAutoGeneratedSlugs`, `isAutoGeneratedDocumentSlug` (grep-verified 0 code importers). Deleted `__tests__/auto-generated-slugs.test.mts`; trimmed 4 retired-symbol tests from `constants.test.mts`. | grep clean; tsc clean (app src); eslint (1 pre-existing `void load()` on untouched line 83); `npm test` 1644 / 0 fail (net +9 vs the 1635 baseline; deletions were tests of deleted code, coverage moved to `release-documents.test.mts`). **Browser:** BLRI template page shows the 2 dropdowns seeded `Always`/`Always`; changed seafarer -> `Optional` -> "Generation settings updated" + DB persisted -> reverted to `Always`. 2 `document_template` update audit events. |

**Migrations (both `loanstar/supabase/migrations/` + `supabase/migrations/`, byte-identical):**
`20260910015839_release_template_generation_eligibility.sql`,
`20260910020330_generated_documents_lra_delete_policy.sql`.

**Files (all uncommitted on `develop`):** new — `src/lib/lra/release-documents.ts`,
`src/lib/lra/__tests__/release-documents.test.mts`,
`src/app/api/lra/applications/[id]/documents/[docId]/route.ts`,
`src/components/lra/GenerateDocumentsModal.tsx`, 2 migrations ×2 folders.
modified — `src/lib/lra/release-service.ts`, `src/lib/lra/constants.ts`,
`src/lib/lra/combined-signing-upload.ts`,
`src/lib/lra/__tests__/release-service.test.mts`,
`src/lib/lra/__tests__/constants.test.mts`,
`src/app/api/lra/applications/[id]/route.ts`,
`src/app/api/lra/applications/[id]/generate/route.ts`,
`src/app/lra/applications/[id]/page.tsx`,
`src/app/borrower/applications/[id]/page.tsx`,
`src/lib/documents/templates/service.ts`,
`src/app/api/admin/document-templates/[id]/route.ts`,
`src/app/admin/document-templates/[id]/page.tsx`.
deleted — `src/lib/lra/__tests__/auto-generated-slugs.test.mts`.

**Not done (unchanged from plan):** commit/deploy (user-owned); publish
`endorsement_letter` after Legal; the two "open confirmations" (SME seed values
for `acknowledgement_receipt`/`ar_cash_voucher`, and whether SF keeps a
"Generate all" button — currently it does).

---

## EXECUTION LOG — 2026-09-10 (modal follow-up: server-side picker)

The generate modal was reworked again per user request — wider, table layout,
requirement/status filters, and **search + filter + pagination moved to the
backend** (the modal is now a thin fetch-and-render view).

| Piece | What landed | Verify |
|---|---|---|
| `release-documents.ts` | New `PickerItem` type + pure `queryPickerItems(all, {search, eligibility, status, page, pageSize})` → `{items, total, page, pageCount, pageSize}`; unknown filters fall back to `all`; page clamped; pageSize clamped `[1,50]`. +8 `.mts` tests. | `npm test` 1644 → 1652. |
| `document-picker.ts` (new) | `buildReleaseDocumentPicker(supabase, applicationId)` → `{ mode, items }` — the DB-side builder (segment group, release paths, catalog, `generated_documents` join, signed download URLs). Extracted from the workspace route. | tsc/eslint clean. |
| `api/lra/applications/[id]/document-picker/route.ts` (new) | `GET` — `requireModulePermission("release_lra","view")` → `buildReleaseDocumentPicker` → `queryPickerItems(…, query params)` → `jsonOk({ mode, items, total, page, pageCount, pageSize })`. | Live E2E: `page=1&pageSize=6`→6 of 10 (pageCount 2); `page=2`→4 rows; `eligibility=optional`→3; `eligibility=required`→7; `status=not_generated`→10; `search=voucher`→3; `search=voucher&eligibility=required`→2; `page=99`→clamped to 2. |
| `api/lra/applications/[id]/route.ts` | Workspace GET `documentPicker` slimmed to `{ mode }` only (items/catalog/candidates computation removed); `collateral_type` + `generatedAt` reverted from the app/select as no longer needed here. | tsc/eslint clean; response still backward-compatible (page reads `documentPicker.mode`). |
| `GenerateDocumentsModal.tsx` | Now takes `applicationId` + `reloadToken` instead of `items`. Fetches `/document-picker` on open and on every search (300ms debounce) / filter / page / `reloadToken` change. Width `!max-w-2xl` → **`!max-w-4xl` (896px)**. Design-system components only: `Modal`, `Table/Th/Td`, `Input`, `Select` (Requirement: All/Required/Optional; Status: All/Not generated/Generated/Signed), `Pagination` (always shown, pageSize 6), `Badge`, `Button`, `Alert`, `Spinner` overlay. `optional` rows get a subtle tag. | Live: modal width 896px; page-2 button → "7–10 of 10"; both selects issue backend requests with the right query params; search "voucher" → 3 rows. |
| `page.tsx` | `LraWorkspace.documentPicker` → `{ mode }`. Modal gets `applicationId` + `reloadToken`; regenerate-vs-generate decision now reads `generatedDocuments` (not the removed picker items). `pickerReloadToken` bumped after each generate/regenerate/remove so the open modal refetches. | tsc clean; eslint — 1 `set-state-in-effect` on the fetch-on-open effect, the same house-style `void load()` pattern used by every data-fetching page in the repo. |

`npm test` **1652 / 0** · `tsc` 0 app-source errors · `next build` **✓ Compiled successfully**.
