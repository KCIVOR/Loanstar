# LoanStar UI/UX Structural Audit

Scope: 34 pages under `src/app` + shared component library. Purely descriptive — no recommendations.

---

## 1. ADMIN MODULE (`src/app/admin/*`)

### 1.1 `/admin` — `src/app/admin/page.tsx` — Admin Dashboard
- **Purpose:** Landing dashboard showing modules visible to the logged-in admin's role(s).
- **Layout shape:** Card grid dashboard (responsive 1/2/3 columns).
- **Interactive elements:** None (fully read-only view). No buttons, no inputs.
- **Reveal patterns:** None.
- **Tables:** None — uses a `Card` grid instead, one card per module.
- **Status indicators:** Per-module capability pill badges: "view" (gray), "create" (green), "edit" (blue), "delete" (red), "trigger" (purple). Rendered only if the role has that capability.
- **Modals:** None.
- **Navigation entry points:** None on-page (relies on persistent `Sidebar`).

### 1.2 `/admin/roles` — `src/app/admin/roles/page.tsx` — Roles list
- **Purpose:** List and create custom roles.
- **Layout shape:** List/table with an inline-appended create form.
- **Interactive elements:**
  - Button "Create role" / "Cancel" (primary, toggles form) — top-right in `PageHeader.actions`.
  - Text input "Role name" (required).
  - Text input "Description" (optional).
  - Button "Create role" (primary, submit, disabled while saving — label becomes "Creating…").
  - Table row action: "Edit" link (styled as text link, not a button) navigating to `/admin/roles/[id]`.
- **Reveal pattern (FLAGGED — see Section 6):** `showForm` boolean state toggles a `Card` containing the create-role form directly beneath the `PageHeader`, above the table, on the same page.
- **Tables:** Columns — Name, Slug, Type (System/Custom), Status (Active/Inactive), Actions. Rows are not clickable themselves; only the "Edit" text link in the Actions column navigates. No pagination, no filtering/search.
- **Status indicators:** Role Type shown as plain text "System" / "Custom" (no pill styling). Status shown as colored text (green-700 "Active" / zinc-400 "Inactive") — text color only, not a pill/badge shape.
- **Modals:** None — see inline-form flag above.
- **Navigation entry points:** None besides Sidebar; per-row "Edit" link into detail page.

### 1.3 `/admin/roles/[id]` — `src/app/admin/roles/[id]/page.tsx` — Role detail
- **Purpose:** Edit a single role's name, module permissions (view/create/edit/delete/trigger), and per-module field rules.
- **Layout shape:** Detail view composed of three stacked panel "cards" (not tabs) — Role name, Module permissions matrix, Field rules editor.
- **Interactive elements:**
  - Text input "Role name" + Button "Save" (secondary position, standalone in its own card).
  - **Module permissions table:** a `<table>` with one row per module (from `MODULES` constant) and 5 checkbox columns: **View, Create, Edit, Delete, Trigger** — each cell is a plain HTML `<input type="checkbox">`. Button "Save permissions" sits above the table, in the card header row.
  - **Field rules editor card:**
    - Select "Module" — populated from the role's already-assigned module permissions; option label "Select module…".
    - Large `<textarea>` (rows=10, monospace) directly editing raw JSON for field rules, placeholder example `{"computation": "read_only", "borrower_info": "edit"}`.
    - Helper text: "Values: edit, read_only, deny" (no UI controls for these three values — it's raw JSON typed by hand, not a form).
    - Button "Save field rules" in card header.
  - Back link "← Back to roles" in `PageHeader.actions` (plain text link, not a button).
- **Reveal pattern:** None (no inline-append form here — all sections always visible).
- **RADIO BUTTONS (FLAGGED — see Section 6):** There are **no actual `<input type="radio">` elements on this page.** Permissions are five independent checkboxes per module (not mutually exclusive radio choices), and field-rule values (edit/read_only/deny) are set via freeform JSON text in a textarea, not via radio buttons or any structured selector. This contradicts the assumption of a radio-button pattern — documented precisely in Section 6.2 below.
- **Tables:** The module-permissions grid is a native `<table>` (not the shared `Table`/`Th`/`Td` kit) — Module name column + 5 checkbox columns (View/Create/Edit/Delete/Trigger). Not paginated, not sortable, not clickable rows.
- **Status indicators:** Role header shows "Slug: {slug}" and, if `is_system`, appends "(system role)" as plain text — not a badge.
- **Modals:** None.
- **Navigation entry points:** "← Back to roles" link only.

### 1.4 `/admin/users` — `src/app/admin/users/page.tsx` — Users list
- **Purpose:** Create user accounts and manage per-user role assignments / active status.
- **Layout shape:** List/table with inline-appended create form.
- **Interactive elements:**
  - Button "Create user" / "Cancel" (toggles form) in `PageHeader.actions`.
  - Text input "Email" (type=email, required).
  - Text input "Password" (type=password, required, minLength 8).
  - Text input "Full name" (optional).
  - **Checkbox group "Roles":** one checkbox per available role, label = role name, laid out as wrapped inline `<label>` elements (not a dropdown) — used to multi-select roles for the new user.
  - Button "Create user" (primary, submit).
  - Per-row: checkbox group again (one checkbox per role) inline in the "Roles" table column, toggling role membership live per user (`updateRoles`).
  - Per-row Button "Deactivate"/"Activate" (secondary variant) in Actions column.
- **Reveal pattern (FLAGGED — see Section 6):** `showForm` boolean toggles a `Card` with the create-user form appended inline above the table, same page.
- **Tables:** Columns — Email, Name, Status, Roles (checkbox cluster), Actions. No row click-through, no pagination/filtering.
- **Status indicators:** Status column: green-700 text "Active" / zinc-400 text "Inactive" (text color, not pill).
- **Modals:** None.
- **Navigation entry points:** None besides Sidebar.

### 1.5 `/admin/config` — `src/app/admin/config/page.tsx` — System Config
- **Purpose:** Edit global settings: penalty rate, coverage ratio, aging thresholds.
- **Layout shape:** Single form (max-width card), not list/table.
- **Interactive elements:**
  - Number input "Penalty rate (decimal)" (step 0.001, min 0, max 1, required) with helper description text below from API.
  - Number input "Coverage ratio (decimal)" (step 0.01, min 0, max 1, required).
  - **3-column grid of number inputs** under label "Aging thresholds (days)": placeholders "30", "60", "90" (unlabeled individually beyond placeholder text).
  - Button "Save configuration" (primary, submit; label "Saving…" while pending).
- **Reveal patterns:** None.
- **Tables:** None.
- **Status indicators:** None (success/error shown via `Alert` banner only).
- **Modals:** None.
- **Navigation entry points:** None besides Sidebar.

### 1.6 `/admin/loan-types` — `src/app/admin/loan-types/page.tsx` — Loan Types (rate table)
- **Purpose:** View/enroll interest & PF rate versions per loan type (effectivity-dated).
- **Layout shape:** List/table with inline-appended "enroll" form; filter select in header.
- **Interactive elements:**
  - Select (unlabeled, in `PageHeader.actions`) — filter: "All" / "Active only" / "Inactive only".
  - Button "Enroll rate" / "Cancel" (toggles form) next to the filter select.
  - Text input "Loan type name" (required, placeholder "REGULAR").
  - Number input "Interest rate (decimal)" (step 0.0001, required).
  - Number input "PF rate (decimal, min X%)" (step 0.0001, required) — label text dynamically embeds the computed minimum percentage.
  - Date input "Effective from" (required, defaults to today).
  - Button "Enroll new rate version" (primary submit; "Enrolling…" while pending).
- **Reveal pattern (FLAGGED — see Section 6):** `showForm` boolean toggles a `Card` containing the "enroll rate" form, appended directly below the alerts and above the rate table, same page.
- **Tables:** Columns — Name, Interest, PF Rate, Status, Effective (from → to), Enrolled (timestamp). No pagination; filtering handled via the header select (server refetch), not client-side search.
- **Status indicators:** Status column — green-700 "Active" text / zinc-400 "Inactive" text (text color, not pill shape).
- **Modals:** None.
- **Navigation entry points:** None besides Sidebar.

### 1.7 `/admin/checklists` — `src/app/admin/checklists/page.tsx` — Checklists
- **Purpose:** Configure which document types are required per workflow stage.
- **Layout shape:** Two stacked cards — (1) table of checklist items for the selected stage, (2) an always-visible "add document type" form (not toggled).
- **Interactive elements:**
  - Select "Stage" — options from `STAGES` constant, e.g. "intake" etc. (drives which checklist is shown).
  - Per-row Button "Toggle req/opt" (secondary, small/xs) — flips required↔optional.
  - Per-row Button "Remove" (danger, small/xs) — includes a native `confirm()` browser dialog before deleting ("Remove this checklist item?").
  - Second card: Select "Document type" (only shows types not already in the stage) + Button "Add to checklist" (disabled if no type chosen or nothing available).
- **Reveal patterns:** None — the add-form card is always rendered (not a toggle), though it conditionally shows a "no types available" message instead of the form when the list is empty.
- **Tables:** Columns — Document, Required (badge-like text: "Required"/"Optional"), Order, Actions (Toggle/Remove buttons). No pagination.
- **Status indicators:** "Required" (bold zinc-900 text) vs "Optional" (zinc-500 text) — plain text weight/color distinction, not a colored pill.
- **Modals:** Native browser `confirm()` dialog on Remove (not a custom modal component).
- **Navigation entry points:** None besides Sidebar.

### 1.8 `/admin/checks` — `src/app/admin/checks/page.tsx` — Checks
- **Purpose:** Read-only reference view of check types and stage→check mappings.
- **Layout shape:** Two stacked read-only tables inside cards.
- **Interactive elements:** None — no buttons, no inputs, no forms.
- **Reveal patterns:** None.
- **Tables:**
  - Table 1 "Check types": Slug, Name, Description.
  - Table 2 "Stage check mapping": Stage, Order, Check.
  - No pagination, no row click-through in either.
- **Status indicators:** None.
- **Modals:** None.
- **Navigation entry points:** None besides Sidebar.

### 1.9 `/admin/audit` — `src/app/admin/audit/page.tsx` — Audit Log
- **Purpose:** Read-only, paginated append-only audit trail.
- **Layout shape:** List/table with manual pagination controls.
- **Interactive elements:**
  - Button "Previous" (secondary, disabled at offset 0).
  - Button "Next" (secondary, disabled when at end of results).
  - (No search/filter controls at all.)
- **Reveal patterns:** None.
- **Tables:** Columns — Time, Module, Action, Entity, Actor (truncated UUID), IP. Fixed page size of 50 rows; "Showing X–Y of Z" summary text next to Prev/Next.
- **Status indicators:** None.
- **Modals:** None.
- **Navigation entry points:** None besides Sidebar.

### 1.10 `/admin/email-test` — `src/app/admin/email-test/page.tsx` — Email Test
- **Purpose:** Send a one-off test email using a seeded template.
- **Layout shape:** Single small form (max-width card).
- **Interactive elements:**
  - Text input "Recipient email" (type=email, required).
  - Button "Send test email" (primary submit; "Sending…" while pending).
  - Static helper text: 'Uses template slug "test" via Resend. Requires RESEND_API_KEY.'
- **Reveal patterns:** None.
- **Tables:** None.
- **Status indicators:** None.
- **Modals:** None.
- **Navigation entry points:** None besides Sidebar.

---

## 2. AGENT MODULE (`src/app/agent/*`)

### 2.1 `/agent` — `src/app/agent/page.tsx` — Leads list
- **Purpose:** Agent's list of borrower leads with checklist completion status.
- **Layout shape:** List/table.
- **Interactive elements:** "New lead" link styled as a solid black button (`inline-flex ... bg-zinc-900`), placed in `PageHeader.actions` — note this is a raw `<Link>` styled to look like a button rather than the shared `Button` component.
- **Reveal patterns:** None.
- **Tables:** Columns — Borrower (clickable link to lead detail), Business, Status, Created. No pagination/filter. Empty state text "No leads yet."
- **Status indicators:** Status shown as plain lowercase/capitalized text, no pill.
- **Modals:** None.
- **Navigation:** Row's Borrower name links to `/agent/leads/[id]`.

### 2.2 `/agent/leads/new` — `src/app/agent/leads/new/page.tsx` — New Lead
- **Purpose:** Create a new lead record.
- **Layout shape:** Single form (max-width card).
- **Interactive elements:** Text input "Borrower name" (required); text input "Business / agency name" (optional); Button "Create lead" (primary submit, "Creating…" while pending); Button "Back to leads" (secondary) in header actions, wrapped in a `Link`.
- **Reveal/Tables/Status/Modals:** None.
- **Navigation:** "Back to leads" button-link.

### 2.3 `/agent/leads/[id]` — `src/app/agent/leads/[id]/page.tsx` — Lead detail
- **Purpose:** Show lead status and document-checklist completion flags (agent cannot see document contents).
- **Layout shape:** Detail view — a status card plus the shared `DocumentChecklist` component in "flagsOnly" mode.
- **Interactive elements:** Delegated to `DocumentChecklist` (see Section 4) — file-upload control per checklist item, rendered as a styled label wrapping a hidden `<input type="file">`. Button "Back to leads" (secondary) in header.
- **Reveal patterns:** None on the page itself.
- **Tables:** None (checklist rendered as a `<ul>` list, not a table — see `DocumentChecklist`).
- **Status indicators:** Agent-flag badges "Complete" (green pill) / "Incomplete" (red pill) per checklist item (from `agentFlagBadge` in `DocumentChecklist`).
- **Modals:** None.
- **Navigation:** "Back to leads" button-link.

---

## 3. AR (ACCOUNTING) MODULE (`src/app/ar/*`)

### 3.1 `/ar` — `src/app/ar/page.tsx` — AR masterlist dashboard
- **Purpose:** Post-release accounts overview, portfolio assignment entry, CSV export.
- **Layout shape:** List (card-per-row, not a table) + incoming-queue notice card.
- **Interactive elements:** Button "Export CSV" (secondary) in header — triggers a POST, builds a Blob, and simulates a click on a hidden `<a download>` element to trigger file download.
- **Reveal patterns:** None.
- **Tables:** None — masterlist rendered as a list of `Card` rows (Borrower name + borrower no., loan account no., balance, aging bucket, status) each with an "Open" button-link to detail. No pagination/filter/search.
- **Status indicators:** Aging bucket and account status shown as plain inline text (no pill/badge styling) inside the row.
- **Modals:** None.
- **Navigation:** Per-row "Open" button → `/ar/masterlist/[id]`.

### 3.2 `/ar/masterlist/[id]` — `src/app/ar/masterlist/[id]/page.tsx` — Account detail
- **Purpose:** View one masterlist account; assign portfolio/collector; remedial turnover; check transmittal/clearing status; view amortization schedule.
- **Layout shape:** Detail view, four stacked cards (Assignment, Remedial turnover, Check transmittal/clearing, Amortization schedule) plus a balance-summary card.
- **Interactive elements:**
  - Select "Portfolio" (dropdown of portfolios) + Select "Collector" (dropdown of collector users, label = full name or email) + Button "Save assignment" (primary submit).
  - Conditionally-rendered card (only if `remedial_flag` false): Select "— Remedial staff —" + Button "Confirm turnover" (disabled until a remedial staff is chosen).
  - Select "Transmittal status": Pending / Transmitted / Received.
  - Select "Clearing status": Pending / Clearing (3-day) / Cleared.
  - (These two selects have no visible Save button — page comment notes "persist via future API if needed", i.e., currently non-persisting UI.)
  - Button "Back" (secondary) in header.
- **Reveal patterns:** The "Remedial turnover" card is conditionally rendered (not a toggle button — driven by data state `remedial_flag`), so it behaves like a permanent section that disappears once turned over, rather than a user-toggled reveal.
- **Tables:** None — amortization schedule rendered as a plain `<ul>` list (Installment # · due date · amount · status), not a table.
- **Status indicators:** Aging bucket / account status shown as plain text in a paragraph, not badges.
- **Modals:** None.
- **Navigation:** "Back" link to `/ar`.

### 3.3 `/ar/dcr` — `src/app/ar/dcr/page.tsx` — DCR reconciliation
- **Purpose:** Match bank deposits against submitted DCRs (deposit collection reports) and post as Paid.
- **Layout shape:** List of cards, each representing one DCR queue item with its own reconcile mini-form.
- **Interactive elements:** Per-DCR-card: Text input "Bank deposit reference" (per-row local state) + Button "Post / Paid" (primary).
- **Reveal patterns:** None.
- **Tables:** None — DCR items shown as a `<ul>` list inside each card (borrower name · amount).
- **Status indicators:** None (no colored badges).
- **Modals:** None.
- **Navigation entry points:** ArNav tabs only (see Section 5).

---

## 4. BORROWER MODULE (`src/app/borrower/*`)

### 4.1 `/borrower` — `src/app/borrower/page.tsx` — Borrower dashboard
- **Purpose:** Landing dashboard for the borrower: application status, quick links, reloan trigger.
- **Layout shape:** Dashboard — two summary cards + status timeline + action button row.
- **Interactive elements:** Button-link "Edit profile" (secondary) → `/borrower/profile`; Button-link "Documents" (secondary, conditionally shown if an application exists) → `/borrower/applications/[id]`; Button "Apply for reloan" (primary, disabled while loading, label "Starting…" while pending).
- **Reveal patterns:** None.
- **Tables:** None.
- **Status indicators:** `StatusTimeline` component — horizontal/vertical step indicator with dots per application status (past = filled black dot with ✓, current = filled black or red if denied, future = hollow gray dot), label under each dot.
- **Modals:** None.
- **Navigation:** PortalNav tabs (Dashboard/Profile) + the two button-links described above.

### 4.2 `/borrower/profile` — `src/app/borrower/profile/page.tsx` — Profile form
- **Purpose:** Complete/edit the borrower's SF Application Form data (personal info, addresses, manning agency, financial, allottee, PIC work info, dependents, references).
- **Layout shape:** Long single-page form, sectioned into 9 stacked cards.
- **Interactive elements (exhaustive, by card):**
  1. **Personal information:** text inputs First name*, Middle name, Last name*, Suffix; Email (disabled, read-only); Date of birth (date input), Place of birth, Citizenship, Civil status, Gender, Mobile phone (tel), Landline (tel) — all free text inputs, no selects/radios despite civil status/gender being enumerable.
  2. **Present address:** Street, Barangay, City, Province, Zip code, Country (all text inputs) via reusable `AddressFields`.
  3. **Permanent address:** same 6 fields, separate card.
  4. **Manning agency:** Agency name, Contact person, Phone, Email, Address (text inputs).
  5. **Financial:** Monthly income, Other income, Bank name, Account number, Account type (text/number inputs).
  6. **Allottee:** Name, Relationship, Phone (text inputs).
  7. **PIC work info:** Rank, Vessel, Contract duration, Embarkation date, Disembarkation date (text inputs — dates are plain text fields here, not date pickers).
  8. **Dependents:** repeatable row list; Button "Add dependent" (secondary) appends a new blank row with 3 text inputs (Name, Relationship, Date of birth) directly under the section header, inline, no modal.
  9. **References:** repeatable row list; Button "Add reference" (secondary) appends a new blank row with 4 text inputs (Name, Relationship, Phone, Address) inline.
  - Final Button "Save profile" (primary submit, full form; "Saving…" while pending).
- **Reveal pattern:** Both "Add dependent" and "Add reference" are inline-append list patterns (new row appended directly in the page, not a modal) — same underlying UX family as the flagged "showForm" pattern, though implemented via array push rather than a boolean toggle.
- **Tables:** None (all rows are div-grid based, not `<table>`).
- **Status indicators:** None.
- **Modals:** None.
- **Navigation:** PortalNav tabs only.

### 4.3 `/borrower/applications/[id]` — Application documents/workspace
- **Purpose:** Central borrower workspace for one application — status, release-document signing, briefing sign-off, active-loan payment submission, computation sign-off, document checklist(s).
- **Layout shape:** Detail view composed of many stacked conditional panels (not tabs): Status card + `StatusTimeline`, `ReleaseDocSign`, `BriefingSign`, `LoanActivePanel`, `ComputationSign`, up to two `DocumentChecklist` instances (release stage + intake stage).
- **Interactive elements:** All delegated to child components (detailed individually below in Section 4.6–4.9). Header Button "Back to dashboard" (secondary).
- **Reveal patterns:** Multiple components each have their own reveal state — see BriefingSign / ComputationSign below (confirmation dialogs appended inline, and one true fixed-overlay modal in `SignatureConfirm`, used from the separate sign page).
- **Tables:** None on this page directly.
- **Status indicators:** Status text + blocker warning text (amber) + `StatusTimeline`.
- **Modals:** None directly on this page (child components may render their own — see below).
- **Navigation:** "Back to dashboard" link.

### 4.4 `/borrower/applications/[id]/documents/[docId]/sign` — Document sign page
- **Purpose:** Sign an individual uploaded document.
- **Layout shape:** Detail/action view — delegates to `SignatureConfirm`.
- **Interactive elements:** Button "Back to checklist" (secondary, header); inside `SignatureConfirm` — Button "I confirm / sign" opens a **true modal** (fixed, full-screen dark overlay `bg-black/40`, centered white dialog box) titled "Confirm signature" with Button "Cancel" (secondary) and Button "Yes, sign" (primary, "Signing…" while pending). This is the **only true CSS-overlay modal/dialog found in the entire codebase.**
- **Status indicators:** Success alert "Document signed successfully." replaces the confirm button after signing.
- **Navigation:** "Back to checklist" link.

### 4.5 `/borrower/register` — Registration form
- **Purpose:** Create a new borrower account.
- **Layout shape:** Centered single-column form card (auth-style layout, no sidebar/portal nav).
- **Interactive elements:** Text inputs First name* / Middle name / Last name* (2-col grid for first/middle); Email* (type=email, autoComplete); Password* (type=password, minLength 8, autoComplete=new-password); Mobile phone (tel) / Date of birth (date) (2-col grid); Civil status (free text, placeholder "Single, Married, etc." — not a select/radio despite being enumerable); Button "Register" (primary, full-width, submit, "Creating account…" while pending). Footer link "Sign in" → `/login?redirect=/borrower`.
- **Reveal/Tables/Status/Modals:** None.

---

## 5. CIG / COMMITTEE / CSA / LRA / AR / COLLECTOR / REMEDIAL / REPORTS QUEUE MODULES

### 5.1 `/cig` — `src/app/cig/page.tsx` — CIG verification queue
- **Layout shape:** List (card-per-row).
- **Interactive elements:** None besides per-row "Verify" button-link (secondary) → `/cig/applications/[id]`.
- **Tables:** None (card list). No pagination/filter/search.
- **Status indicators:** Status shown as plain text via `formatStatusLabel`; "Endorsed {datetime}" appended as plain text.
- **Navigation:** CigNav (single tab "Verification queue").

### 5.2 `/cig/applications/[id]` — CIG verification workspace
- **Layout shape:** Detail view, 2-column grid of cards (left: Borrower name edit + External checks + Schedule callback; right: read-only computation + Verification form).
- **Interactive elements:**
  - **Borrower (editable) card:** text inputs First name / Last name + Button "Save name" (primary submit) — only rendered when `editable` true; else read-only text.
  - **External checks card:** per-check-item Button "Pass" (secondary) / Button "Fail" (danger) — pass/fail action buttons, not a select or radio group.
  - **Schedule callback card** (only if editable): datetime-local input "Callback datetime" (required) + text input "Notes" + Button "Schedule callback" (secondary submit).
  - **Verification form card:** Select "Field completeness OK?" (Select/Yes/No); Textarea "PIC allotment awareness"; Textarea "PIC payment reliability"; Date input "CM departure date"; Number input "CM salary"; Text input "CM position"; Text input "CM contract status"; Textarea "Character references"; Select "Finding" (Select/Positive/Negative); Button "Save verification" (primary submit).
  - **Revision-complete banner** (conditionally shown when `applicationStatus === "for_revision"`): Button "Revision complete" (primary).
- **Reveal patterns:** None (no inline-append toggle — all cards conditionally rendered by data state, not by a user-clicked show/hide button).
- **Tables:** None.
- **Status indicators:** "Forwarded to Committee on {date}" success alert once forwarded; missing-fields shown as a bulleted amber list (not badges).
- **Modals:** None.
- **Navigation:** Button "Back to queue" (secondary) header link; CigNav.

### 5.3 `/committee` — `src/app/committee/page.tsx` — Committee queue
- **Layout shape:** List (card-per-row).
- **Interactive elements:** Per-row "Open" button-link (secondary).
- **Tables:** None. No pagination/filter/search.
- **Status indicators:** Status/finding/TAT/forwarded date all rendered as plain concatenated text, no badges.
- **Navigation:** CommitteeNav (single tab).

### 5.4 `/committee/applications/[id]` — Committee decision workspace
- **Layout shape:** Detail view — 3-card status strip (Status / TAT / Vote tally), then conditional cards: Computation (read-only), "Your vote" (voting), "Final action" (decision + hold + revisit sub-forms), "Negotiation override" (conditionally shown), "Latest committee action" summary.
- **Interactive elements:**
  - **Your vote card:** Button "Vote Approve" (primary) / Button "Vote Deny" (secondary).
  - **Final action card:**
    - Button "Approve" (primary), Button "Deny" (danger), Button "Hold" (secondary) — three top-level action buttons.
    - Hold sub-section: text input "Hold comment" (placeholder "Reason for hold") + Button "Confirm hold" (secondary, disabled until comment non-empty) — this is an always-visible inline sub-form beneath the three buttons (border-top divider), not modal/toggle.
    - "Notice to Revisit" sub-form (always visible, border-top divider): Select "Route to" (CSA (intake) / CIG (verification)); Textarea "Comment (required)"; Button "Send Notice to Revisit" (secondary, disabled until comment non-empty).
  - **Negotiation override card** (only rendered if `canOverride` and negotiation exists): Number input "Override amount" (required); Select "Input mode" (Net Sarado / Net Less Security / Principal); Number input "Terms (months)"; Button "Apply override & send to borrower" (primary submit).
- **Reveal patterns:** None via toggle state — Hold/Revisit sub-forms are always rendered inline (not click-to-reveal), stacked with divider lines within the same "Final action" card.
- **Tables:** None.
- **Status indicators:** 3 stat cards showing plain text values (Status label, TAT days, Vote tally label) — no colored badges.
- **Modals:** None.
- **Navigation:** "Back to queue" link; CommitteeNav.

### 5.5 `/csa` — `src/app/csa/page.tsx` — CSA intake queue
- **Layout shape:** List (card-per-row).
- **Interactive elements:** Button-link "New application" (primary) in header → `/csa/applications/new`; per-row "Open" button-link (secondary).
- **Tables:** None. No pagination/filter/search.
- **Status indicators:** Status/reloan flag/blocker all plain concatenated text.
- **Navigation:** CsaNav tabs (Queue / New application).

### 5.6 `/csa/applications/new` — New CSA application
- **Layout shape:** Single form (2-col grid), full-width card.
- **Interactive elements:** Text input Email* (spans 2 cols), First name*, Last name*, Middle name, Mobile phone; Button "Create application" (primary submit, spans 2 cols, "Creating…" while pending).
- **Navigation:** "Back to queue" link; CsaNav.

### 5.7 `/csa/applications/[id]` — CSA workspace
- **Layout shape:** Detail view, 2-column grid: left column (Borrower profile edit, NCL check, DocumentChecklist), right column (ComputationPanel, Endorse-to-CIG card, NegotiationPanel).
- **Interactive elements:**
  - **Borrower profile card** (editable only when `editable` true): text inputs First name, Last name, Mobile + Button "Save profile" (primary submit). Else shows read-only email/mobile text.
  - **NCL check card:** Button "Record pass" (secondary) / Button "Record fail" (danger) — only when editable.
  - **Endorse to CIG card:** bulleted readiness list (green "All requirements met" or list of missing items); Button "Endorse to CIG" (primary, disabled unless ready); below it an inline sub-form (border-top divider, always visible when editable): text input "Hold reason (if incomplete)" + Button "Record hold" (secondary, disabled until non-empty).
- **Reveal patterns:** Endorse card's Hold sub-form is always-inline (no toggle) beneath the Endorse button, divided by a border — same "action + inline secondary form beneath" pattern as Committee page.
- **Tables:** None.
- **Status indicators:** NCL "Current result" shown as capitalized plain text (pending/pass/fail), no badge.
- **Modals:** None.
- **Navigation:** "Back to queue" link; CsaNav.

**`ComputationPanel`** (`src/components/csa/ComputationPanel.tsx`), used on CSA workspace:
- Read-only summary block (loan type, input mode, line items, signed/awaiting-signature text) shown above the form when a computation already exists.
- Form (only if `editable`): Select "Loan type"; Select "Input mode" (Net sarado / Net less security / Principal); Number input "Amount" (required); Number input "Terms (months)" (required); Number input "Addon months" (required); Button "Compute"/"Recalculate" (primary submit, label depends on whether a computation already exists).
- Coverage warning shown via inline `Alert` (not a badge).

**`NegotiationPanel`** (`src/components/csa/NegotiationPanel.tsx`), used on CSA workspace:
- Purely reactive card, no persistent form. If status is `for_revision`: Button "Revision complete". Else if negotiation exists: read-only text (Approved amount / Current amount / Negotiation status) plus conditional Button "Disclose terms to borrower" (only if approved and not yet disclosed).

### 5.8 `/lra` — `src/app/lra/page.tsx` — LRA release queue
- **Layout shape:** List (card-per-row).
- **Interactive elements:** Per-row "Open" button-link (secondary).
- **Tables:** None. No pagination/filter/search.
- **Status indicators:** Status/blocker/queued-time plain text.
- **Navigation:** LraNav (single tab).

### 5.9 `/lra/applications/[id]` — LRA release workspace (most complex single-page workflow found)
- **Purpose:** Multi-stage release processing: open file → choose release path → PDC encoding → generate documents → briefing gate → release funds → close file — plus two `DocumentChecklist` instances.
- **Layout shape:** This page is effectively a **linear wizard rendered as sequentially-appearing cards, gated by server-side status** (not a client-side stepper UI — each step's card is conditionally rendered based on `rf.status` from the API, so the "wizard" has no visual step indicator, back/next controls, or progress bar).
- **Interactive elements (in workflow order):**
  1. If no release file yet: Button "Start processing" (primary).
  2. **Release path card** (status `awaiting_path`): Select "With PDC" / "Without PDC (ATM surrender)"; conditionally (if Without PDC): text input "ATM bank name" (required), text input "ATM card last 4 digits" (maxLength 4, numeric-filtered, required); Button "Save path" (primary).
  3. **PDC encoding card** (status `pdc_encoding` and path = with_pdc): Number input "Monthly amount" (placeholder = computed default); Date input "First check date"; text input "Bank name" (required); text input "First check number"; text input "Blank check from"; text input "Blank check to"; Button "Save PDC schedule" (primary submit).
  4. **Generate documents card** (status `ready_generate`/`awaiting_signatures`): BLRI preview text summary; Button "Generate release documents" (primary).
  5. **Generated documents card** (conditionally shown once docs exist): `<ul>` list of doc name (slug, humanized) + "Signed"/"Awaiting signature" text + optional "PDF" external link (opens in new tab).
  6. **Briefing gate card** (status `awaiting_briefing`): static informational text only, no controls.
  7. **Release cash/check card:** Button "Record release" (primary, disabled unless `canRelease`); conditional amber warning text "Briefing sign-off required."
  8. **Close & transmit card** (status `released`): Button "Close file" (primary).
  9. Two `DocumentChecklist` instances (release-path signing stage, then generic "release" stage).
- **Reveal patterns:** None via toggle — all steps are conditionally rendered strictly from server status (`rf.status`), i.e., a "server-driven wizard" with no client show/hide state.
- **Tables:** None (all lists are `<ul>`).
- **Status indicators:** None as colored badges — all step gating communicated via plain text/paragraphs.
- **Modals:** None.
- **Navigation:** "Back to queue" link; LraNav.

### 5.10 `/ar`, `/ar/dcr` — see Section 3 (AR module). Navigation: ArNav tabs (Masterlist / DCR queue).

### 5.11 `/collector` — `src/app/collector/page.tsx` — Collector workspace
- **Layout shape:** Dashboard-like — two stacked cards (Assigned accounts list, Pending payment proofs list) with a header action button that changes based on state.
- **Interactive elements:**
  - Header action: Button "New DCR" (secondary) when no draft DCR is open; swaps to Button "Submit DCR" (primary) once a draft exists (`draftDcrId` state) — this is a state-swapped single button, not two separate controls shown together.
  - Per pending-payment-proof item (only if `status === "pending_verification"`): Button "Confirm" (secondary) / Button "Reject" (secondary).
  - Per pending-payment-proof item (only if a draft DCR is open and status is pending_verification/confirmed): Button "Add to DCR" (primary).
  - Text "In DCR" (green) shown once a payment has been added, replacing the "Add to DCR" button for that row.
- **Reveal patterns:** None via toggle boolean — draft-DCR mode is driven by `draftDcrId` state (null vs set), changing which buttons appear, but there's no inline-appended form; it's all direct API-call buttons.
- **Tables:** None — both lists are `<ul>`s (accounts: borrower·account·balance·aging; payments: ref·date·amount·status with action buttons).
- **Status indicators:** Payment status shown as plain lowercase text under each item, and "In DCR" as green text — no pill styling.
- **Modals:** None.
- **Navigation:** CollectorNav (single tab).

### 5.12 `/remedial` — `src/app/remedial/page.tsx` — Remedial accounts
- **Purpose:** Read-only list of accounts turned over to remedial collection (91+ days).
- **Layout shape:** List (card-per-row), fully read-only.
- **Interactive elements:** None at all — no buttons, links, or inputs.
- **Tables:** None (card list). No pagination/filter/search.
- **Status indicators:** Aging bucket / balance shown as plain text.
- **Navigation:** RemedialNav (single tab).

### 5.13 `/reports` — `src/app/reports/page.tsx` — Management reports dashboard
- **Purpose:** Read-only executive KPI dashboard.
- **Layout shape:** Dashboard — top row of 4 stat cards, then a 2-column grid of 4 detail cards, then a full-width TAT table-like list.
- **Interactive elements:** None — entirely read-only, no buttons/inputs/filters/date-range pickers.
- **Tables:** None (all `<ul>` lists: Pipeline by stage, Aging buckets, Income recognition, Collection performance, TAT by step) — none are `<table>` elements, none paginated/sortable.
- **Status indicators:** None (plain numeric/text values only).
- **Modals:** None.
- **Navigation:** ReportsNav (single tab).

---

## 6. AUTH / MISC PAGES

### 6.1 `/` — `src/app/page.tsx` — Root
- Server component; no UI — pure redirect logic (login → admin → login based on auth state). No elements to catalog.

### 6.2 `/login` — Sign in
- **Layout shape:** Centered auth card, no portal chrome.
- **Interactive elements:** Text input Email (type=email, autoComplete, required); Text input Password (type=password, autoComplete, required); Button "Sign in" (primary, full-width submit, "Signing in…" while pending). Footer links: "Forgot password?" → `/forgot-password`; "Register here" → `/borrower/register`; "Agent portal" → `/agent`.
- **Modals/Tables/Status:** None.

### 6.3 `/forgot-password` — Reset request
- **Layout shape:** Centered auth card.
- **Interactive elements:** Text input Email (required) + Button "Send reset link" (primary, full-width submit, "Sending…" while pending). Footer link "Back to sign in".
- **Modals/Tables/Status:** None (success/error via `Alert`).

### 6.4 `/reset-password` — Set new password
- **Layout shape:** Centered auth card; conditionally shows either an info alert (if no active reset session) or the form.
- **Interactive elements:** Password input "New password" (minLength 8, required); Password input "Confirm password" (minLength 8, required); Button "Update password" (primary, full-width submit, "Updating…" while pending).
- **Modals/Tables/Status:** None.

---

## 7. SHARED COMPONENT LIBRARY

### 7.1 `src/components/admin/ui.tsx` — Base UI kit
- **`PageHeader`** — props: `title` (h1), `description` (optional subtitle paragraph), `actions` (optional right-aligned slot for buttons/links). Used at the top of virtually every page in the app.
- **`Card`** — props: `variant` = `base` (white/border/shadow, default) | `highlight` (blue-tinted, left accent border) | `warning` (amber-tinted, left accent border) | `danger` (red-tinted, left accent border) | `gradient` (dark blue gradient background, white text). In practice almost every page in this audit only uses the default `base` variant.
- **`Button`** — props: `variant` = `primary` (solid blue) | `secondary` (light blue/tinted) | `outline` (blue border, transparent fill) | `ghost` (no background, gray text) | `danger` (solid red) | `success` (solid green); `size` = `sm` | `md` (default) | `lg`; `loading` boolean (renders a spinning ring inline before children). Across the audited pages, only `primary` (implicit default), `secondary`, and `danger` variants are actually used — `outline`, `ghost`, and `success` variants exist in the kit but were not observed in use on any of the 34 pages.
- **`Input`** — generic styled `<input>` wrapper, passes through all native input props (so `type="text|email|password|number|date|datetime-local|tel"` etc. are all rendered via this one component).
- **`Select`** — generic styled `<select>` wrapper; children are plain `<option>` elements authored per-page (no searchable/combobox behavior anywhere).
- **`Textarea`** — generic styled `<textarea>` wrapper, default `rows={3}` unless overridden.
- **`Label`** — simple styled `<label>`, props `children` + `htmlFor`.
- **`Alert`** — props: `variant` = `error` (red, default) | `success` (green) | `warning` (amber) | `info` (blue). Renders a small colored dot + text in a bordered/tinted box. Used universally for all error/success/info messaging across every page (no toast notifications anywhere in the app).
- **`Spinner`** — full-width centered spinner + "Loading…" text, used as the sole loading-state UI (no skeleton loaders anywhere).
- **`Table` / `Th` / `Td`** — thin wrappers around native `<table>`/`<th>`/`<td>` with consistent border/spacing/typography classes. Several pages (e.g., Role detail's permissions grid) bypass this kit and hand-rolled a native `<table>` instead.

### 7.2 `src/components/admin/Sidebar.tsx` — Admin left nav
- Fixed-width (216px) vertical sidebar, shown only within the `/admin/*` layout.
- **Nav items (in order):** Dashboard (`/admin`, exact match), Roles (`/admin/roles`), Users (`/admin/users`), Config (`/admin/config`), Loan Types (`/admin/loan-types`), Checklists (`/admin/checklists`), Checks (`/admin/checks`), Audit (`/admin/audit`), Reports (`/reports`), Email Test (`/admin/email-test`).
- Footer: "Sign out" button (calls Supabase signOut, redirects to `/login`).
- Active-state styling: highlighted background + colored text when `pathname` matches (exact for Dashboard, `startsWith` for others).

### 7.3 `src/components/portal/*.tsx` — Per-role top nav bars
All nine files share an identical structural pattern: a horizontal header bar (logo + role-colored subtitle label + inline nav links on the left, "Sign out" button on the right), styled per-role with a distinct `role-*` color token. Nav items per file:
- **`PortalNav.tsx`** (shared by borrower & agent, via `portal` prop): Borrower → Dashboard (`/borrower`, exact) + Profile (`/borrower/profile`). Agent → Leads (`/agent`, exact) + New lead (`/agent/leads/new`).
- **`CsaNav.tsx`**: Queue (`/csa`, exact) + New application (`/csa/applications/new`). Subtitle "CSA intake".
- **`CigNav.tsx`**: Verification queue (`/cig`, exact) — single tab. Subtitle "CIG verification".
- **`CommitteeNav.tsx`**: Pending decisions (`/committee`, exact) — single tab. Subtitle "Committee".
- **`LraNav.tsx`**: Release queue (`/lra`, exact) — single tab. Subtitle "LRA — Release".
- **`ArNav.tsx`**: Masterlist (`/ar`, exact) + DCR queue (`/ar/dcr`). Subtitle "Accounting (AR)".
- **`CollectorNav.tsx`**: Assigned accounts (`/collector`, exact) — single tab. Subtitle "Collection".
- **`RemedialNav.tsx`**: Turned-over accounts (`/remedial`, exact) — single tab. Subtitle "Remedial".
- **`ReportsNav.tsx`**: Executive dashboard (`/reports`, exact) — single tab. Subtitle "Reports".
- None of these nine nav bars implement a mobile hamburger menu — the nav links are wrapped in `hidden ... sm:flex`, meaning on narrow viewports the nav links disappear entirely with no replacement menu control (only logo + Sign out remain visible).

### 7.4 `src/components/DocumentChecklist.tsx` — Reusable document checklist
- **Shape:** A `Card` containing a `<ul>` of checklist rows (not a table), one row per required/optional document type.
- **Per-row interactive elements:** A styled `<label>` wrapping a hidden native `<input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx">`, visually rendered as a "Upload"/"Replace"/"Uploading…" `Button` (secondary, small text). Once a document is uploaded (status `uploaded`) and a `documentId` exists (and not in `flagsOnly` mode), an additional inline text link "Sign" appears, navigating to the dedicated sign page.
- **Status badges:** `statusBadge()` — "Confirmed" (green pill), "Uploaded" (blue pill), "Required" (amber pill) / "Optional" (gray pill) for pending items. `agentFlagBadge()` (used when `flagsOnly` — i.e., on the Agent lead-detail page) — "Complete" (green pill) / "Incomplete" (red pill), collapsing confirmed/uploaded into one "Complete" state.
- **Reveal/tables/modals:** No modal, no reveal-toggle; upload happens immediately on file selection (no confirm step).

### 7.5 `src/components/SignatureConfirm.tsx` — Document signature confirmation
- **Shape:** `Card` with document name heading, explanatory paragraph, and a Button "I confirm / sign" (primary).
- **Modal:** Clicking that button sets `confirmOpen=true`, which renders a **true fixed-position full-screen modal overlay** (`fixed inset-0 z-50 bg-black/40`) containing a centered white dialog: heading "Confirm signature", body text referencing the document name, Button "Cancel" (secondary) and Button "Yes, sign" (primary, "Signing…" while pending). This is the **only genuine modal dialog pattern found anywhere in the 34 pages + shared components reviewed.**
- After success: confirm button area is replaced by a success `Alert`.

### 7.6 `src/components/csa/*.tsx` — see Section 5.7 (ComputationPanel, NegotiationPanel) for full detail.

### 7.7 `src/components/borrower/*.tsx`
- **`BriefingSign.tsx`:** `Card` with briefing checklist (`<ul><li>` items) and a Button "Sign briefing acknowledgment" that reveals an **inline confirmation block** (not a modal — a `div` with gray background appended directly below the checklist in the same card) containing acknowledgment text, Button "Confirm briefing" (primary) and Button "Cancel" (secondary). Uses `showDialog` boolean state but renders inline rather than as an overlay — distinct from `SignatureConfirm`'s true modal despite similar naming.
- **`LoanActivePanel.tsx`:** `Card` shown only when application status is `loan_active`/`closed`. Contains: read-only amortization schedule `<ul>`; a "Submit payment proof" form — Number input "Amount" (required), Date input "Payment date" (required), text input "Reference no.", Select "Channel" (Bank deposit / Check / POS / Cash); Button "Submit proof" (primary); below that, a read-only "Payment history" `<ul>` (date · amount · status).
- **`ComputationSign.tsx`:** `Card` showing computation line items; if unsigned and signable, Button "Review & confirm computation" reveals an **inline confirmation block** (same pattern as BriefingSign — gray box appended in-card, not a modal) with Button "I confirm / sign" / "Cancel". Separately, a permanently-visible "Counter-offer" sub-form (border-top divider, not toggled) with Number input "Requested amount" + Button "Submit counter-offer" (secondary), shown when status allows countering.
- **`ReleaseDocSign.tsx`:** `Card` listing release documents (`<ul>`), each with either "Signed" text (green) or Button "Confirm / sign" (secondary) that signs immediately on click (no confirmation step/modal at all here, unlike the other two sign components).

---

## 8. FLAGGED PATTERN LOCATIONS (as specifically requested)

### 8.1 "Create button → form appended inline in page" pattern

| Page | State variable | What happens when toggled |
|---|---|---|
| `src/app/admin/roles/page.tsx` (line 32, 90–92, 102–127) | `const [showForm, setShowForm] = useState(false);` | Button in `PageHeader.actions` reads `{showForm ? "Cancel" : "Create role"}` and calls `setShowForm(!showForm)`. When true, a `<Card className="mb-6">` is rendered directly beneath the error alert and above the Roles table (same page, same scroll position), containing a `<form>` with Input "Role name", Input "Description", and Button "Create role" (submit). On successful creation, `setShowForm(false)` collapses it again. |
| `src/app/admin/users/page.tsx` (line 33, 138–140, 150–208) | `const [showForm, setShowForm] = useState(false);` | Identical pattern: header Button toggles `showForm`; when true, a `<Card className="mb-6">` appears above the Users table with Input "Email", Input "Password", Input "Full name", a checkbox group "Roles" (one checkbox per role), and Button "Create user". Collapses via `setShowForm(false)` on success. |
| `src/app/admin/loan-types/page.tsx` (line 36, 128–131, 146–198) | `const [showForm, setShowForm] = useState(false);` | Header Button ("Enroll rate"/"Cancel") toggles `showForm`; when true, a `<Card className="mb-6">` appears above the Loan Types table with Input "Loan type name", Input "Interest rate", Input "PF rate", Date input "Effective from", and Button "Enroll new rate version". Collapses on success. |

`src/app/admin/roles/[id]/page.tsx` does **not** use this pattern — it has no `showForm` state; all its cards (Role name, Module permissions, Field rules) are permanently visible, not toggled.

### 8.2 Radio-button usage in `src/app/admin/roles/[id]/page.tsx`

**Finding: there are no `<input type="radio">` elements on this page.** The two permission-configuration mechanisms are:
1. **Module permissions matrix** (lines 280–329): a native `<table>` with one row per module and five `<input type="checkbox">` columns — View, Create, Edit, Delete, Trigger (`PERM_KEYS` constant, lines 46–52). These are independent boolean toggles, not a mutually-exclusive radio group.
2. **Field rules** (lines 332–369): a single Select "Module" dropdown plus one large `<textarea>` where the admin hand-types raw JSON mapping field names to one of three string values — `edit`, `read_only`, `deny` — per the helper text "Values: edit, read_only, deny" (line 366–368). There is no radio group, select, or button-group UI for choosing among these three values; it is unstructured JSON text entry.

If radio buttons exist elsewhere for a similar 3-way choice, none were found in this file or any of the other 33 pages during this audit (confirmed via full-text read of every page — no `type="radio"` string appears anywhere in `src/app`).

### 8.3 Other occurrences of the "toggle boolean → reveal form/content inline" pattern (full sweep across `src/app` and `src/components`)

Beyond the three `showForm` cases above, the following components use an analogous boolean-toggle-reveals-inline-content pattern (none use a real modal except where noted):

| File | State variable | Behavior |
|---|---|---|
| `src/components/borrower/BriefingSign.tsx` (line 24, 91–113) | `const [showDialog, setShowDialog] = useState(false);` | Button "Sign briefing acknowledgment" sets `showDialog=true`; a gray-background `<div>` block is appended **inline within the same `Card`**, directly below the checklist `<ul>`, containing confirmation text and Confirm/Cancel buttons. Despite the variable name "Dialog", this is NOT a modal/overlay — it renders in normal document flow. |
| `src/components/borrower/ComputationSign.tsx` (line 49, 134–151) | `const [showDialog, setShowDialog] = useState(false);` | Same inline (non-overlay) reveal pattern: Button "Review & confirm computation" reveals a bordered `<div>` block inline in the same `Card`, with Confirm/Cancel buttons. |
| `src/components/SignatureConfirm.tsx` (line 18, 75–100) | `const [confirmOpen, setConfirmOpen] = useState(false);` | This is the **one exception** — it renders a genuine `fixed inset-0` full-screen overlay modal (see Section 7.5), not an inline reveal. |
| `src/app/admin/checklists/page.tsx` (line 40) | `const [adding, setAdding] = useState(false);` | Not a visibility toggle — this only controls a button's disabled/loading label ("Adding…") for the always-visible "Add document type" form; the form itself is never hidden/shown by this variable. |
| `src/app/csa/applications/[id]/page.tsx` and `src/app/committee/applications/[id]/page.tsx` | No boolean toggle used | Both pages have "always-inline" secondary sub-forms (Hold reason / Hold comment / Notice to Revisit) that are permanently rendered beneath primary action buttons, divided by a border line — same visual outcome as a toggled reveal, but implemented without any show/hide state at all (i.e., there is no way to collapse them once the parent card itself is visible). |

No other `showForm`-named or equivalent inline-reveal-for-CRUD-creation patterns were found in the remaining 25 pages not listed above; those pages either have no creation flows, use full separate pages for creation (e.g., `/agent/leads/new`, `/csa/applications/new`), or are read-only.
