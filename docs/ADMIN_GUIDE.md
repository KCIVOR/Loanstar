# LoanStar Admin Guide

## Roles and access

Default roles are seeded in Phase 1. Super Admin manages custom roles at **Admin → Roles**.

| Role | Primary portal | Module access |
|---|---|---|
| Borrower | `/borrower` | Self-service, documents, payments |
| Agent | `/agent` | Leads (checklist flags only) |
| CSA | `/csa` | Intake, computation, negotiation |
| CIG | `/cig` | Verification (computation read-only) |
| Committee | `/committee` | Voting and final actions |
| LRA | `/lra` | Release documentation |
| AR | `/ar` | Masterlist, DCR reconciliation |
| Collector | `/collector` | Assigned accounts, DCR |
| Remedial | `/remedial` | Turned-over accounts |
| Super Admin | `/admin` | Full config + audit |

Users may hold **multiple roles** (e.g. same person as CSA + LRA).

## Account vs application profile

- **Account** (`/account`, header → Account / Settings) — login identity for every role: display name, account phone, avatar, notification preferences, in-app inbox. Stored on `profiles` (+ Auth metadata for display name).
- **Application profile** (`/borrower/profile`) — borrower SF / KYC form on the `borrowers` table (loan file data). CSA may also edit this during intake. Do **not** treat these as the same screen.

Self-service account edits write audit events under module slug `account_settings`. Avatar uploads are rate-limited (5 per 10 minutes).

## System configuration

**Admin → Config**

- **Penalty rate** — used for missed-payment penalties (config-driven, not hardcoded)
- **Coverage ratio** — default 35% warning threshold
- **Aging thresholds** — 30/60/90 day buckets

**Admin → Loan Types** — enroll new rate rows; inactive types cannot be selected (G2 guard blocks pf_rate below ~7.354%).

**Admin → Checklists** — add/remove required documents per stage without code changes.

**Admin → Checks** — CSA/CIG check type mappings (NCL, NFIS, etc.).

## Rate enrollment

1. Open **Loan Types**
2. Add new row with effectivity date; existing computations keep historical snapshots
3. Verify selectable list in CSA computation panel

## Reports

**Reports → Executive dashboard** (`/reports`) — pipeline, aging, income, collection performance, TAT.

Requires `reports` module view permission (Super Admin, AR by default).

## Audit

All workflow triggers write to **Admin → Audit**. Use for compliance review and debugging gate failures.
