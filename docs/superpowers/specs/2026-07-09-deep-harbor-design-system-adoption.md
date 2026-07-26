# Deep Harbor Design System Adoption — Design Spec

**Date:** 2026-07-09  
**Status:** Draft for user review  
**App:** LoanStar (`loanstar/`)  
**Canonical visual source:** `docs/LoanStar Deep Harbor Design System.html`

---

## 1. Goal

Make **every** LoanStar UI surface use the Deep Harbor design system exclusively:

- Shared primitives live in a new library at `src/components/ui/`.
- All portals (auth, admin, staff, borrower, reports) import from that library.
- The old shared library (`src/components/admin/ui.tsx` and related duplicates) is removed after migration.
- If a needed component does not exist in the design system, **create it** aligned to Deep Harbor brand rules, **and add it to** `docs/LoanStar Deep Harbor Design System.html` in the same change set.

No backend, API, or business-logic rewrites unless required to wire a UI component.

---

## 2. Non-negotiable rules

1. **Design system only.** No new one-off button/input/card/table styles in pages. Use `src/components/ui/` (or domain components built from it).
2. **Missing component → create + document.** Before (or with) first app usage:
   - Implement in `src/components/ui/` (or domain folder if loan-specific).
   - Add a documented section/example to `docs/LoanStar Deep Harbor Design System.html`.
3. **Brand constraints from Deep Harbor:**
   - Immersive navy for chrome / KPI surfaces.
   - Gold reserved for **primary actions** and **key numbers** — not decorative chrome.
   - Typography: Albert Sans (UI), Newsreader (display/section), IBM Plex Mono (data/money).
4. **Replace, don’t parallel forever.** Temporary dual imports are allowed only during a phase; each phase ends with consumers on the new path. Old `admin/ui.tsx` is deleted when import count is zero.
5. **Phase by phase, full coverage.** Every route and shared component is in scope; work is sequenced, not optional.

---

## 3. Architecture

```
src/
  app/
    globals.css                 # Deep Harbor tokens (single production source)
    layout.tsx                  # next/font: Albert Sans, Newsreader, IBM Plex Mono
  components/
    ui/                         # NEW — shared Deep Harbor primitives (all portals)
      index.ts                  # public barrel exports
      Button.tsx
      Input.tsx
      Select.tsx
      Textarea.tsx
      Label.tsx
      Checkbox.tsx
      Radio.tsx
      Toggle.tsx
      Chip.tsx
      Card.tsx
      KpiCard.tsx
      Badge.tsx
      Alert.tsx
      Modal.tsx
      ConfirmDialog.tsx
      Table.tsx
      Spinner.tsx
      Skeleton.tsx
      PageHeader.tsx
      SegmentedControl.tsx
      Toast.tsx
      Progress.tsx
      EmptyState.tsx
      Pagination.tsx
      Breadcrumbs.tsx
      Avatar.tsx
      Tooltip.tsx
      FileUpload.tsx
      Accordion.tsx
      Stepper.tsx                # vertical / horizontal as in DS
      ...                       # any newly invented DS-aligned primitives
    admin/
      AppShell.tsx              # shell only (uses ui/)
      Sidebar.tsx
      Header.tsx
      FieldRulesEditor.tsx      # domain; uses ui/
      # ui.tsx DELETED after migration
      # Badge.tsx DELETED after move into ui/
    dashboard/                  # widgets/charts consume ui/ (no duplicate KpiCard)
    borrower/, csa/, ...        # domain panels consume ui/
docs/
  LoanStar Deep Harbor Design System.html   # kept in sync with ui/
```

**Import convention (after migration):**

```ts
import { Button, Card, Input, KpiCard } from "@/components/ui";
```

Pages must not import from `@/components/admin/ui`.

---

## 4. Token & visual foundation

**Source of truth for values:** Deep Harbor HTML design system (navy/gold/semantic scales already largely mirrored in `globals.css`).

**Production home:** `src/app/globals.css` + Tailwind v4 `@theme inline`.

**Required alignment work:**

- Keep navy / gold / ink / semantic tokens matching the DS HTML.
- Prefer token classes / CSS variables over hardcoded hex in components.
- Chart colors in `src/components/dashboard/charts/theme.ts` must mirror the same palette.
- Surfaces: white page content + navy chrome/KPI cards, per DS.
- Remove or finish retiring misleading “primary = navy” mental models; primary **actions** are gold-filled.

**Reference folder** `design/LoanStar Design System/` may inform patterns but is **not** imported into the Next app. Production tokens stay in `globals.css`. When reference tokens disagree with the Deep Harbor HTML, **HTML DS wins**.

---

## 5. Component inventory

### 5.1 Port from existing `admin/ui.tsx` + `Badge.tsx` into `ui/`

| Component | Notes |
|-----------|--------|
| PageHeader | Display/UI heading styles per DS |
| Card | base, highlight, warning, danger, gradient, kpi |
| KpiCard | Navy surface; gold for highlighted numbers |
| Button | primary, secondary, outline, ghost, danger, success; sm/md/lg |
| Input, Select, Textarea, Label | Focus/error/disabled/helper states |
| Alert | error, success, warning, info |
| Modal, ConfirmDialog | Irreversible vs create-flow patterns |
| Spinner | sm/md/lg + on-navy |
| Table, Th, Td | default + navy header variant |
| SegmentedControl | Pill group |
| Badge / StatusBadge | Status + capability pills |

### 5.2 Add from Deep Harbor HTML (missing or incomplete in app)

| Component | DS section |
|-----------|------------|
| Checkbox, Radio, Toggle | Selects & choices |
| Chips (multi-select) | Selects & choices |
| Toast | Toasts & menus |
| Progress (bar / checklist / wizard) | Progress |
| EmptyState | Accordion & empty state |
| Pagination + Breadcrumbs | Pagination & breadcrumbs |
| Avatar + Tooltip | Avatars & tooltips |
| FileUpload (dropzone + checklist row states) | File upload |
| Accordion | Accordion & empty state |
| Skeleton (list, KPI, text) | Loading & skeletons |
| Stepper / Timeline primitives | Timeline & stepper |
| Dropdown / row actions menu | Toasts & menus |

### 5.3 Domain components (not generic `ui/`, but must use `ui/` + match DS)

Examples: `StatusTimeline`, `DocumentChecklist`, `SignatureConfirm`, borrower sign panels, CSA negotiation/computation, dashboard widgets. Restyle to Deep Harbor; extract any reusable chrome into `ui/` if it appears twice.

### 5.4 Gap protocol (mandatory)

When a page needs a control not listed above:

1. Design it with Deep Harbor rules (navy/gold/type/radius/shadow).
2. Implement under `src/components/ui/` (or domain if loan-specific).
3. Add a labeled section + live example to `docs/LoanStar Deep Harbor Design System.html`.
4. Only then use it in the page.

---

## 6. Phased delivery

### Phase 1 — Foundations
- Align `globals.css` tokens and typography usage to Deep Harbor HTML.
- Align chart theme.
- No page-wide visual rewrite yet.

### Phase 2 — Core `ui/` library
- Create `src/components/ui/` with barrel `index.ts`.
- Port/rebuild core primitives (section 5.1) to match DS visuals.
- Document any visual deltas fixed vs old `admin/ui`.
- Update Deep Harbor HTML if core variants were incomplete.

### Phase 3 — Extended `ui/`
- Implement section 5.2 components.
- **Each new component** added to Deep Harbor HTML in the same phase.
- Prefer small focused files; export only through `ui/index.ts`.

### Phase 4 — Shell
- Restyle `AppShell`, `Sidebar`, `Header` using tokens + `ui/`.
- Navy chrome, gold reserved for primary actions / active emphasis per DS.

### Phase 5 — Migrate consumers
- Replace all `@/components/admin/ui` (and `Badge`) imports with `@/components/ui` (~45 files).
- Consolidate dashboard `KpiCard` / widget cards onto `ui/KpiCard` (or a thin dashboard wrapper that uses it).
- Restyle domain components to consume `ui/`.

### Phase 6 — Delete old library
- Confirm zero imports of `admin/ui` / old `Badge` path.
- Delete `src/components/admin/ui.tsx` and moved `Badge.tsx`.
- Remove leftover hardcoded hex that bypasses tokens where practical.

### Phase 7 — Page polish (full coverage)
- Auth: login, forgot/reset, borrower register.
- All portal queues, details, admin screens, reports, dashboard.
- Visual parity with Deep Harbor; behavior unchanged unless UI wiring requires it.

### Phase 8 — Design system HTML sync pass
- Final audit: every `ui/` export appears in the HTML DS.
- Any invented components from Phase 7 gaps documented.
- HTML remains the human-readable catalog for future work.

Phases may be executed as sequential PRs/commits; **Phase 6 must not run until Phase 5 import migration is complete.**

---

## 7. Design system HTML maintenance

**File:** `docs/LoanStar Deep Harbor Design System.html` (bundled interactive page).

**Requirements:**

- Treat it as the living catalog for LoanStar UI.
- When adding/changing a shared component, update the corresponding section (or add a new section under Foundations / Components / Patterns / More components).
- New sections should show: name, short usage note, and visual states (default/hover/disabled/error as applicable).
- Do not leave app-only components undocumented.

**Practical note:** The file is a bundled HTML artifact. Updates may require unpacking/editing the embedded template (or regenerating the bundle) so the documented section is visible when the file is opened in a browser. Implementation plans will specify the exact edit method.

---

## 8. Out of scope

- Payment, QR, marketplace, analytics features not already in the app.
- Database schema / RLS / API contract changes (unless a UI control cannot function without a trivial wiring fix).
- Replacing Supabase auth flows.
- Importing the standalone `design/LoanStar Design System/` JSX package into the Next build.

---

## 9. Success criteria

- [ ] All interactive chrome uses `import { … } from "@/components/ui"`.
- [ ] `src/components/admin/ui.tsx` deleted; no dead re-exports.
- [ ] No duplicate competing `KpiCard` implementations.
- [ ] Auth + every portal shell/page visually consistent with Deep Harbor.
- [ ] Gold used only for primary actions and key numbers (not decorative spam).
- [ ] Every `ui/` export documented in `LoanStar Deep Harbor Design System.html`.
- [ ] Any component invented during migration is in both `ui/` and the HTML DS.

---

## 10. Decisions locked

| Decision | Choice |
|----------|--------|
| Rollout | Phase by phase, full coverage |
| Library location | New `src/components/ui/` |
| Old library | Migrate consumers, then **delete** `admin/ui.tsx` |
| Missing components | Create aligned to brand + add to Deep Harbor HTML |
| Visual authority | `docs/LoanStar Deep Harbor Design System.html` |
| Scope | Entire system UI; change existing usage to shared components |

---

## 11. Next step after approval

Write a detailed implementation plan at  
`docs/superpowers/plans/2026-07-09-deep-harbor-design-system-adoption.md`  
with bite-sized tasks, exact file paths, and verification steps — then execute phase by phase.
