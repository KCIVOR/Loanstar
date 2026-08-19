# Questions for the client — SME (Sole Prop / Partnership) + Individual + Collateral

Updated 2026-08-19 — all substantive questions resolved directly by the user. Nothing left that requires the client.

---

## Remaining (courtesy only, not blocking)

1. Confirming — Seafarer loans never get collateral (Car Refi / Real Estate), correct? Already confirmed "no" directly by the user; kept here only as a nice-to-have double-check with the client if it ever comes up.

---

## Standing item — not a question, but not fully closed either

**Deed of Chattel Mortgage and REM Mortgage/Annotation release documents are being built with demo/placeholder legal content**, not the client's real, legal-reviewed wording — by explicit decision, to prioritize finishing the end-to-end flow. Before any real Car Refinancing or Real Estate loan is released to a real borrower, these must be swapped for the actual approved documents. Track this separately; don't let it get lost once the flow works end-to-end with placeholder content.

---

## Already resolved — no need to ask, kept here for the record

- ~~Business/Individual linking model~~ — one application record with a Business form section and an Individual/representative form section (not two separate records). CIG and Committee make one decision per application, same as the Seafarer flow.
- ~~Can the same individual be linked to more than one business?~~ — yes.
- ~~Are collateral extra documents additive or a replacement?~~ — additive.
- ~~Individual clean-loan list numbering gap~~ — intentional.
- ~~Individual + Real Estate being a distinct list rather than clean+extras~~ — intentional.
- ~~Are checklist documents required or optional?~~ — all optional for SME and Individual, matching Seafarer's baseline.
- ~~Does collateral change who approves (committee size)?~~ — no.
- ~~Who performs the vehicle/property collateral inspection?~~ — CIG, via the CI report form, same team as SME's field visit — no new role.
- ~~Individual applications' field verification~~ — same phone/reference approach as Seafarer, not an in-person field visit.
- ~~CM/REM Inspection form fields~~ — extracted from the real workbook; full breakdown in `docs/sme-collateral-ci-form-extraction.md`.
- ~~Individual loan interest/PF/fee rates~~ — same calculator as SME (`computeSmeLoan`), already verified against 35 real historical loans.
- ~~Individual loan minimum/maximum amount~~ — no cap.
- ~~Individual + owned business, deeper info needed?~~ — no. Just show the Business Permit as one more optional upload slot on the checklist — no extra data collection, no conditional sub-form.
- ~~Car Refinancing rate/fee structure~~ — same calculator as SME/Individual, no extra fee.
- ~~Car Refinancing max loan-to-value~~ — no cap.
- ~~Real Estate rate/fee structure~~ — same calculator, no extra fee.
- ~~Real Estate max loan-to-value~~ — no cap.
