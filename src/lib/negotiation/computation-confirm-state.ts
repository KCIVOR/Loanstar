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

  // No negotiation record yet means Committee hasn't made its final decision
  // — the computation shown so far (including any pre-decision "Adjust
  // amount" snapshot) is not yet final and must not be confirmable.
  return "hidden";
}
