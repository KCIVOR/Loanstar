# Change Label — reproduction and source audit

Date: 2026-11-24 (Asia/Manila). Report: `04418785-25c2-4cd5-bb4e-68230aa46f42`.

## Finding

**Reproduced in CSA, Committee and LRA.** Their Input mode dropdown contains **Net sarado** rather than the requested **Net Desired**. Classify this as a confirmed low-severity UI terminology change/request. The observation does not demonstrate incorrect arithmetic or a failed calculation.

The production report and its original attachment request a display-label change. The attachment shows the same DIRECT / Input mode dropdown reproduced below. Report status remains open; no fix was implemented.

## Environment and method

- Browser: Ego Lite, through ego-browser CLI; task space 1, closed after evidence capture.
- App: `http://localhost:3000`, existing Next.js process from the root Loanstar checkout.
- Git: `staging`, HEAD `ff4be77`; existing uncommitted changes preserved.
- Effective development Supabase URL verified using `@next/env`: `ddsvqjaknuniekygpbdr.supabase.co` (staging).
- Authentication: actual Quick Login buttons for CSA, Committee and LRA; role names confirmed in the page headers.
- No Compute/Recalculate, save, approval, release or workflow-transition action was performed. Committee and LRA mode selections were changed only in the unsaved form to make the existing option visible in screenshots. Existing result cards and the PRINCIPAL subtitle continue to describe the saved computation, not the unsaved mode selection.
- Login/logout can create normal authentication/activity records. No loan or production data was changed.
- This is local staging browser evidence. The production deployment was not exercised. The local `origin/main` source also contains the old label, but that does not independently prove deployed production behavior.

## Role reproduction

| Role / quick login | Existing staging application | Action and actual result | Evidence |
|---|---|---|---|
| CSA / csa@loanstar.local | AN300010; `f4750d6e-5c83-4891-9bcf-4234f1255455`; Seafarer | Open intake queue → application → Computation. DIRECT loan type, no saved computation. Input mode defaults to Net sarado. | [CSA screenshot](../output/reports/change-label-audit-2026-11-24/csa.png) |
| Committee / committee@loanstar.local | AN300024; `b6453b9e-460b-4129-ac47-1ab9bd3d1c67`; Seafarer; For Approval | Open voting queue → Review → Adjust amount before deciding. Saved input mode is PRINCIPAL; dropdown includes Net sarado. Select it without recalculating to capture label. | [Committee screenshot](../output/reports/change-label-audit-2026-11-24/committee.png) |
| LRA / lra@loanstar.local | AN300023; `36383139-36fd-437b-ab35-a33de6797ae3`; Seafarer; Release — Signing Documents | Open release queue → application → Calculator. Saved mode is PRINCIPAL; dropdown includes Net sarado. Select it without recalculating to capture label. | [LRA screenshot](../output/reports/change-label-audit-2026-11-24/lra.png) |

In all three browser inspections, the options and internal values were:

| Display text | Internal value |
|---|---|
| Net sarado | `NET_SARADO` |
| Net less security | `NET_LESS_SECURITY` |
| Principal | `PRINCIPAL` |

Expected output: the first display text becomes **Net Desired**, retaining the same calculation mode and saved-data compatibility.

## Source audit and affected surfaces

| Surface | Evidence / conclusion | Verification level |
|---|---|---|
| CSA calculator | `src/app/csa/applications/[id]/page.tsx` mounts shared ComputationPanel (around line 1377). | Source + browser |
| Committee calculator | `src/app/committee/applications/[id]/page.tsx` mounts the same component (around line 2300). | Source + browser |
| LRA recomputation | `src/components/lra/LraCalculatorCard.tsx:161` mounts ComputationPanel with mode lra. LRA application page shows it only for an existing release file that is not released/closed. | Source + browser on an unreleased file |
| Input-mode dropdown | `src/components/csa/ComputationPanel.tsx:1677` hardcodes `<option value="NET_SARADO">Net sarado</option>`. | Source + browser |
| How this was computed | The same file has INPUT_MODE_LABEL at line 222, old text at line 223, used in buildComputationSteps around line 252. | Source only for NET_SARADO explanation; no recompute executed |
| Full breakdown tool | The same mapping feeds full-breakdown data around lines 360 and 391; `src/app/tools/computation-breakdown/page.tsx` consumes the shared breakdown export. | Source only; tool not opened during reproduction |
| Other segments / loan types | Input mode markup is unconditional within the shared form; it is outside segment-specific interest/schedule controls. This implies the same label wherever this form renders, including SME and Individual. | Source inference; separate segment/loan-type combinations not browser-tested |
| CIG | Application page explicitly says computation details are not shown to CIG (`src/app/cig/applications/[id]/page.tsx:1162`). No shared calculator mount found. | Source only |
| Borrower | Application details use ComputationSign and a computation summary; no shared editable input-mode calculator mount found. | Source only |
| Agent / AR | No shared ComputationPanel/LraCalculatorCard mount found in these role pages. | Source only |
| Collector / Remedial | DCR pages use computeCollectorDiscount for a separate discount calculation; they do not mount this loan input-mode calculator. | Source only |

Root cause of the wording discrepancy: two display definitions retain the legacy text in the shared component (dropdown text and label mapping). This is not evidence of a Supabase field or arithmetic defect. Internal enum/API values `NET_SARADO` are used in computation types, SF logic, and CSA/Committee/LRA request validation; renaming that identifier is unnecessary for the requested display change.

No standalone alternative editable loan input-mode calculator was found in the source search. The other-role conclusions above are source-audit findings, not claims that every role was logged into or every route was visually tested.

## Execution observations

The CSA quick-login button automatically initiated sign-in; an additional Sign In click was disabled while login was pending. The token request returned HTTP 200 and reloading allowed the authenticated role page to load. No credentials were changed.

Committee initial navigation exceeded a 15-second timeout and loaded with a longer navigation allowance. LRA initially showed Application not found; after reload it spent a prolonged period loading before the existing application and calculator appeared. These observations are separate from the label finding; their causes were not established, and they are not evidence that the application record was missing.

## Checklist and stopping point

- [x] Review original report wording and attachment.
- [x] Verify local staging database target and checkout.
- [x] Reproduce through CSA quick login and capture screenshot.
- [x] Reproduce through Committee quick login and capture screenshot.
- [x] Reproduce through LRA quick login and capture screenshot.
- [x] Audit shared component, display mapping, other role entry points and internal mode values.
- [x] Visually inspect all three captured screenshots.
- [ ] Implement requested label change (not part of this reproduction audit).
- [ ] Verify dropdown and explanation/full-breakdown text after implementation.
- [ ] Retest saved mode restoration and confirm arithmetic/payload compatibility after implementation.
- [ ] Promote reviewed changes or close the production report (separate authorization/work).

Goal reached for this audit: establish whether report 3 is reproducible and its scope. It is reproducible across all three named calculators. No implementation was started.
