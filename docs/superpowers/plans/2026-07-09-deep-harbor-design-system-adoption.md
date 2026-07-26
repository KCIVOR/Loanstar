# Deep Harbor Design System Adoption — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every LoanStar UI surface use a new shared Deep Harbor library at `src/components/ui/`, delete `src/components/admin/ui.tsx`, and keep `docs/LoanStar Deep Harbor Design System.html` in sync for every shared component (create missing ones when needed).

**Architecture:** Tokens stay in `src/app/globals.css`. Primitives move to focused files under `src/components/ui/` with a barrel `index.ts`. All pages/domain components import from `@/components/ui`. Shell (`AppShell`/`Sidebar`/`Header`) stays under `admin/` but consumes `ui/`. An editable DS source + pack script keep the bundled HTML catalog current.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, existing Deep Harbor tokens in `globals.css`.

**Spec:** `docs/superpowers/specs/2026-07-09-deep-harbor-design-system-adoption.md`

**Verification baseline (no React component test runner in repo):** after each task that touches TS/TSX, run from `loanstar/`:

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors introduced by the change. Run `npm run build` at phase gates (Tasks 6, 12, 16, 20).

**Hard rule for every new/changed shared component:** implement in `src/components/ui/` **and** document in the Deep Harbor HTML catalog (via editable source + pack script below) in the same task.

---

## File map

| Path | Responsibility |
|------|----------------|
| `src/app/globals.css` | Production Deep Harbor tokens |
| `src/components/ui/*.tsx` | Shared primitives (new) |
| `src/components/ui/index.ts` | Public barrel |
| `src/components/ui/cn.ts` | Tiny `className` join helper |
| `src/components/admin/AppShell.tsx`, `Sidebar.tsx`, `Header.tsx` | Shell (restyle; keep location) |
| `src/components/admin/ui.tsx`, `Badge.tsx` | **Delete after migration** |
| `src/components/dashboard/WidgetTile.tsx` | Stop exporting competing white `KpiCard`; use `ui` or rename |
| `src/components/dashboard/charts/theme.ts` | Chart hex palette aligned to tokens |
| `docs/deep-harbor/catalog.src.html` | Editable design-system catalog source |
| `scripts/pack-design-system.mjs` | Packs catalog → bundled HTML |
| `docs/LoanStar Deep Harbor Design System.html` | Bundled catalog (generated/updated) |
| ~45 consumer files | Import path `@/components/admin/ui` → `@/components/ui` |

---

### Task 1: Design-system catalog tooling (editable source + pack script)

**Files:**
- Create: `loanstar/docs/deep-harbor/catalog.src.html`
- Create: `loanstar/scripts/pack-design-system.mjs`
- Create: `loanstar/scripts/unpack-design-system.mjs`
- Modify: `loanstar/package.json` (add scripts)

- [ ] **Step 1: Add unpack script**

Create `loanstar/scripts/unpack-design-system.mjs`:

```js
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundled = path.join(root, "docs", "LoanStar Deep Harbor Design System.html");
const outDir = path.join(root, "docs", "deep-harbor");
const catalogPath = path.join(outDir, "catalog.src.html");

const html = fs.readFileSync(bundled, "utf8");
const templateMatch = html.match(
  /<script[^>]*type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/
);
if (!templateMatch) throw new Error("No __bundler/template found");

let template = templateMatch[1]
  .replace(/\\u002F/g, "/")
  .replace(/\\\//g, "/")
  .replace(/\\n/g, "\n")
  .replace(/\\t/g, "\t")
  .replace(/\\"/g, '"');

// Drop external UUID script tags that only work inside the bundler runtime
template = template.replace(
  /<script src="[0-9a-f-]{36}"><\/script>\s*/gi,
  ""
);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(catalogPath, template, "utf8");
console.log("Wrote", catalogPath);
```

- [ ] **Step 2: Add pack script (simple standalone catalog publisher)**

The original file is a heavy asset bundle. For maintainability, packing publishes an **openable standalone** Deep Harbor catalog (same filename the team already uses) built from `catalog.src.html`, preserving navy/gold branding and all sections. Create `loanstar/scripts/pack-design-system.mjs`:

```js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "docs", "deep-harbor", "catalog.src.html");
const dest = path.join(root, "docs", "LoanStar Deep Harbor Design System.html");

if (!fs.existsSync(src)) {
  throw new Error("Missing docs/deep-harbor/catalog.src.html — run npm run ds:unpack first");
}

const body = fs.readFileSync(src, "utf8");
// If source is a full HTML document, write through; else wrap
const out = /<!DOCTYPE html>/i.test(body)
  ? body
  : `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8"/>\n<meta name="viewport" content="width=device-width, initial-scale=1"/>\n<title>LoanStar Deep Harbor Design System</title>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

fs.writeFileSync(dest, out, "utf8");
console.log("Packed", dest, `(${out.length} bytes)`);
```

- [ ] **Step 3: Wire npm scripts**

In `loanstar/package.json`, add to `"scripts"`:

```json
"ds:unpack": "node scripts/unpack-design-system.mjs",
"ds:pack": "node scripts/pack-design-system.mjs"
```

- [ ] **Step 4: Unpack once and verify**

Run from `loanstar/`:

```bash
npm run ds:unpack
```

Expected: creates `docs/deep-harbor/catalog.src.html` containing sections like Color, Typography, Buttons.

```bash
npm run ds:pack
```

Expected: rewrites `docs/LoanStar Deep Harbor Design System.html` as openable HTML. Open it in a browser and confirm Deep Harbor content still visible.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/unpack-design-system.mjs scripts/pack-design-system.mjs docs/deep-harbor/catalog.src.html "docs/LoanStar Deep Harbor Design System.html"
git commit -m "$(cat <<'EOF'
chore: add Deep Harbor design system unpack/pack tooling

EOF
)"
```

---

### Task 2: Foundations — token polish + chart theme

**Files:**
- Modify: `loanstar/src/app/globals.css`
- Modify: `loanstar/src/components/dashboard/charts/theme.ts`

- [ ] **Step 1: Add cream-on-navy text token used by DS KPI numbers**

In `globals.css` `:root`, after navy tokens, ensure these exist (add if missing):

```css
  --color-cream: #f4f1e8;
  --color-gold-tint: rgba(217, 168, 85, 0.14);
```

In `@theme inline`, add:

```css
  --color-cream: var(--color-cream);
  --color-gold-tint: var(--color-gold-tint);
```

- [ ] **Step 2: Align chart theme cream/navy border**

In `theme.ts`, ensure palette matches DS (update if any drift):

```ts
/** Deep Harbor chart palette — hex mirrors of the tokens in globals.css.
 * Recharts writes SVG presentation attributes, which cannot resolve CSS var(). */
export const CHART = {
  gold: "#d9a855",
  goldHover: "#e8c078",
  goldDark: "#b3822f",
  navy: "#152c5c",
  navySurface: "#0e2149",
  navyChrome: "#0a1b3d",
  navyMuted: "#9fb0d1",
  cream: "#f4f1e8",
  success: "#4e9f6e",
  danger: "#d9695b",
  warning: "#d6a23b",
  info: "#5b8fd9",
  ink: "#0f2148",
  inkFaint: "#8087a0",
  grid: "#e7e9f0",
} as const;
```

Keep `CATEGORY_COLORS`, `TOOLTIP_STYLE`, `AXIS_TICK` using these keys (update references if renamed).

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/components/dashboard/charts/theme.ts
git commit -m "$(cat <<'EOF'
feat: align Deep Harbor foundation tokens and chart palette

EOF
)"
```

---

### Task 3: Create `ui` helper + barrel scaffold

**Files:**
- Create: `loanstar/src/components/ui/cn.ts`
- Create: `loanstar/src/components/ui/index.ts`

- [ ] **Step 1: Add className helper**

Create `loanstar/src/components/ui/cn.ts`:

```ts
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
```

- [ ] **Step 2: Add empty barrel**

Create `loanstar/src/components/ui/index.ts`:

```ts
export { cn } from "./cn";
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/cn.ts src/components/ui/index.ts
git commit -m "$(cat <<'EOF'
feat: scaffold Deep Harbor ui library barrel

EOF
)"
```

---

### Task 4: Port core form + action primitives into `ui/`

**Files:**
- Create: `loanstar/src/components/ui/Button.tsx`
- Create: `loanstar/src/components/ui/Input.tsx`
- Create: `loanstar/src/components/ui/Select.tsx`
- Create: `loanstar/src/components/ui/Textarea.tsx`
- Create: `loanstar/src/components/ui/Label.tsx`
- Modify: `loanstar/src/components/ui/index.ts`
- Modify: `loanstar/docs/deep-harbor/catalog.src.html` (ensure Buttons + Text fields sections match shipped variants)
- Run: `npm run ds:pack`

- [ ] **Step 1: Implement Button**

Create `loanstar/src/components/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

const variants = {
  primary:
    "bg-gradient-to-br from-gold-300 to-gold-400 text-navy-900 shadow-[0_4px_14px_rgba(217,168,85,0.3)] hover:from-gold-300 hover:to-gold-300",
  secondary:
    "border border-gold-400/40 bg-gold-400/10 text-gold-600 hover:bg-gold-400/16",
  outline:
    "border border-neutral-300 bg-transparent text-ink hover:bg-neutral-50",
  ghost: "text-ink-muted hover:bg-neutral-100",
  danger: "bg-danger text-white hover:opacity-90",
  success: "bg-success text-white hover:opacity-90",
} as const;

const sizes = {
  sm: "h-8 rounded-md px-3.5 text-xs",
  md: "h-10 rounded-lg px-5 text-sm",
  lg: "h-12 rounded-lg px-7 text-[15px]",
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
  children?: ReactNode;
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-bold tracking-[0.01em] transition-all duration-150",
        "disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 disabled:shadow-none disabled:hover:bg-neutral-100",
        sizes[size],
        variants[variant],
        className
      )}
      {...props}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-navy-900/35 border-t-navy-900" />
      ) : null}
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Implement Input, Select, Textarea, Label**

Create `loanstar/src/components/ui/Input.tsx`:

```tsx
import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

const field =
  "h-10 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-3.5 text-sm text-ink placeholder:text-ink-faint focus:border-gold-400 focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-gold-400/20 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:bg-neutral-100 disabled:text-neutral-400";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, "bg-[#FBFBFD] focus:bg-white", className)} {...props} />;
}
```

Create `loanstar/src/components/ui/Select.tsx`:

```tsx
import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-lg border border-neutral-300 bg-[#FBFBFD] px-3.5 text-sm text-ink focus:border-gold-400 focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-gold-400/20 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:bg-neutral-100 disabled:text-neutral-400",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
```

Create `loanstar/src/components/ui/Textarea.tsx`:

```tsx
import type { TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

export function Textarea({
  className = "",
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={cn(
        "w-full rounded-lg border border-neutral-300 bg-[#FBFBFD] px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-gold-400 focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-gold-400/20 disabled:cursor-not-allowed disabled:border-neutral-100 disabled:bg-neutral-100 disabled:text-neutral-400",
        className
      )}
      {...props}
    />
  );
}
```

Create `loanstar/src/components/ui/Label.tsx`:

```tsx
import type { LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export function Label({
  children,
  className = "",
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { children: ReactNode }) {
  return (
    <label
      className={cn("mb-1.5 block text-[13px] font-medium text-ink-muted", className)}
      {...props}
    >
      {children}
    </label>
  );
}
```

- [ ] **Step 3: Export from barrel**

Update `index.ts`:

```ts
export { cn } from "./cn";
export { Button } from "./Button";
export type { ButtonProps } from "./Button";
export { Input } from "./Input";
export { Select } from "./Select";
export { Textarea } from "./Textarea";
export { Label } from "./Label";
```

- [ ] **Step 4: Catalog note**

In `docs/deep-harbor/catalog.src.html`, confirm the Buttons section lists Primary / Secondary / Outline / Ghost / Danger / Success and sizes. If a variant is missing from the HTML, add a small demo row matching the component API. Then:

```bash
npm run ds:pack
```

- [ ] **Step 5: Verify + commit**

```bash
npx tsc --noEmit
git add src/components/ui docs/deep-harbor/catalog.src.html "docs/LoanStar Deep Harbor Design System.html"
git commit -m "$(cat <<'EOF'
feat(ui): add Deep Harbor Button and form field primitives

EOF
)"
```

---

### Task 5: Port Card, KpiCard, PageHeader, Badge, Alert

**Files:**
- Create: `loanstar/src/components/ui/Card.tsx`
- Create: `loanstar/src/components/ui/KpiCard.tsx`
- Create: `loanstar/src/components/ui/PageHeader.tsx`
- Create: `loanstar/src/components/ui/Badge.tsx`
- Create: `loanstar/src/components/ui/Alert.tsx`
- Modify: `loanstar/src/components/ui/index.ts`
- Modify: catalog + `npm run ds:pack`

- [ ] **Step 1: Card + KpiCard**

Create `Card.tsx` (port from `admin/ui.tsx` Card, use `cn`). Create `KpiCard.tsx` replacing hardcoded hex with tokens:

```tsx
import type { ReactNode } from "react";
import { cn } from "./cn";

export function KpiCard({
  label,
  value,
  hint,
  highlight = false,
  alert = false,
  className = "",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  highlight?: boolean;
  alert?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-[18px] py-4",
        alert
          ? "border-navy-border bg-gradient-to-br from-[#1B3B74] to-navy-800"
          : "border-navy-border bg-navy-800",
        className
      )}
    >
      <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-navy-subtle">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 font-mono text-[26px] leading-none",
          highlight ? "text-gold-300" : alert ? "text-[#E9948A]" : "text-cream"
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-navy-subtle">{hint}</p> : null}
    </div>
  );
}
```

Port `Card` variants exactly from current `admin/ui.tsx`.

- [ ] **Step 2: PageHeader, Badge, StatusBadge, Alert**

Port `PageHeader` and `Alert` from `admin/ui.tsx`. Port `Badge` + `StatusBadge` from `admin/Badge.tsx` into `ui/Badge.tsx`.

- [ ] **Step 3: Barrel exports**

```ts
export { Card } from "./Card";
export { KpiCard } from "./KpiCard";
export { PageHeader } from "./PageHeader";
export { Badge, StatusBadge } from "./Badge";
export { Alert } from "./Alert";
```

- [ ] **Step 4: Catalog + pack + verify + commit**

Ensure Cards & KPIs / Badges / Alerts sections exist in catalog; pack; `npx tsc --noEmit`; commit:

```bash
git commit -m "$(cat <<'EOF'
feat(ui): add Card, KpiCard, PageHeader, Badge, Alert

EOF
)"
```

---

### Task 6: Port Modal, ConfirmDialog, Spinner, Table, SegmentedControl

**Files:**
- Create: `loanstar/src/components/ui/Modal.tsx`
- Create: `loanstar/src/components/ui/ConfirmDialog.tsx`
- Create: `loanstar/src/components/ui/Spinner.tsx`
- Create: `loanstar/src/components/ui/Table.tsx`
- Create: `loanstar/src/components/ui/SegmentedControl.tsx`
- Modify: `loanstar/src/components/ui/index.ts`
- Catalog + pack

- [ ] **Step 1: Port components**

Copy behavior from `admin/ui.tsx`:
- `Modal`, `ConfirmDialog` (ConfirmDialog imports `Button` from `./Button`)
- `Spinner` — extend API to optional `size?: "sm" | "md" | "lg"` and `label?: string` (default `"Loading…"`) to match DS
- `Table`, `Th`, `Td`
- `SegmentedControl`

Example Spinner upgrade:

```tsx
import { cn } from "./cn";

export function Spinner({
  size = "md",
  label = "Loading…",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}) {
  const dim = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-7 w-7" : "h-5 w-5";
  return (
    <div className={cn("flex items-center justify-center gap-2.5 py-12 text-sm text-ink-muted", className)}>
      <span
        className={cn(
          "animate-spin rounded-full border-2 border-gold-400/20 border-t-gold-400",
          dim
        )}
      />
      {label}
    </div>
  );
}
```

- [ ] **Step 2: Barrel + phase gate build**

Export all from `index.ts`. Run:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: build succeeds (old `admin/ui` still present; new `ui` unused yet is fine).

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(ui): add Modal, ConfirmDialog, Spinner, Table, SegmentedControl

EOF
)"
```

---

### Task 7: Extended choices — Checkbox, Radio, Toggle, Chip

**Files:**
- Create: `loanstar/src/components/ui/Checkbox.tsx`
- Create: `loanstar/src/components/ui/Radio.tsx`
- Create: `loanstar/src/components/ui/Toggle.tsx`
- Create: `loanstar/src/components/ui/Chip.tsx`
- Modify: barrel + catalog sections “Selects & choices” + pack

- [ ] **Step 1: Implement Checkbox**

```tsx
"use client";

import { cn } from "./cn";

export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  const inputId = id ?? `chk-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 text-sm text-ink",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <input
        id={inputId}
        type="checkbox"
        className="h-4 w-4 rounded border-neutral-300 text-gold-400 focus:ring-gold-400/30"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
```

- [ ] **Step 2: Implement Radio, Toggle, Chip**

`Radio`: group via shared `name`, gold accent when selected.  
`Toggle`: button `role="switch"` with navy track / gold when on.  
`Chip`: pill multi-select; selected = gold fill + navy text; unselected = outline.

Match visuals in Deep Harbor “Selects & choices” section. Export from barrel.

- [ ] **Step 3: Document in catalog**

Add/update demos in `catalog.src.html` for Checkbox / Radio / Toggle / Chip if not already accurate. `npm run ds:pack`.

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit
git commit -m "$(cat <<'EOF'
feat(ui): add Checkbox, Radio, Toggle, Chip

EOF
)"
```

---

### Task 8: Extended feedback — Toast, Progress, Skeleton, EmptyState

**Files:**
- Create: `loanstar/src/components/ui/Toast.tsx`
- Create: `loanstar/src/components/ui/Progress.tsx`
- Create: `loanstar/src/components/ui/Skeleton.tsx`
- Create: `loanstar/src/components/ui/EmptyState.tsx`
- Barrel + catalog + pack

- [ ] **Step 1: Toast**

```tsx
"use client";

import { cn } from "./cn";

export function Toast({
  message,
  variant = "success",
  onClose,
}: {
  message: string;
  variant?: "success" | "error";
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-[13px] shadow-md",
        variant === "success"
          ? "border-success/30 bg-white text-success-ink"
          : "border-danger/30 bg-white text-danger-ink"
      )}
      role="status"
    >
      <span>{message}</span>
      {onClose ? (
        <button type="button" aria-label="Dismiss" onClick={onClose} className="text-ink-faint hover:text-ink">
          ✕
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Progress, Skeleton, EmptyState**

- `Progress`: `{ value: number; max?: number; label?: string; tone?: "gold" | "success" | "danger" }` — bar on white; gold fill by default; danger when over 100%.
- `Skeleton`: `{ variant?: "line" | "list-row" | "kpi" }` — pulse placeholders per DS.
- `EmptyState`: `{ title; description?; action?: ReactNode }` — star/mark optional, navy/gold CTA via `Button` slot.

Document each in catalog; pack; tsc; commit:

```bash
git commit -m "$(cat <<'EOF'
feat(ui): add Toast, Progress, Skeleton, EmptyState

EOF
)"
```

---

### Task 9: Extended navigation chrome — Pagination, Breadcrumbs, Avatar, Tooltip, DropdownMenu

**Files:**
- Create: `loanstar/src/components/ui/Pagination.tsx`
- Create: `loanstar/src/components/ui/Breadcrumbs.tsx`
- Create: `loanstar/src/components/ui/Avatar.tsx`
- Create: `loanstar/src/components/ui/Tooltip.tsx`
- Create: `loanstar/src/components/ui/DropdownMenu.tsx`
- Barrel + catalog + pack

- [ ] **Step 1: Implement**

APIs:

```ts
// Breadcrumbs
{ items: Array<{ label: string; href?: string }> }

// Pagination
{ page: number; pageCount: number; onPageChange: (p: number) => void; summary?: string }

// Avatar
{ initials: string; name?: string; size?: "sm" | "md" | "lg" }

// Tooltip
{ content: string; children: ReactNode }

// DropdownMenu
{ trigger: ReactNode; items: Array<{ label: string; onClick: () => void; danger?: boolean }> }
```

Style from Deep Harbor “Pagination & breadcrumbs”, “Avatars & tooltips”, “Toasts & menus”.

- [ ] **Step 2: Catalog + pack + verify + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(ui): add Pagination, Breadcrumbs, Avatar, Tooltip, DropdownMenu

EOF
)"
```

---

### Task 10: Extended patterns — FileUpload, Accordion, Stepper

**Files:**
- Create: `loanstar/src/components/ui/FileUpload.tsx`
- Create: `loanstar/src/components/ui/Accordion.tsx`
- Create: `loanstar/src/components/ui/Stepper.tsx`
- Barrel + catalog + pack

- [ ] **Step 1: Implement FileUpload dropzone + doc row**

```tsx
"use client";

import { cn } from "./cn";
import { Badge } from "./Badge";

export function FileDropzone({
  hint = "PDF, JPG, PNG, DOC up to 10MB",
  onFiles,
}: {
  hint?: string;
  onFiles?: (files: FileList) => void;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center hover:border-gold-400/50">
      <span className="text-sm font-semibold text-ink">Drop file or click to upload</span>
      <span className="mt-1 text-xs text-ink-faint">{hint}</span>
      <input
        type="file"
        className="sr-only"
        onChange={(e) => e.target.files && onFiles?.(e.target.files)}
      />
    </label>
  );
}

export function DocumentRow({
  title,
  status,
}: {
  title: string;
  status: "confirmed" | "uploaded" | "missing";
}) {
  const variant =
    status === "confirmed" ? "success" : status === "uploaded" ? "info" : "neutral";
  const label =
    status === "confirmed" ? "Confirmed" : status === "uploaded" ? "Uploaded" : "Upload";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <span className="text-sm text-ink">{title}</span>
      <Badge variant={variant}>{label}</Badge>
    </div>
  );
}
```

- [ ] **Step 2: Accordion + Stepper**

- `Accordion`: list of `{ id, title, meta?, children }` with open state.
- `Stepper`: `{ steps: Array<{ label: string; description?: string; state: "done" | "current" | "todo" }>; orientation?: "horizontal" | "vertical" }` matching DS timeline/wizard.

- [ ] **Step 3: Catalog + pack + verify + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(ui): add FileUpload, Accordion, Stepper

EOF
)"
```

---

### Task 11: Shell restyle — AppShell, Sidebar, Header

**Files:**
- Modify: `loanstar/src/components/admin/Sidebar.tsx`
- Modify: `loanstar/src/components/admin/Header.tsx`
- Modify: `loanstar/src/components/admin/AppShell.tsx`
- Catalog nav section if shell patterns need a note

- [ ] **Step 1: Audit current shell classes**

Read the three files. Replace hardcoded hex with tokens (`navy-900`, `cream`, `gold-400`) where present. Ensure active nav uses gold/cream emphasis per DS; inactive muted navy text.

- [ ] **Step 2: Prefer `ui` primitives for header actions**

Where Header uses raw `<button>` for primary actions, switch to `import { Button } from "@/components/ui"`.

- [ ] **Step 3: Visual check**

```bash
npm run dev
```

Open `/login` then any authenticated portal; confirm navy sidebar + white main + gold primary controls.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(shell): restyle AppShell, Sidebar, Header for Deep Harbor

EOF
)"
```

---

### Task 12: Migrate all imports from `admin/ui` → `ui`

**Files:** every consumer listed below (replace import path only; keep named imports).

Replace:

```ts
from "@/components/admin/ui"
```

with:

```ts
from "@/components/ui"
```

And:

```ts
from "@/components/admin/Badge"
```

with:

```ts
from "@/components/ui"
```

**Consumer list (must all be updated):**

- `src/app/dashboard/page.tsx`
- `src/app/login/page.tsx`
- `src/app/forgot-password/page.tsx`
- `src/app/reset-password/page.tsx`
- `src/app/reports/page.tsx`
- `src/app/admin/roles/page.tsx`
- `src/app/admin/roles/[id]/page.tsx`
- `src/app/admin/users/page.tsx`
- `src/app/admin/loan-types/page.tsx`
- `src/app/admin/config/page.tsx`
- `src/app/admin/checklists/page.tsx`
- `src/app/admin/checks/page.tsx`
- `src/app/admin/audit/page.tsx`
- `src/app/admin/email-test/page.tsx`
- `src/app/borrower/page.tsx`
- `src/app/borrower/profile/page.tsx`
- `src/app/borrower/register/page.tsx`
- `src/app/borrower/applications/[id]/page.tsx`
- `src/app/borrower/applications/[id]/documents/[docId]/sign/page.tsx`
- `src/app/agent/page.tsx`
- `src/app/agent/leads/new/page.tsx`
- `src/app/agent/leads/[id]/page.tsx`
- `src/app/csa/page.tsx`
- `src/app/csa/applications/new/page.tsx`
- `src/app/csa/applications/[id]/page.tsx`
- `src/app/cig/page.tsx`
- `src/app/cig/applications/[id]/page.tsx`
- `src/app/committee/page.tsx`
- `src/app/committee/applications/[id]/page.tsx`
- `src/app/lra/page.tsx`
- `src/app/lra/applications/[id]/page.tsx`
- `src/app/ar/page.tsx`
- `src/app/ar/dcr/page.tsx`
- `src/app/ar/masterlist/[id]/page.tsx`
- `src/app/collector/page.tsx`
- `src/app/remedial/page.tsx`
- `src/components/DocumentChecklist.tsx`
- `src/components/SignatureConfirm.tsx`
- `src/components/admin/FieldRulesEditor.tsx`
- `src/components/borrower/BriefingSign.tsx`
- `src/components/borrower/ComputationSign.tsx`
- `src/components/borrower/ReleaseDocSign.tsx`
- `src/components/borrower/LoanActivePanel.tsx`
- `src/components/csa/NegotiationPanel.tsx`
- `src/components/csa/ComputationPanel.tsx`

- [ ] **Step 1: Bulk replace imports**

From `loanstar/`:

```bash
# PowerShell-safe: use rg + editor, or run:
rg -l '@/components/admin/ui' src | ForEach-Object { (Get-Content $_) -replace '@/components/admin/ui','@/components/ui' | Set-Content $_ }
rg -l '@/components/admin/Badge' src | ForEach-Object { (Get-Content $_) -replace '@/components/admin/Badge','@/components/ui' | Set-Content $_ }
```

- [ ] **Step 2: Confirm zero old imports**

```bash
rg "components/admin/ui|components/admin/Badge" src
```

Expected: no matches.

- [ ] **Step 3: Phase gate**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor: migrate all portals to @/components/ui

EOF
)"
```

---

### Task 13: Consolidate dashboard KpiCard duplicate

**Files:**
- Modify: `loanstar/src/components/dashboard/WidgetTile.tsx`
- Grep consumers of `WidgetTile`’s `KpiCard`

- [ ] **Step 1: Rename dashboard white KPI**

In `WidgetTile.tsx`, rename export `KpiCard` → `StatCard` (white surface KPI for dashboard modules). Update all imports of `KpiCard` from `WidgetTile` / dashboard registry to `StatCard`.

Keep navy executive KPI as `KpiCard` from `@/components/ui` only (used by reports).

- [ ] **Step 2: Document StatCard in catalog**

Add a short “Stat card (white)” note under Cards & KPIs in `catalog.src.html` if the white variant is part of the product. Pack.

- [ ] **Step 3: Verify + commit**

```bash
rg "KpiCard" src
npx tsc --noEmit
git commit -m "$(cat <<'EOF'
refactor(dashboard): rename white KpiCard to StatCard; keep navy KpiCard in ui

EOF
)"
```

---

### Task 14: Delete old `admin/ui.tsx` and `admin/Badge.tsx`

**Files:**
- Delete: `loanstar/src/components/admin/ui.tsx`
- Delete: `loanstar/src/components/admin/Badge.tsx`

- [ ] **Step 1: Final import guard**

```bash
rg "admin/ui|admin/Badge" src
```

Expected: no matches.

- [ ] **Step 2: Delete files**

```bash
rm src/components/admin/ui.tsx src/components/admin/Badge.tsx
```

- [ ] **Step 3: Build gate**

```bash
npx tsc --noEmit
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore: remove legacy admin/ui and Badge after Deep Harbor migration

EOF
)"
```

---

### Task 15: Domain components restyle on `ui/`

**Files:**
- Modify: `loanstar/src/components/StatusTimeline.tsx`
- Modify: `loanstar/src/components/DocumentChecklist.tsx`
- Modify: `loanstar/src/components/SignatureConfirm.tsx`
- Modify: borrower + csa panels under `src/components/borrower/`, `src/components/csa/`

- [ ] **Step 1: StatusTimeline**

Restyle steps to match DS timeline (done = check on gold/navy, current = numbered gold, todo = muted). Prefer composing `Stepper` from `ui/` if props fit; otherwise keep domain wrapper but share visual classes/tokens.

- [ ] **Step 2: DocumentChecklist + SignatureConfirm**

Replace any raw buttons/alerts with `Button`/`Alert`/`Card`/`Badge`/`FileDropzone`/`DocumentRow` from `ui/`.

- [ ] **Step 3: Borrower/CSA panels**

Same rule: no local primary-button CSS; use `ui/`.

- [ ] **Step 4: If a new shared pattern appears twice, extract to `ui/` + catalog**

Follow gap protocol from the spec.

- [ ] **Step 5: Verify + commit**

```bash
npx tsc --noEmit
git commit -m "$(cat <<'EOF'
feat: restyle domain loan components onto Deep Harbor ui

EOF
)"
```

---

### Task 16: Auth + register page polish

**Files:**
- Modify: `loanstar/src/app/login/page.tsx`
- Modify: `loanstar/src/app/forgot-password/page.tsx`
- Modify: `loanstar/src/app/reset-password/page.tsx`
- Modify: `loanstar/src/app/borrower/register/page.tsx`

- [ ] **Step 1: Align auth layout to Deep Harbor**

Use navy page background (`bg-navy-950` or `bg-navy-900`), white card, gold primary `Button`, `Input`/`Label`/`Alert` from `ui/`. Brand mark/wordmark treatment consistent with shell. Do not invent purple/cream-serif looks.

- [ ] **Step 2: Manual check**

```bash
npm run dev
```

Visit `/login`, `/forgot-password`, `/reset-password`, `/borrower/register`.

- [ ] **Step 3: Build + commit**

```bash
npm run build
git commit -m "$(cat <<'EOF'
feat(auth): apply Deep Harbor auth surfaces

EOF
)"
```

---

### Task 17: Portal page polish — queues & details

**Files:** all portal `page.tsx` files under `admin/`, `agent/`, `csa/`, `cig/`, `committee/`, `lra/`, `ar/`, `collector/`, `remedial/`, `borrower/`, `dashboard/`, `reports/`

- [ ] **Step 1: Sweep for raw controls**

```bash
rg -n "<button|<input|<select|<textarea|<table" src/app src/components --glob "*.tsx"
```

For each hit that is a reusable control, replace with `ui/` equivalent. Keep semantic HTML inside `ui` components themselves.

- [ ] **Step 2: Ensure PageHeader + Card + Table patterns**

Queue pages: `PageHeader` + `Table`/`Card` + `Badge` status. Detail pages: `Card` sections + primary gold action once per view.

- [ ] **Step 3: Reports uses navy `KpiCard`**

Confirm `reports/page.tsx` imports `KpiCard` from `@/components/ui`.

- [ ] **Step 4: Verify + commit**

```bash
npx tsc --noEmit
npm run build
git commit -m "$(cat <<'EOF'
feat: polish all portal pages onto Deep Harbor shared components

EOF
)"
```

---

### Task 18: Gap protocol pass — invent missing components

**Files:** whatever gaps Task 17 found + catalog

- [ ] **Step 1: List gaps**

Any UI still using one-off styles that should be shared → name the component.

- [ ] **Step 2: For each gap**

1. Create `src/components/ui/<Name>.tsx`
2. Export from `index.ts`
3. Add section/demo to `docs/deep-harbor/catalog.src.html`
4. `npm run ds:pack`
5. Replace call sites

- [ ] **Step 3: Commit per component or one batch**

```bash
git commit -m "$(cat <<'EOF'
feat(ui): add missing Deep Harbor components discovered in page polish

EOF
)"
```

---

### Task 19: Final catalog sync audit

**Files:**
- Modify: `loanstar/docs/deep-harbor/catalog.src.html`
- Regenerate: `docs/LoanStar Deep Harbor Design System.html`

- [ ] **Step 1: Diff exports vs catalog**

```bash
rg "^export " src/components/ui/index.ts
```

Every exported component must appear by name in `catalog.src.html`.

- [ ] **Step 2: Pack and spot-check in browser**

```bash
npm run ds:pack
```

Open `docs/LoanStar Deep Harbor Design System.html` — walk Foundations, Components, Patterns, More components.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: sync Deep Harbor HTML catalog with ui library exports

EOF
)"
```

---

### Task 20: Final verification gate

- [ ] **Step 1: Import + delete guards**

```bash
rg "components/admin/ui|components/admin/Badge" src
test ! -f src/components/admin/ui.tsx
test ! -f src/components/admin/Badge.tsx
```

Expected: no matches; files absent.

- [ ] **Step 2: Full CI-equivalent**

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

Expected: all PASS (e2e optional unless env ready: `npm run test:e2e`).

- [ ] **Step 3: Manual smoke**

- `/login` Deep Harbor auth
- One staff queue + detail (e.g. CSA)
- `/reports` navy KPIs + gold numbers
- `/dashboard` StatCards
- Confirm gold only on primary actions / key numbers

- [ ] **Step 4: Final commit if any fixups**

```bash
git commit -m "$(cat <<'EOF'
chore: Deep Harbor adoption final verification fixups

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Tasks |
|------------------|-------|
| New `src/components/ui/` library | 3–10 |
| Tokens / foundations | 2 |
| Port core primitives | 4–6 |
| Extended DS components | 7–10 |
| Shell restyle | 11 |
| Migrate all consumers | 12 |
| Delete old `admin/ui` | 14 |
| Dashboard KpiCard consolidation | 13 |
| Domain restyle | 15 |
| Auth + all portals | 16–17 |
| Gap → create + document | 18 |
| HTML DS sync | 1, 4–10, 19 |
| Full coverage success criteria | 20 |

---

## Execution notes

- Prefer **one task per commit** as written.
- Do not leave `admin/ui.tsx` as a re-export shim after Task 14 — delete it.
- Visual authority is always `docs/deep-harbor/catalog.src.html` → packed HTML; when in doubt, match the catalog, not the old `design/` blue theme kits.
- Windows: HEREDOC commit form may need Git Bash; in PowerShell use `git commit -m "message"` with the same message text.
