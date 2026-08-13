# Hotfix — "Send Notice to Revisit" has no confirmation dialog

**Ground rules:**
- Touch only the files listed under "Files to change." If you find a related spot not listed, stop and flag it rather than editing it.
- Do not rename, refactor, or "clean up" adjacent code you encounter while editing a listed file.
- Do not touch the existing Approve/Deny/Hold `ConfirmDialog` — it already works correctly; this adds a separate, dedicated dialog for Revisit rather than merging into that one.
- Run existing tests after the change; do not delete or weaken a test to make it pass.
- At the end, output a summary: files changed, tests run/result.

## Background (from conversation, decided scope)

User asked for a confirmation step on Committee's final-action buttons, for both Seafarer and SME applications.

## Audit findings (verified 2026-08-15)

- **Approve / Deny / Hold already have confirmation** — `src/app/committee/applications/[id]/page.tsx:1567-1629` wires all three buttons to `setConfirmAction(...)`, which opens an existing `ConfirmDialog` (`:1591-1685`) showing borrower/net-released/CIG-recommendation, requiring a remark for Deny/Hold, and only calling `handleAction(confirmAction)` on explicit confirm. This section is not segment-specific — it's the one shared "Final action" card rendered identically for both Seafarer and SME applications (`data.application.canDecide` gate, no segment branching anywhere in this block), so it already covers both. No change needed here.
- **The actual gap: "Send Notice to Revisit"** (`:1687-1724`, same card, directly below the confirmed actions) is a plain `<form onSubmit={(e) => { e.preventDefault(); void handleAction("revisit"); }}>` — clicking "Send Notice to Revisit" submits immediately with **no confirmation step at all**, despite the card's own intro copy at `:1562-1565` promising *"Final actions are binding and recorded on the file — you will be asked to confirm."* Revisit is exactly as binding as Approve/Deny/Hold (same `handleAction` function, same `committee_actions` write per `src/lib/committee/actions.ts`) but skips the confirmation step entirely.
- `handleAction` (`:382`) already accepts `"revisit"` as a valid action and already knows how to build its payload from `revisitComment`/`revisitRoute` (`:389-390`) — no backend/action-layer change needed, this is purely a missing UI confirmation step.
- Same as Approve/Deny/Hold, this form/section has no segment branching — fixing it once covers Seafarer and SME identically, since it's the same shared code path for both.

## Scope decision

One phase — add a dedicated `ConfirmDialog` for Revisit, mirroring the existing pattern already proven twice on this same page (the decision dialog and the "Resend decision email?" dialog at `:1792`), without touching the already-correct Approve/Deny/Hold dialog.

---

## Phase 1 — Add a confirmation dialog before sending a Notice to Revisit

**Goal:** Clicking "Send Notice to Revisit" opens a confirmation dialog summarizing the route and remarks before actually submitting — matching the "you will be asked to confirm" promise already printed on this card, and matching how Approve/Deny/Hold already behave.

### Files to change

1. **`src/app/committee/applications/[id]/page.tsx`**
   - Add `const [confirmRevisit, setConfirmRevisit] = useState(false);` near the existing `confirmAction`/`revisitComment`/`revisitRoute` state (`:306-308` region).
   - Change the "Notice to Revisit" `<form>`'s `onSubmit` (`:1689-1692`) from directly calling `handleAction("revisit")` to instead `e.preventDefault(); setConfirmRevisit(true);` — this opens the new dialog instead of submitting. Keep the "Send Notice to Revisit" button as `type="submit"` and keep its existing `disabled={!revisitComment.trim()}` guard unchanged, so the required-comment validation still applies before the dialog can even open.
   - Add a new `<ConfirmDialog>` immediately after the form (or wherever fits cleanly in the same card, before the card's closing `</Card>` at `:1725`):
     - `open={confirmRevisit}`
     - `title="Send Notice to Revisit?"`
     - `variant="primary"` (matching the button's own `variant="secondary"` styling intent — not a destructive action, but still binding)
     - `confirmLabel="Yes, send"`
     - `onCancel={() => setConfirmRevisit(false)}`
     - `onConfirm={() => { void handleAction("revisit").then(() => setConfirmRevisit(false)); }}`
     - `loading={saving}`
     - Body (via `children`, matching the read-only `kv` summary style already used in the Approve/Deny/Hold dialog at `:1630-1663`): show `Route to` (`revisitRoute === "csa" ? "CSA (intake)" : "CIG (verification)"`) and the entered `Remarks` (`revisitComment`) as a **read-only summary** — the comment/route were already entered in the form before opening the dialog, so this dialog confirms what will be sent, it does not re-collect the fields.
   - Do not touch the existing `confirmAction`/Approve/Deny/Hold `ConfirmDialog` (`:1591-1685`) — already correct, not part of this gap.

### Validation checklist — Phase 1

- [x] Clicking "Send Notice to Revisit" (with a route selected and a comment entered) opens a confirmation dialog instead of submitting immediately.
- [x] The dialog shows the actual route and remarks that were entered in the form, not blank/default values.
- [x] Confirming the dialog sends the revisit exactly as before (same `handleAction("revisit")` call, same payload) — verify a real revisit still lands correctly in `committee_actions`/status history.
- [x] Cancelling the dialog does not submit anything, and leaves the form's route/comment values intact so the user can adjust and retry.
- [x] The existing required-comment validation (`disabled={!revisitComment.trim()}` on the button) still prevents opening the dialog with an empty comment.
- [x] Approve/Deny/Hold's existing confirmation dialog is completely unchanged.
- [x] Behavior confirmed identical for a Seafarer application and an SME (Individual and Corporate) application — this card has no segment branching, so one fix covers all three by construction, but verify live on at least one of each rather than assuming.
- [x] `npx tsc --noEmit` clean.
- [x] Existing test suite still passes.

### Status: Done (2026-08-13)

---

## Explicitly out of scope

- Any change to the Approve/Deny/Hold confirmation flow — already correct.
- Any change to `handleAction`, `committee_actions`, or the revisit routing/status logic itself — this is purely adding a missing UI confirmation step in front of an already-working action.
- Any change to the CI Report / Field Visit Form / Computation / 4 Cs sections on this same page.

## Final validation

- [x] Full test suite run — no new failures.
- [x] Live check: send a real Notice to Revisit (both cancel and confirm paths) on a Seafarer application and an SME application, confirm the dialog shows correct data and the action only fires on explicit confirm.

**Done (2026-08-13)**
