# LoanStar LMS — Complete System Design Specification
Version 1.0 — July 2026 | For Claude Code UI Rebuild

---

## 1. Design Philosophy

LoanStar is a professional **loan management system** used by financial staff (CSA, CIG, Committee, LRA, AR, Collector) and borrowers. The design must be:

- **Trustworthy and institutional** — not a consumer app; feels like banking software
- **Information-dense but not cluttered** — staff process many files daily
- **Role-separated** — each portal has its own visual identity to prevent role confusion
- **Accessible** — WCAG AA contrast minimum, keyboard-navigable forms
- **Responsive** — 1280px+ desktop (staff primary), 768px tablet, 375px mobile (borrower only)

---

## 2. Brand & Color System

### Primary Brand
- **Brand name:** LoanStar
- **Tagline:** Loan Management System
- **Logo mark:** A five-pointed star enclosed in a circle, rendered in the primary color

### Color Palette (CSS custom properties in globals.css)

```css
/* Primary — trust, authority, interactive */
--color-primary-50:  #EFF6FF;
--color-primary-100: #DBEAFE;
--color-primary-200: #BFDBFE;
--color-primary-300: #93C5FD;
--color-primary-400: #60A5FA;
--color-primary-500: #3B82F6;   /* main interactive */
--color-primary-600: #2563EB;   /* button default, links */
--color-primary-700: #1D4ED8;   /* button hover */
--color-primary-800: #1E40AF;
--color-primary-900: #1E3A8A;   /* sidebar dark */

/* Neutral — UI scaffolding */
--color-neutral-0:   #FFFFFF;
--color-neutral-50:  #F8FAFC;
--color-neutral-100: #F1F5F9;
--color-neutral-200: #E2E8F0;
--color-neutral-300: #CBD5E1;
--color-neutral-400: #94A3B8;
--color-neutral-500: #64748B;
--color-neutral-600: #475569;
--color-neutral-700: #334155;
--color-neutral-800: #1E293B;
--color-neutral-900: #0F172A;

/* Semantic */
--color-success-50:  #F0FDF4;
--color-success-100: #DCFCE7;
--color-success-500: #22C55E;
--color-success-600: #16A34A;
--color-success-700: #15803D;

--color-warning-50:  #FFFBEB;
--color-warning-100: #FEF3C7;
--color-warning-500: #F59E0B;
--color-warning-600: #D97706;
--color-warning-700: #B45309;

--color-danger-50:   #FFF1F2;
--color-danger-100:  #FFE4E6;
--color-danger-500:  #EF4444;
--color-danger-600:  #DC2626;
--color-danger-700:  #B91C1C;

--color-info-50:     #F0F9FF;
--color-info-100:    #E0F2FE;
--color-info-500:    #0EA5E9;
--color-info-600:    #0284C7;
--color-info-700:    #0369A1;
```

### Role Accent Colors (top navbar bg per portal)
| Portal | Color |
|---|---|
| CSA | `#1E3A8A` (primary-900) |
| CIG | `#312E81` (indigo-900) |
| Committee | `#4C1D95` (violet-900) |
| LRA | `#064E3B` (emerald-900) |
| AR | `#0F172A` (neutral-900) |
| Collector | `#164E63` (cyan-900) |
| Remedial | `#7F1D1D` (red-900) |
| Agent | `#78350F` (amber-900) |
| Borrower | `#2563EB` (primary-600 — lighter, friendlier) |

### Typography
```
Font families:
  Display / Headings: "Inter", sans-serif (weights 600, 700)
  Body / UI:          "Inter", sans-serif (weights 400, 500)
  Monospace:          "JetBrains Mono" — amounts, IDs, borrower numbers

Type scale:
  xs:   11px / 16px
  sm:   12px / 20px
  base: 14px / 24px  ← default
  md:   15px / 24px
  lg:   16px / 28px
  xl:   18px / 28px
  2xl:  20px / 32px
  3xl:  24px / 32px  ← page titles
  4xl:  30px / 40px  ← KPI values
  5xl:  36px / 44px

Usage:
  Page title:    3xl / 700 / neutral-900
  Section title: xl  / 600 / neutral-800
  Card title:    lg  / 600 / neutral-800
  Label:         sm  / 500 / neutral-700
  Body:          base / 400 / neutral-700
  Caption:       xs  / 400 / neutral-500
  Mono value:    base JetBrains Mono / neutral-800
```

---

## 3. Spacing & Grid

```
Base unit: 4px
Page horizontal padding: 24px (mobile) 32px (tablet) 48px (desktop)
Page max-width: 1280px centered
Content max-width: 960px (forms/detail), 1280px (dashboards)

Grid gaps:
  compact:  16px
  standard: 24px
  spacious: 32px
```

---

## 4. Border, Shadow & Radius

```
Border radius:
  sm:   4px  — badges, chips
  md:   8px  — inputs, buttons
  lg:   12px — cards, modals
  xl:   16px — feature cards
  full: 9999px — pills, avatars

Borders:
  default: 1px solid neutral-200
  focus:   2px solid primary-500
  error:   1px solid danger-500
  success: 1px solid success-500

Shadows:
  xs: 0 1px 2px rgba(0,0,0,0.05)
  sm: 0 1px 3px rgba(0,0,0,0.08)     ← cards
  md: 0 4px 6px rgba(0,0,0,0.07)     ← dropdowns
  lg: 0 10px 15px rgba(0,0,0,0.10)   ← modals
  xl: 0 20px 25px rgba(0,0,0,0.12)   ← overlays
```

---

## 5. Component Library

### 5.1 Buttons

Variants: `primary` | `secondary` | `ghost` | `danger` | `success` | `warning` | `link`
Sizes: `sm` (px-12/py-6) | `md` (px-16/py-8, default) | `lg` (px-20/py-10)

```
primary:   bg-primary-600, text-white, hover:bg-primary-700
secondary: bg-white, border-neutral-300, text-neutral-700, hover:bg-neutral-50
ghost:     bg-transparent, text-neutral-600, hover:bg-neutral-100
danger:    bg-danger-600, text-white, hover:bg-danger-700
success:   bg-success-600, text-white, hover:bg-success-700
link:      text-primary-600, no bg, underline on hover

All:
  radius-md, font-medium, transition-colors 150ms
  :disabled → opacity-40, cursor-not-allowed
  :loading  → inline 16px spinner left + "Saving…" text
  :focus    → ring-2 ring-primary-500 ring-offset-2
```

### 5.2 Form Controls

**Text Input:**
- Height 40px, padding 8px/12px, radius-md
- Border neutral-300 → focus border-primary-500 + ring-2 ring-primary-100
- Error: border-danger-500 + ring-2 ring-danger-100
- Disabled: bg-neutral-50, text-neutral-400
- Placeholder: neutral-400 italic

**Currency Input:**
- ₱ prefix in neutral-500, left slot
- Monospace font, right-aligned number
- Thousand-separator on blur

**Select:**
- Same styling as input, custom chevron icon
- Options: bg-white, shadow-md, hover bg-primary-50

**Textarea:** Same as input, min-height 80px, resize-y

**Checkbox / Radio:** 16×16px, primary-600 when checked

**Toggle switch:** 36×20px track, primary-600 on, neutral-300 off, animated

**File upload dropzone:**
- Dashed border-2 neutral-300, bg-neutral-50, rounded-xl
- Hover: border-primary-400, bg-primary-50
- Content: upload icon + "Drag files here or click to browse"
- Uploaded: filename chip + size + × remove + progress bar

**Form group layout:**
- Label → Control → Helper text (xs/neutral-500) → Error (xs/danger-600)
- Required: asterisk (*) in danger-500 after label

### 5.3 Cards

**Base card:** bg-white, border neutral-200, radius-lg, shadow-sm, p-24px

**Stat card (KPI):**
```
┌────────────────────────────────┐
│  Icon (24px)    Trend badge    │
│  Label (sm/neutral-500)        │
│  Value (4xl/700/neutral-900)   │
│  Sub-label or comparison (xs)  │
└────────────────────────────────┘
Trend badge: success-100/green arrow or danger-100/red arrow + % change
```

**Queue card:**
```
┌──────────────────────────────────────────────┐
│ ●  Name (md/600)  BorrowerNo pill            │
│    Status label · Created date               │
│    Blocker (warning-700 if exists)           │
│                                  [Open →]    │
└──────────────────────────────────────────────┘
Left border 4px = status color
```

**Highlight card:**
- bg-primary-50, border-primary-200, left-border-4 primary-500
- Warning variant: warning-50 / warning-200 / warning-500
- Danger variant: danger-50 / danger-200 / danger-500

### 5.4 Badges & Tags

**Status badges** (rounded-full, px-8/py-2, text-xs/600, uppercase):
| Status | Background | Text |
|---|---|---|
| registered | neutral-100 | neutral-600 |
| documents_pending | warning-100 | warning-700 |
| submitted, for_verification, for_approval | info-100 | info-700 |
| approved | success-100 | success-700 |
| denied | danger-100 | danger-700 |
| negotiating_terms, awaiting_confirmation, for_revision, on_hold | warning-100 | warning-700 |
| lra_pending, release_signing, release_briefing | primary-100 | primary-700 |
| release_ready, released, loan_active | success-100 | success-700 |
| closed | neutral-100 | neutral-600 |

**Aging badges:**
- Current: success-100/success-700
- 1–30: warning-100/warning-700
- 31–60: warning-200/warning-700
- 61–90: danger-100/danger-700
- 91+: danger-600/white (filled, prominent)

**Permission badges:**
- view: neutral-100/neutral-600
- create: success-100/success-700
- edit: info-100/info-700
- delete: danger-100/danger-700
- trigger: primary-100/primary-700

### 5.5 Tables

- Container: border neutral-200, radius-lg, shadow-sm, overflow-x-auto
- Header: bg-neutral-50, text-xs/600/uppercase/neutral-500, px-16/py-12
- Row: bg-white, border-b neutral-100, hover bg-neutral-50
- Selected row: bg-primary-50, left-border-2 primary-500
- Numeric cells: right-aligned, monospace
- Empty state: icon + "No records" centered, py-32

### 5.6 Modals & Dialogs

- Overlay: bg-black/50 + backdrop-blur-sm
- Container: bg-white, radius-xl, shadow-xl, p-24
- Widths: max-w-md (confirm) | max-w-lg (forms) | max-w-2xl (detail)
- Header: title (xl/700) left + × close right + divider
- Footer: divider + right-aligned [Cancel] [Confirm]
- Open animation: fade-in + scale 0.95→1.0 over 200ms
- Focus trap + Escape to close + aria-modal="true"

**Confirmation dialog:**
- Warning/danger icon 40px centered
- Centered title and description
- Centered action buttons

### 5.7 Navigation

**Admin sidebar (240px, fixed, dark):**
```
bg-neutral-900
  Logo: LoanStar wordmark + star icon (white, 20px/700)
  Subtitle: "Super Admin" (neutral-400, xs)
  Divider: neutral-700

  Nav groups with ALL CAPS label (xs/neutral-500):
    WORKFLOW:  Roles · Users · Checklists · Checks
    SYSTEM:    Config · Loan Types · Audit
    REPORTS:   Reports · Email Test

  Item default: text-neutral-300, hover bg-neutral-800/text-white
  Item active:  bg-primary-600, text-white
  Icon: 16px Lucide, mr-8px

  Bottom: avatar + email + Sign out
```

**Staff portal top navbar (56px, role accent bg):**
```
Left:   LoanStar logo (white) + role name (white, xs, opacity-75)
Center: nav links (white, active = white bg/dark text or underline)
Right:  user email (white, sm) + Sign out (ghost white)
```

**Borrower/Agent navbar (56px, white bg, border-b neutral-200):**
```
Left:   LoanStar logo (primary-600) + "Borrower Portal" (xs/neutral-500)
Right:  name + Sign out
```

**Tab bar (within detail pages):**
- Underline style: active = primary-600 2px underline, text primary-700
- Inactive: neutral-500, hover neutral-700

### 5.8 Page Header (every page except auth)

```
┌────────────────────────────────────────────────────┐
│ [← Back]  Page title (3xl/700/neutral-900)         │
│           Description (sm/neutral-500)              │
│                           [Secondary] [Primary CTA] │
└────────────────────────────────────────────────────┘
Back arrow: detail pages only
```

### 5.9 Status Timeline

```
Horizontal stepper (desktop) / vertical (mobile)
Each step: 28px circle dot + label below (10px, 5rem max-width, centered)

States:
  Past:    filled neutral-900, checkmark ✓, neutral-700 label
  Current: filled primary-600, step number, ring-2 ring-primary-200, primary-700 label bold
  Future:  neutral-100, step number, neutral-400 label
  Denied:  danger-600, ✕, danger-700 label

Connector: neutral-200 line (future), neutral-900 (past)
```

### 5.10 Alerts & Toasts

**Inline alert:** left-border-4, radius-md, px-12/py-10, icon + text
- error: danger-500/danger-50/danger-800
- success: success-500/success-50/success-800
- info: info-500/info-50/info-800
- warning: warning-500/warning-50/warning-800

**Toast (top-right, 320px, shadow-lg, radius-lg):**
- Auto-dismiss 5s with progress bar countdown
- Stack max 3, newest on top
- × manual close

### 5.11 Loading States

**Page spinner:** Centered, py-48px, animated ring (primary-500, 32px), "Loading…" neutral-400

**Skeleton loader:** Animated shimmer, mimics content shape (preferred for lists/cards)

**Button loading:** 16px inline spinner + "Saving…"

### 5.12 Empty States

```
Centered in card:
  Outlined icon (80px, neutral-200)
  Title (lg/600/neutral-700): "No items yet"
  Description (sm/neutral-500): context-specific
  Optional CTA button
```

### 5.13 Signature Confirm Component

```
Card with left-border-4 primary-500
Header: document name (lg/600) + doc type badge
Body: "By confirming, you acknowledge…" (sm/neutral-600)
[I have reviewed this document — Sign & Confirm] primary button full-width

→ Confirmation modal:
    Warning icon centered
    "Confirm signature on: [doc name]"
    "This cannot be undone."
    [Cancel] [Yes, sign document]

Signed state:
  ✓ icon + "Signed on [date time]" (success-600)
  Download link
```

### 5.14 Document Checklist Component

```
Card with section heading
Each item row:
  Document name (sm/500) + optional badge
  Filename (xs/neutral-400) if uploaded
  Status badge (Pending/Uploaded/Confirmed) + Upload/Replace button right

Agent view (flagsOnly): Complete/Incomplete pills only
```

### 5.15 Computation Panel

```
Mode toggle tabs: [NET_SARADO | NET_LESS_SECURITY | PRINCIPAL]
Amount (₱ currency input), Terms, Addon months, Loan type dropdown
[Compute] primary button

Results table (two-column label:value, alternating rows):
  Net Released: lg/700/success-700 (highlighted)
  Monthly Amortization: lg/700/primary-700 (highlighted)
  Coverage ratio warning if triggered: warning alert

Signed state: green banner "Signed by borrower on [date]", breakdown read-only
```

### 5.16 Amortization Schedule

```
Table: # | Due Date | Amount Due | Penalty | Status
Status badge per row (pending/paid/overdue)
Overdue rows: bg-danger-50 tint
Current month: bg-primary-50, left-border primary-500
Summary footer: Total due | Total paid | Outstanding (mono/bold)
```

---

## 6. Page-by-Page Layout Designs

### 6.1 Login Page (`/login`)

```
Full screen bg-neutral-50
Centered card: max-w-sm, bg-white, shadow-md, radius-xl, p-32

  LoanStar star logo (primary-600, 40px) centered
  "Sign in to LoanStar" (2xl/700) centered
  "Loan Management System" (sm/neutral-500) centered

  Form:
    Email field
    Password field
    Forgot password link (right-aligned, xs/neutral-500)
    [Sign in] full-width primary button

  Divider with "or"
  "New borrower? Register here" link
  "Agents: use your agent account then go to /agent" caption (xs)
```

### 6.2 Borrower Register (`/borrower/register`)

```
Centered card max-w-md
Step indicator: 1 Personal → 2 Contact → 3 Account
Multi-section form with Next/Back navigation
[Register] on final step
```

### 6.3 Admin Dashboard (`/admin`)

```
Sidebar layout

Row 1: 4 KPI stat cards
  Active Users | Total Roles | Active Modules | Pending Audit Events

Row 2: Module grid (3-col)
  Each module card: icon + name + description + permission badges + quick link

Row 3: Recent audit events table (last 10 rows)
  Time | Actor | Action | Entity | Module
```

### 6.4 Users Page (`/admin/users`)

```
Search bar + role filter dropdown row
Users table:
  Avatar | Name + Email | Roles (pills) | Status | Last login | [Edit]
  Expanded row: role checkbox matrix + deactivate toggle
Create user modal
```

### 6.5 Role Detail (`/admin/roles/[id]`)

```
Role name + description (editable fields)
Module permission matrix table:
  Module | View ☐ | Create ☐ | Edit ☐ | Delete ☐ | Trigger ☐
  Each cell: checkbox
Field rules editor section
[Save changes] sticky footer bar
```

### 6.6 Config Page (`/admin/config`)

```
2-col card grid:
  Penalty rate: % input + [Save]
  Coverage ratio: % input + [Save]
  Aging thresholds: 30 / 60 / 90 day inputs + [Save]
```

### 6.7 Reports Dashboard (`/reports`)

```
PageHeader: "Management Reports" + generated timestamp + [Refresh]

KPI row (4 cards):
  Pipeline Applications | Active Loans | Portfolio Outstanding | Posted Collections

Charts row (2 across):
  LEFT: Pipeline by stage — horizontal bar chart (Recharts)
    Each bar = one status, colored by stage grouping
  RIGHT: Aging buckets — donut chart
    Slices: Current / 1-30 / 31-60 / 61-90 / 91+

Income card:
  Posted payments (large success-700)
  Penalties collected
  Payment count
  Monthly sparkline (Recharts mini LineChart)

Collection Performance card:
  DCRs submitted vs reconciled: inline progress bar
  Pending proofs count
  Posted payments count

TAT table:
  Step name | Avg days | Trend (↑/↓ arrow) | Sample count
  Warning row (>5 days), Danger row (>10 days) background tints
```

### 6.8 Borrower Dashboard (`/borrower`)

```
Welcome banner: "Good morning, [First Name]" (4xl/700/neutral-900)
Borrower number: monospace pill (primary-100 bg)

Application status card (prominent, colored by status):
  Large status badge + label
  Blocker message below in warning/danger highlight card

Status timeline: full-width horizontal stepper

Action row: [View Documents] [Edit Profile] [Apply for Reloan]

If loan_active:
  Loan summary card: outstanding balance + next due date + monthly amount
```

### 6.9 Application Detail (`/borrower/applications/[id]`)

```
Top: Status + blocker sticky card
Section: Document checklist (upload + sign each doc)
ComputationSign panel (when computation available)
ReleaseDocSign panel (during LRA signing stage)
BriefingSign panel (before release)
LoanActivePanel (when loan_active or closed)
```

### 6.10 CSA Queue (`/csa`)

```
KPI bar: Total | Pending NCL | Awaiting Endorsement | On Hold
Filter pills: All | For Intake | On Hold
Search bar
Queue cards list (left border = status color)
```

### 6.11 CSA Application Workspace (`/csa/applications/[id]`)

```
Status timeline full-width card at top

Two-column below:
LEFT:
  Borrower profile (editable form)
  NCL check card (Pass / Fail + notes)
  Document checklist (intake stage)

RIGHT:
  Computation panel (full)
  Negotiation panel (when status = approved/negotiating)
  Endorse to CIG card:
    Readiness checklist (checkmarks per requirement)
    [Endorse to CIG] (disabled until ready)
  Hold reason card (collapsed by default)
```

### 6.12 CIG Application Workspace (`/cig/applications/[id]`)

```
Tabbed layout:
  Borrower Info | Verification | Checks | Documents | Computation (read-only)

Verification tab: large sectioned form
  Field completeness → PIC interview → Crewing manager → References → Finding

Checks tab: each of 5 checks with Pass/Fail + proof upload + who + timestamp

Callback section: schedule datetime + notes
```

### 6.13 Committee Application Workspace (`/committee/applications/[id]`)

```
Tabs: Application | Computation | CIG Findings | Votes | Actions

Votes tab:
  Tally display (large, bold, colored):
    Approve: 2/3  |  Deny: 1
  Vote list: voter + vote + timestamp
  [Cast my vote: Approve] [Deny] buttons

Actions tab (separated from votes):
  Final action: [Approve] [Deny] [Notice to Revisit] [Hold]
  Revisit: target selector (CSA/CIG) + required comment
  TAT counter: "X days since CIG handoff" (warning at 5+, danger at 10+)
```

### 6.14 LRA Application Workspace (`/lra/applications/[id]`)

```
BLRI preview card at top
Borrower blocker status card (always visible)

Step progress bar:
  Path → PDC → Generate → Signing → Briefing → Release → Close
  Active step: primary-600, completed: checkmark

Step cards (show/hide based on current step):
  Path selection: With PDC / Without PDC radio cards (large, icon + description)
  PDC encoding: mini-table form
  Generate docs: list with [Generate] button
  Signing status: real-time per document
  Briefing gate: waiting / signed indicator
  Release: [Record release] button (disabled until briefing)
  Close: upload signed voucher + [Close & transmit]
```

### 6.15 AR Masterlist (`/ar`)

```
KPI bar: Total accounts | Active | 91+ overdue | Outstanding (₱)
Filter bar: Search | Portfolio | Aging | Status
Masterlist table (sortable columns)
Incoming queue card (top, if pending)
```

### 6.16 AR DCR (`/ar/dcr`)

```
PageHeader: "DCR Reconciliation"
Subtitle: "Match bank deposits — the only path to Paid"

DCR cards:
  Submitted by + date
  Payment list with amounts
  Deposit reference # input
  [Reconcile & Post] button
```

### 6.17 Collector Dashboard (`/collector`)

```
KPI bar: Assigned accounts | Due this month | Pending proofs | DCR drafts
Accounts list (aging sort, 91+ rows tinted danger-50)
Pending payment proofs section ([Confirm] / [Reject])
DCR builder: [Start DCR] → select payments → preview → [Submit to AR]
```

### 6.18 Remedial Dashboard (`/remedial`)

```
Same structure as Collector
Red-900 navbar accent
Only turned-over accounts visible
```

### 6.19 Agent Portal (`/agent`)

```
Leads list: name | status | doc completion % progress bar | created
[+ New lead] button
Lead detail: borrower info read-only + checklist (flagsOnly mode)
```

---

## 7. Charts & Data Visualization

Install: `npm install recharts`

```
Chart types:
  Horizontal bar:  Pipeline by stage, collection performance
  Donut:           Aging buckets, portfolio distribution
  Line:            Monthly income trend
  Sparkline:       KPI trend (mini LineChart, last 6 periods, no axes)
  Progress bar:    DCR reconciliation rate, checklist completion

Chart colors (series order):
  1. primary-500  (#3B82F6)
  2. success-500  (#22C55E)
  3. warning-500  (#F59E0B)
  4. danger-500   (#EF4444)
  5. info-500     (#0EA5E9)
  6. violet-500   (#8B5CF6)

Recharts config:
  ResponsiveContainer: always wrap
  Tooltip: white bg, shadow-md, radius-md, border neutral-200, ₱ formatting
  Grid lines: neutral-100, thin dashed
  Smooth curves: type="monotone" on LineChart
  Custom legend below chart
```

---

## 8. Micro-interactions & Animations

```
Button press:       transform scale(0.97) 100ms
Card hover:         shadow-sm → shadow-md 150ms ease
Modal open:         opacity 0→1 + scale 0.95→1.0 200ms
Modal close:        opacity 1→0 + scale 1.0→0.95 150ms
Toast appear:       translateX(100%) → 0 200ms ease-out
Toast dismiss:      translateX(0) → 100% 150ms
Spinner:            360° rotation 1s linear infinite
Progress bar fill:  0 → value on mount, 600ms ease-out
Status badge:       color cross-fade 200ms
Sidebar item:       bg color 150ms
Tab underline:      translateX between tabs 200ms
Skeleton shimmer:   gradient sweep L→R, 1.5s infinite
```

---

## 9. Responsive Breakpoints

```
sm:  640px  — 1-col → 2-col transition
md:  768px  — tablet, top nav collapses to hamburger
lg:  1024px — 2-col → 3-col, sidebar visible
xl:  1280px — full dashboard width

Mobile (<640px):
  Single column
  Stacked cards
  Bottom sticky action bar on detail pages
  Swipeable tabs
  Accordion sections for long forms
  Borrower portal primary mobile target

Staff portals: functional on tablet, optimized for desktop
```

---

## 10. Accessibility

```
Focus rings:     2px primary-500, 2px offset — all interactive elements
Contrast:        WCAG AA minimum (4.5:1 text, 3:1 UI)
Skip link:       #main-content skip-to-content at top
ARIA:
  icon-only buttons: aria-label required
  form errors: aria-describedby linking to error element
  live regions: aria-live="polite" for loading/result
  tables: <th scope="col"> on all headers
  modals: focus trap + aria-modal="true" + Escape to close
  steppers: aria-current="step" on active step
```

---

## 11. Lucide React Icon Map

Install: `npm install lucide-react`

```
Application/workflow:
  FileText        — documents, applications
  ClipboardCheck  — checklists
  CheckCircle     — confirmed/approved/signed
  XCircle         — denied/rejected
  Clock           — pending, TAT, callbacks
  AlertTriangle   — warnings, holds, blockers
  Info            — info alerts

Navigation:
  LayoutDashboard — admin dashboard
  Users           — users management
  Shield          — roles / permissions
  Settings        — config
  BarChart2       — reports
  FileCheck       — audit log
  Mail            — email test
  ChevronRight    — breadcrumb, queue open
  ChevronLeft     — back button
  ChevronDown/Up  — accordion, expand

Actions:
  Plus            — create/add
  Pencil          — edit
  Trash2          — delete
  Download        — export/download
  Upload          — file upload
  RefreshCw       — refresh/reload
  LogOut          — sign out
  Eye             — view
  EyeOff          — hide

Finance/loans:
  DollarSign      — amounts (use ₱ text for currency symbol)
  TrendingUp      — positive trend
  TrendingDown    — negative trend/overdue
  Wallet          — payment/collection
  CreditCard      — PDC/ATM
  Building2       — portfolio/investor
  Star            — LoanStar logo icon

Status:
  Circle          — pending dot
  CheckCircle2    — confirmed/done
  AlertCircle     — error
  Bell            — notification
  Lock            — finalized/locked
  Unlock          — editable

Communication:
  MessageSquare   — notes/comments
  Phone           — contact log
  Send            — submit/send
```

---

## 12. Implementation Order for Claude Code

Follow this exact order to avoid dependency issues:

1. **Install dependencies**
   ```bash
   npm install recharts lucide-react
   npm install @types/recharts --save-dev
   ```

2. **Update `src/app/globals.css`**
   - Add all CSS custom properties (colors, fonts)
   - Import Inter and JetBrains Mono from Google Fonts

3. **Rebuild `src/components/admin/ui.tsx`**
   - Button (all variants + sizes + loading state)
   - Input, Textarea, Select, Label
   - Card (base + stat + queue + highlight variants)
   - Alert (all variants + icon)
   - Spinner (ring animation)
   - Table, Th, Td
   - PageHeader
   - Badge (status, aging, permission)
   - Modal (base component)
   - Toast system

4. **Update portal nav components**
   - `src/components/admin/Sidebar.tsx` — dark sidebar with icon nav
   - All `src/components/portal/*Nav.tsx` — role-accent navbars

5. **Update shared components**
   - `StatusTimeline` — polished stepper
   - `DocumentChecklist` — styled rows
   - `SignatureConfirm` — styled card + modal
   - `csa/ComputationPanel` — tabbed mode selector + results table
   - `csa/NegotiationPanel`
   - `borrower/LoanActivePanel` — schedule table + payment form
   - `borrower/ComputationSign`, `BriefingSign`, `ReleaseDocSign`

6. **Auth pages:** login, register, forgot-password, reset-password

7. **Admin pages:** dashboard, users, roles, config, loan-types, checklists, checks, audit, email-test

8. **Reports page:** `/reports` with Recharts

9. **Borrower pages:** dashboard, profile, application detail

10. **Staff portals in workflow order:** CSA → CIG → Committee → LRA → AR → Collector → Remedial → Agent

---

## 13. What NOT to Change

```
DO NOT modify:
  - src/lib/**          — all business logic, services, permissions
  - src/app/api/**      — all API routes
  - src/hooks/**        — usePermissions hook
  - src/middleware.ts   — route guards
  - supabase/**         — migrations and config
  - package.json scripts, tsconfig, next.config

ONLY modify:
  - src/app/globals.css
  - src/components/**
  - src/app/**/page.tsx  (layout only, no logic changes)
  - src/app/**/layout.tsx
```
