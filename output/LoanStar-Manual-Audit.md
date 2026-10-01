# LoanStar User Manual Audit

Audit date: October 1, 2026

## Scope and method

This audit compared the manual source (`loanstar-user-manual-content.json`) with the implemented Next.js pages and the specific workflow components used by CSA, Committee, and Collection. Code was treated as the only source of truth. No production workflow was exercised and no claims were inferred from the reference manual.

## Evidence based findings

| Check | Result | Evidence |
|---|---|---|
| Implemented page inventory | 76 routable `page.tsx` screens found | `src/app/**/page.tsx` |
| Manual body | 23 grouped feature sections | `loanstar-user-manual-content.json` |
| Open items retained in appendix | 3 | `needs_clarification` in the manual source |
| Screenshot coverage | 0 real images; 23 placeholder panels | Generated DOCX structure |
| Visual render review | Not performed | Bundled LibreOffice renderer is unavailable on this host |

## Corrections made during this audit

1. **Committee calculator capability.** The prior manual said the Committee role could not use CSA calculator controls. That was false. The Committee application page renders `ComputationPanel` in `committee` mode and shows the message that an override requires borrower re-signing. The Committee section now describes the conditional override calculator and its re-sign requirement.

2. **Collector discounts and payment waivers.** The prior manual implied that a collector could enter a discount or penalty waiver when recording a payment. The reviewed record-payment screen only displays an existing `discountAmount`; it does not expose a collector-entered discount or penalty-waiver field. The Collector section now describes reviewing existing discounts only.

3. **Move of payment actions.** The Collector section now distinguishes offering a move from recording its surcharge. It also states that a replacement-check action appears only if the moved payment has a held check, and that a move can be used once per loan.

## Certification result

The current manual **cannot be certified as complete or screenshot-ready**. The facts above establish that it is a grouped, code-informed draft, not a feature-by-feature verified manual. In particular:

- The 76 implemented screens have no route-to-section traceability matrix. A grouped heading does not prove that every field, button, state, and role condition beneath it is covered.
- Several independently routable screens are only mentioned inside a broader section, such as collector proofs, briefings and histories; AR history, internal transfers and rounding write-offs; CIG callbacks, denials and history; agent history; admin email templates and email test; and the individual report pages.
- No real screenshots are embedded. The 23 visual panels tell a writer where to add a capture, but they do not show a user where to click.
- The document has not been rendered to page images because the required bundled LibreOffice executable could not be found. Its layout therefore has not received visual QA.
- The three existing clarification items remain unresolved and must not be treated as confirmed behaviour.

## Required work before a complete-manual claim

1. Create a route/action traceability matrix covering all 76 page routes, plus modal and role-gated actions, and place each item either in a dedicated manual section or the clarification appendix.
2. Perform controlled walkthroughs for Borrower, Agent, CSA, CIG, Committee, LRA, Collector, AR, Remedial, and Administrator roles using redacted test data. Verify validation messages and state-dependent buttons, not only static labels.
3. Capture redacted screenshots at each critical click point and embed them with descriptive captions and alt text. Do not use the live session currently observed because it includes borrower-identifying information.
4. Install or provide the approved bundled LibreOffice renderer, render the final DOCX, and inspect every page before release.
