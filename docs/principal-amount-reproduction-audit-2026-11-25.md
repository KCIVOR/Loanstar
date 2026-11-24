# Principal amount display — reproduction audit

Date: 2026-11-25 (Asia/Manila). Report ID: `70a15fd6-7f60-4c82-95d5-c8f9700bca14`.

## Result

**Confirmed display omission in all three named calculators on local staging.** The dark results panel goes directly from Monthly amortization to Processing Fee, with no Principal Amount row. This is narrower than saying principal is unavailable anywhere: the white How this was computed section does show Principal, and some other page summaries show it too.

The original report says “No information is available on the principal amount” and requests “Add the principal amount.” Its attached principal amount.jpg shows a highlighted Principal Amount row directly below monthly amortization. Comparing that reference with the reproduced output establishes the missing location. The attachment appears to illustrate the desired arrangement; its origin or whether it was edited is not established.

## Environment and method

- Existing local app: http://localhost:3000, Git branch staging.
- Effective development database verified through @next/env: ddsvqjaknuniekygpbdr.supabase.co (staging).
- Browser: Ego Lite, task space 2; closed after evidence capture.
- Committee used the existing UAT Committee session; CSA and LRA used their Quick Login buttons. Role identities are visible in the screenshot headers.
- Existing saved computations were opened. No Compute, Recalculate, save, approval or release was performed. No application code or loan data changed; login/logout may generate ordinary authentication/activity records.

## Browser evidence

| Role | Application and state | Actual result | Screenshot |
|---|---|---|---|
| CSA | AN300024 / b6453b9e-460b-4129-ac47-1ab9bd3d1c67; Seafarer, DIRECT, PRINCIPAL; For Approval, calculator read-only | White explanation shows Principal PHP 295,000.00. Dark output shows monthly amortization PHP 30,453.83 followed immediately by Processing Fee PHP 17,700.00; principal row absent. | [CSA](../output/reports/principal-amount-audit-2026-11-25/csa-missing-principal.png) |
| Committee | Same AN300024 saved computation; editable adjustment calculator | Dark output likewise lacks principal. Full DOM row inspection confirms it is absent throughout the output panel, not merely outside the viewport. | [Committee](../output/reports/principal-amount-audit-2026-11-25/committee-missing-principal.png) |
| LRA | AN300023 / 36383139-36fd-437b-ab35-a33de6797ae3; Seafarer, DIRECT, PRINCIPAL; Release — Signing Documents | Amount input is 201100 in Principal mode. Dark output shows monthly amortization PHP 51,275.47 followed immediately by Processing Fee PHP 12,066.00; principal row absent throughout the DOM output. | [LRA](../output/reports/principal-amount-audit-2026-11-25/lra-missing-principal.png) |

All three screenshots were visually inspected. The CSA screenshot includes a separate upper loading indicator, but its computation and principal explanation are already rendered; the output rows were independently inspected before and after navigating to the same saved computation. The omission also reproduces on Committee and LRA. No screenshot content was altered.

## Source trace

- `src/components/csa/ComputationPanel.tsx:1533` builds the dark-panel breakdown from computation.lineItems, filtering monthly amortization and expanding other deductions.
- The dark panel around line 2669 renders monthly amortization followed by that breakdown. It has no dedicated principal row.
- `src/lib/csa/computation.ts:257` buildLineItems starts with Processing Fee and includes deductions, net released, interest, total loan and monthly amortization, but no principal item.
- In contrast, ComputationPanel's buildComputationSteps explicitly includes Principal using c.principal around line 255. This accounts for principal appearing in the white explanation while being absent from the dark summary.
- CSA and Committee mount this shared component; LraCalculatorCard wraps it for LRA. The omission is therefore shared, rather than three independent UI implementations.

## Scope and stopping point

Confirmed medium-priority summary display gap relative to the reporter's requested/reference output. No missing database principal or arithmetic defect has been established. Production deployment was not exercised in this audit. SME, Individual, other input modes, fresh compute and recalculation were not separately tested; source sharing alone is not browser proof for those combinations.

- [x] Compare the original report and its stored image.
- [x] Reproduce in CSA, Committee and LRA on existing saved staging computations.
- [x] Capture and visually inspect screenshots.
- [x] Trace why the output omits the principal row while the explanation can display it.
- [ ] Implement a reviewed display fix.
- [ ] Retest existing and newly calculated results, supported input modes, and other loan segments.

Expected output: add a clearly labeled Principal Amount row using the saved computed principal, directly below monthly amortization in the dark results panel, matching the attachment's layout. Do not infer principal from the current unsaved amount input, because that input represents different amounts in different modes.
