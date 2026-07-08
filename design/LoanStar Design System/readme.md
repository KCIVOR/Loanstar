# LoanStar Design System

A design system for **LoanStar**, a loan management system (LMS) for a Philippine lending institution — covering the full loan lifecycle from application intake through credit investigation, committee approval, release, and collection.

## Sources

This design system was built from the following inputs:

- **GitHub repo:** [KCIVOR/Loanstar](https://github.com/KCIVOR/Loanstar) — a Next.js + Supabase application.
- **`docs/LoanStar_System_Design.md`** (in the repo) — a full written design specification: color tokens, type scale, component inventory, page-by-page layouts.
- **`docs/LoanStar (1)/*.dc.html`** (in the repo) — five high-fidelity, interactive HTML mockups originally built against that spec: a design-system reference page plus Login, Borrower Portal, Admin Dashboard, Staff Operations, and Loan Application screens. They're preserved as-is in `/reference/original-mockups/` and `/reference/docs/` — **these are the superseded blue-theme mockups**, kept for before/after comparison only.
- **"Deep Harbor"** (`LoanStar Redesign.dc.html`, option 2b) — the current source of truth. A navy (`#0E1E4B`) brand redesign with a gold star mark (`#F2B705`) and red wordmark (`#E4574A`), replacing the earlier blue (`#1A56DB`) system throughout this design system and the production app.
- `src/lib/constants.ts` — the 15 module slugs and 18 application-status values that drive the workflow (see Content Fundamentals below).

Explore the source repo further at the link above to cross-check anything this design system simplified or omitted.

## Product context

LoanStar's core workflow has **6 stages**, each owned by a different staff role: Intake & Verification (CSA) → Credit Investigation (CIG) → Committee Review → Negotiation & Docs (LRA) → Briefing & Release (PDCs) → Monitoring & Collection (DCR). Borrowers track their own application through the same 6 stages in a self-service portal.

Surfaces covered here:
- **Auth** — role-tabbed sign-in (Borrower / Staff / Admin) + OTP verification
- **Borrower Portal** — self-service dashboard, balance, payments, application progress
- **Loan Application** — 4-step borrower application form
- **Staff Operations** — shared queue+detail workspace, switchable across all workflow roles (CSA, CIG, Committee, LRA, Collection)
- **Admin Dashboard** — branch-manager KPIs, analytics, applications table

Not built (no mockup existed for these — see `docs/LoanStar_System_Design.md` §6 for the full spec): CIG verification tabs, Committee voting, LRA release-document signing steps, AR masterlist/DCR reconciliation, Remedial, and Agent lead management. Extend using the same tokens and components.

## Content fundamentals

- **Tone:** professional, plain, reassuring — banking software, not a consumer app. No jokes, no emoji in staff surfaces. One warm touch is allowed on the borrower dashboard ("Good morning, Juan 👋").
- **Voice:** second person for borrower-facing copy ("Your loan application has been received…", "You are about to pay installment #8"); third person / role-labeled for staff views.
- **Casing:** sentence case for body copy and buttons ("Apply for Loan", "View Schedule"); ALL CAPS with wide letter-spacing only for tiny section eyebrows and table headers (10–11px).
- **Numbers:** every peso amount uses the ₱ symbol and `tabular-nums`; dates are spelled out ("July 15, 2026"), never slashes, in borrower-facing copy.
- **Error/help copy always explains the fix**, not just the failure: "Applicant must be at least 18 years old", not "Invalid date."
- **Module and status naming** comes straight from `src/lib/constants.ts` — 15 modules (Auth & Admin, Borrower Portal, Leads, Intake, Computation, Verification, Committee, Negotiation, Release (LRA), Accounting (AR), Collection, Remedial, Reports, System Config, Audit Log) and 18 application statuses (registered → …→ loan_active). Use these exact names when labeling workflow states.

## Visual foundations

- **Colors:** immersive navy (`#0E1E4B`→`#2F55B4`) on clean navy-tinted neutrals (`#F3F5FA` page bg, white cards), with gold (`#F2B705`) reserved for brand accent/emphasis moments and red (`#E4574A`) reserved for the wordmark only. Semantic success/warning/danger/info are desaturated, WCAG-AA-checked. See the Colors cards.
- **Type:** Albert Sans everywhere (400–800), tight negative letter-spacing on large headings (-1px at 40px), generous 1.65–1.75 line-height on body copy. Numerals switch to a monospace font + `tabular-nums` for anything financial (amounts, loan IDs, OTP digits).
- **Spacing:** strict 4px base grid, 24px card padding, 48px page horizontal padding, 64px section rhythm.
- **Backgrounds:** flat `#F3F5FA` page background throughout — no photography, no textures, no patterns. The signature gradient is the deep-navy diagonal (`#0E1E4B → #16233F`) reserved for hero/balance cards and the auth brand panel — never used decoratively elsewhere.
- **Animation:** minimal and functional only — 150ms color transitions on hover, 200ms fade+scale on modals, a soft `pulse` on in-progress status dots, `shimmer` on skeleton loaders, `spin` on button loading states. No bounce, no springs, no decorative looping motion on static content.
- **Hover/press states:** hover = darker fill for solid buttons (primary-600→700), lighter tint for tinted surfaces; no press/shrink effect is used (buttons don't scale on `:active`).
- **Borders & shadows:** 1px `#DFE5F0` borders everywhere; shadows are barely-there (`0 1px 3px rgba(15,23,42,.08)` on cards) — depth communicated mostly through borders and background tint, not shadow.
- **Corner radii:** softer than the earlier blue system — 6px buttons/inputs, 12px cards/modals, 20px feature cards and hero-to-tray transitions, full-round for pills/avatars/toggles. Matches the Deep Harbor mockup's rounder card language.
- **Cards:** white surface, 1px border, 12px radius, 24px padding, subtle shadow; "highlight" variants (CIG notices, warnings) add a 4px colored left border instead of changing the whole card color.
- **Transparency/blur:** used exactly twice — modal overlay (`rgba(15,23,42,0.4)` + `backdrop-filter: blur(2px)`) and translucent stat tiles on the auth brand panel (`rgba(255,255,255,0.1–0.15)`). Not used elsewhere.
- **Layout:** fixed sidebar (224–248px) + sticky top bar (56–64px) is the shared shell for every logged-in surface; content max-width 900–1300px depending on surface.

## Iconography

Every icon in the source is a **hand-authored inline SVG**, 14–18px viewBox, 1.5–1.8px round-capped stroke, colored brand-navy or neutral-gray. There is no icon font, no PNG icon set, and no emoji use outside the one borrower-dashboard greeting. No third-party icon library (Lucide, Heroicons, etc.) was in the source — if you need a broader icon set for new screens, match this stroke weight and style, or substitute a stroke-based CDN set (Lucide is the closest match) and note the substitution.

## Fonts — substitution flagged

**Albert Sans** (headings + body) is the real brand font — reproduced exactly via Google Fonts, no substitution needed.

**Monospace is a flagged substitution.** The built design-tokens table names `'SF Mono', monospace` for loan IDs/amounts, and a couple of rows just use the browser's generic `monospace`. SF Mono is a macOS system font with no distributable web-font file, so this design system ships **JetBrains Mono** instead for cross-platform consistency. If you have real brand mono files, swap the `@font-face` in `tokens/typography.css`.

## Logo

No production logo file was supplied in the source repo — the brand mark is a **gold five-pointed star inside a rounded-square navy gradient tile**, with the wordmark set in red — drawn consistently as inline SVG across every mockup (sidebar, login, application header). It's reproduced faithfully as real asset files at `assets/logo/loanstar-mark.svg` and `assets/logo/loanstar-wordmark.svg`. Do not treat this as a final production logo — confirm with the brand owner before shipping it externally.

## Index

```
styles.css                     — global stylesheet entry (imports only)
tokens/
  colors.css                   — primary/neutral/semantic/role-accent colors
  typography.css               — font-face + type scale
  spacing.css                  — spacing/radius/shadow/z-index
assets/logo/                   — star mark + wordmark (SVG)
guidelines/                    — 13 foundation specimen cards (Colors, Type, Spacing, Brand)
components/
  core/        Button, Badge, Card, StatCard, Alert
  forms/       Input, Select, Checkbox, Toggle
  feedback/    Modal, Toast, ProgressBar, EmptyState, Skeleton
  navigation/  Sidebar, TopBar, PageHeader
  loan/        StatusTimeline, DocumentChecklist, SignatureConfirm, Stepper, AmortizationTable
ui_kits/
  auth/                — Login + OTP
  borrower-portal/      — Borrower dashboard
  loan-application/     — 4-step application form
  staff-operations/     — Multi-role queue + detail workspace
  admin-dashboard/      — Branch-manager dashboard
reference/
  original-mockups/     — the 5 source .dc.html mockups, unedited
  docs/                 — LoanStar_System_Design.md, ADMIN_GUIDE.md
SKILL.md                — Claude Code / Agent Skills-compatible skill file
```

### Intentional additions

The source repo's own component file (`admin/ui.tsx`) defines only bare primitives (Button, Card, Input, Select, Textarea, Label, Alert, Spinner, Table). The built mockups additionally establish Badge, Toggle, Modal, Toast, ProgressBar, EmptyState, Skeleton, Sidebar, TopBar, and the loan-domain components as real, repeated patterns — these are included here as first-class components since they appear consistently across every mockup, not invented from scratch.
