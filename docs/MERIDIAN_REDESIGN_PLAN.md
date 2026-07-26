next# Meridian Redesign — Implementation Plan

## Rule (strict)
`docs/LoanStar_Meridian_Design_System_v1.1_1.html` is the **one and only** design reference for this
redesign. No exceptions.

- Every color, font, spacing value, radius, shadow, and component pattern used anywhere in the app MUST
  trace back to a token or component already defined in that file. No values pulled from the old UI,
  other design systems, component libraries (MUI, shadcn defaults, Bootstrap, etc.), memory/training data,
  or personal taste.
- **If a needed pattern does not exist in Meridian** (e.g. a data-grid filter combo, a specific empty
  state variant, a wizard layout): do not invent a style from scratch. Compose/extend it strictly from
  Meridian's existing primitives and tokens — same palette variables, same type scale, same radius/shadow
  scale, same spacing scale, same interaction/hover/focus conventions already used elsewhere in the file.
  Treat it as "assembling a new page from Meridian's own Lego pieces," never "designing something new."
- Any such gap gets called out explicitly when it's hit (which page, what's missing, what Meridian
  primitives it was assembled from) so it can be reviewed — not silently decided and moved past.
- No raw hex codes, arbitrary px values, or ad-hoc Tailwind utility colors in component code — always the
  Meridian CSS variables/tokens (`--navy-900`, `--teal-600`, `--r-lg`, `--sh-2`, `--s-4`, etc.) or a
  Tailwind theme extension mapped 1:1 to them.

## Approach
Phase by phase. Phase 0 builds/aligns the shared component library against Meridian tokens & markup.
Every later phase only *consumes* that library — pages should not hand-roll one-off styles.
Each phase ends with a visual check in the browser preview (light theme; app has no dark mode today)
before moving to the next.

---

## Phase 0 — Foundations & Shared Components
Bring `src/components/ui/*` in line with Meridian: CSS tokens (navy/teal/ink palette, Sora/Public Sans/
JetBrains Mono, radius/shadow/spacing scale), then each primitive.

- [x] Design tokens (colors, fonts, radius, shadow, spacing) → `globals.css` (`:root` Meridian tokens
      verbatim + Tailwind v4 `@theme` mapping; legacy Deep Harbor aliases remapped onto Meridian so
      un-migrated pages render in-palette until their phase)
- [x] Fonts → Sora / Public Sans / JetBrains Mono via `next/font` in `layout.tsx`
- [x] Meridian component CSS ported verbatim into `globals.css` (`.btn`, `.input`, `.badge`, `.card`,
      `.tbl`, `.modal`, `.stepper`, `.tl`, `.kpi`, `.emi`, `.score`, `.chk-list`, `.dropzone`,
      `.appbar`, `.side`, `.fchip`, `.gsearch`, `.cal`, `.doc-viewer`, `.report-head`, …)
- [x] Button.tsx (primary/accent/secondary/outline/ghost/danger/danger-soft; legacy `success` → accent)
- [x] Input.tsx / Textarea.tsx / Select.tsx (incl. `.affix` + `mono` for currency/rate fields)
- [x] Checkbox.tsx / Radio.tsx / Toggle.tsx
- [x] Label.tsx (field label + required asterisk)
- [x] Badge.tsx (dot variant) / Chip.tsx (filter chip)
- [x] Alert.tsx (semantic icons) / Toast.tsx (navy-950)
- [x] Card.tsx / KpiCard.tsx (stat card: uppercase key, mono value, delta)
- [x] Table.tsx (.table-wrap/.tbl; `num` ledger columns; sortable/bulk/expand CSS ready)
- [x] Avatar.tsx (sm/md/lg, teal, .person row)
- [x] Breadcrumbs.tsx / Pagination.tsx / SegmentedControl.tsx
- [x] Modal.tsx / ConfirmDialog.tsx / DropdownMenu.tsx / Tooltip.tsx
- [x] Progress.tsx / Skeleton.tsx / Spinner.tsx / Stepper.tsx
- [x] EmptyState.tsx
- [x] Accordion.tsx (FAQ pattern)
- [x] FileUpload.tsx (FileDropzone + DocumentRow file rows)
- [x] PageHeader.tsx · app-shell CSS ready (`.appbar`, `.side`) — shell component wiring lands in Phase 1
- [x] Loan-specific CSS patterns in place (`.score`, `.emi`, `.chk-list`, `.tl`, `.loan-app-card`,
      `.kanban`, charts) — consumed as pages are redesigned

**Exit criteria:** ✅ `/design` gallery page renders every primitive (verified in browser against the
reference: tokens, table, modal, stepper, timeline, files all match). `npx tsc --noEmit` clean apart
from pre-existing errors in `src/lib/lra/__tests__/blri-f2.test.mts` (unrelated).

---

## Phase 1 — Auth & Shell ✅
- [x] `/login` — navy-950 bg, Sora headings, teal links (`--teal-700`), `border-line-soft` separators, Meridian quick-login buttons
- [x] `/forgot-password` — same auth card pattern
- [x] `/reset-password` — same auth card pattern
- [x] `/borrower/register` — 2-col grid form, `required` prop on Labels
- [x] App shell: `AppShell.tsx` → `bg-canvas` / `bg-surface` Meridian tokens
- [x] `Sidebar.tsx` → `bg-navy-950` (was navy-900), `.side-link` / `.side-link.is-active` global classes (verified: active bg `rgba(45,199,182,0.16)`, teal-400 `::before` indicator, inactive `--navy-100` text)
- [x] `Header.tsx` → `bg-surface` / `border-line-soft`, teal-400→teal-700 avatar gradient, `border-teal-600` tab underline, `.menu`/`.menu button.mi` dropdown, mono group labels

**Exit criteria:** ✅ Browser-verified — sidebar `#071633` (navy-950), active nav `rgba(45,199,182,0.16)` teal-400 left bar, inactive nav `#DCE5F3` (navy-100) 13.5px, group headers JetBrains Mono 10.5px 0.14em, header white surface `#E7ECF3` border, teal-400→teal-700 avatar gradient. Auth pages: teal-700 links, line-soft separators.

## Phase 2 — Dashboard & Reports ✅
- [x] `charts/theme.ts` — Replaced Deep Harbor hex (#d9a855 gold, etc.) with Meridian hex (teal-600 #0D9488 primary, correct navy/ink/semantic). Tooltip uses `--r-md`/`--sh-3`.
- [x] `WidgetTile.tsx` — All hand-rolled card containers replaced with `.card p-4`; toneClass `"gold"` → `text-teal-600`; section header hover `text-teal-700`; skeleton bones use `.skel`; table dividers `divide-line-soft`.
- [x] `/dashboard` — Plain module cards use `.card` + `hover:text-teal-700`; error state uses `text-danger`; empty state uses `text-ink-500`.
- [x] `/reports` — Card headings `text-navy-900`; label text `text-ink-500`; numeric values `mono` class; aging bars use `.prog` + Meridian semantic vars; TAT list `divide-line-soft`.
- [x] `/remedial` — `text-ink-900`/`text-ink-500`; `mono` class for amounts.
- [x] Widget table rows (system.tsx, pipeline.tsx) — `text-ink-900`/`text-ink-500`/`text-ink-400`.

**Exit criteria:** ✅ Browser-verified — `.card` border `--line` #D9E0EB, radius 14px (`--r-lg`), white surface; aging progress bar `--teal-600 rgb(13,148,136)`; mono values JetBrains Mono; section header teal hover; chart theme exports teal-600 as primary color.

## Phase 3 — Admin ✅
- [x] `/admin` (redirect, no UI)
- [x] `/admin/users` + modals (create user, deactivate account, remove super admin)
- [x] `/admin/roles` + modal (create role)
- [x] `/admin/roles/[id]`
- [x] `/admin/loan-types` + modal (enroll rate version)
- [x] `/admin/checklists`
- [x] `/admin/checks`
- [x] `/admin/config`
- [x] `/admin/audit`
- [x] `/admin/email-test`

**Exit criteria:** ✅ Admin pages consume Meridian primitives only — bare `.tbl` tbody (no `divide-neutral-*`), card titles `font-display text-lg font-semibold text-navy-900`, modal actions via `footer` prop, audit uses `Pagination` + `.audit`, checklists use `ConfirmDialog`/`EmptyState`, FieldRulesEditor uses Table + ghost remove.

## Phase 4 — Agent ✅
- [x] `/agent`
- [x] `/agent/leads/new`
- [x] `/agent/leads/[id]`

**Exit criteria:** ✅ Agent leads list uses bare `.tbl` + ink/navy link tokens; new/detail pages use `Breadcrumbs`, card titles `font-display text-lg font-semibold text-navy-900`, `EmptyState` for unlinked applications, `loading` submit button.

## Phase 5 — CSA (Intake) ✅
- [x] `/csa`
- [x] `/csa/applications/new`
- [x] `/csa/applications/[id]`

**Exit criteria:** ✅ CSA queue already on Meridian `QueueListItem`/`EmptyState`. New/detail use `Breadcrumbs` + navy card titles; computation/negotiation panels remapped Deep Harbor `gold-600` → `teal-600`, `border-neutral-*` → `border-line-soft`, ink aliases → numbered tokens, `mono` amounts.

## Phase 6 — CIG (Verification) ✅
- [x] `/cig`
- [x] `/cig/applications/[id]`

**Exit criteria:** ✅ CIG queue uses `mono` timestamps; detail page uses `Breadcrumbs`, navy card titles, `border-line-soft`, ink numbered tokens, `mono`/`teal-600` computation amounts, `loading` buttons.

## Phase 7 — Committee ✅
- [x] `/committee`
- [x] `/committee/applications/[id]` + modal (decision confirm)

**Exit criteria:** ✅ Queue uses `mono` timestamps/TAT; detail uses `Breadcrumbs`, navy card titles, ink tokens, `border-line-soft`, teal/`mono` amounts, Meridian `ConfirmDialog` for approve/deny, `loading` buttons.

## Phase 8 — LRA (Release) ✅
- [x] `/lra`
- [x] `/lra/applications/[id]` + modals (record release, close file)

**Exit criteria:** ✅ Queue uses `mono` timestamps; detail uses `Breadcrumbs`, navy card titles, ink tokens, teal/`mono` amounts, `text-teal-700` PDF links (was gold), Meridian `ConfirmDialog` for release/close, `loading` buttons.

## Phase 9 — AR (Accounts Receivable) ✅
- [x] `/ar`
- [x] `/ar/dcr`
- [x] `/ar/masterlist/[id]`

**Exit criteria:** ✅ Masterlist uses navy card titles + teal/`mono` balances; DCR uses line-soft item rows, labeled deposit input, `loading` reconcile; detail uses `Breadcrumbs`, navy titles, `.tbl` amortization schedule, teal amounts.

## Phase 10 — Collector ✅
- [x] `/collector`

**Exit criteria:** ✅ Assigned accounts use `.tbl` with teal/`mono` balances; payment proofs use `border-line-soft` rows (no neutral card borders); navy card titles; `loading` / `danger-soft` action buttons; DCR draft info alert.

## Phase 11 — Borrower Portal ✅
- [x] `/borrower`
- [x] `/borrower/profile`
- [x] `/borrower/applications/[id]` + inline signing widgets (BriefingSign, ComputationSign)
- [x] `/borrower/applications/[id]/documents/[docId]/sign` + SignatureConfirm modal

**Exit criteria:** ✅ Dashboard uses navy titles + `mono` borrower no; profile uses `Breadcrumbs` + navy section titles + `border-line-soft`; application/sign pages use breadcrumbs; signing widgets remapped `gold-600` → `teal-600`, ink aliases → numbered tokens; `SignatureConfirm` uses Meridian `ConfirmDialog` + navy title.

---

## Tracking
Check off each item as it ships. If a page needs a Meridian pattern that doesn't exist yet, stop and
resolve it in Phase 0 (add the primitive) rather than freelancing a one-off style in the page.
