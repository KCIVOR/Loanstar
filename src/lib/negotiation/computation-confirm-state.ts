export type ComputationConfirmState =
  | "waiting_disclosure"
  | "confirm"
  | "confirmed"
  | "hidden";

/**
 * Decides what the borrower computation panel should show.
 *
 * Intake-era signatures must not count as post-approval acceptance once CSA
 * has disclosed terms (`awaiting_signature`). Those stale signatures are
 * cleared on disclose, but the UI also ignores them so a failed clear cannot
 * hide the confirm button.
 *
 * Pre-decision (no negotiation record yet at all) is confirmable too — the
 * borrower may self-sign CSA's initial computation instead of CSA using the
 * witness-sign bypass. This is safe because every place that changes the
 * active computation before Committee's final decision (CSA recompute,
 * Committee's pre-decision "Adjust amount") clears `signed_at` on the new
 * snapshot, and `discloseTerms()` clears it again after Committee decides —
 * so a pre-decision signature can never silently apply to different final
 * terms. This does NOT extend to an active counter-offer negotiation
 * (`negotiating`) — that status only exists once a negotiation record has
 * already been disclosed, and the borrower is waiting on Committee's
 * response to their counter, not re-confirming a number they set themselves.
 */
export function computationConfirmState(input: {
  signedAt: string | null;
  negotiationStatus: string | null | undefined;
  applicationStatus: string;
}): ComputationConfirmState {
  const negotiationStatus = input.negotiationStatus ?? null;

  const waitingForDisclosure =
    negotiationStatus === "pending_disclosure" ||
    (input.applicationStatus === "approved" && !negotiationStatus);

  if (waitingForDisclosure) {
    return "waiting_disclosure";
  }

  if (negotiationStatus === "awaiting_signature") {
    return "confirm";
  }

  if (input.signedAt) {
    return "confirmed";
  }

  if (negotiationStatus === null) {
    // No negotiation record yet at all — pre-decision, borrower may self-sign
    // CSA's initial computation (see doc comment above).
    return "confirm";
  }

  // Active negotiation ("negotiating") with no signature yet: waiting on
  // Committee's response to the borrower's counter, not confirmable.
  return "hidden";
}
