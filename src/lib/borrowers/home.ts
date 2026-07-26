import { APPLICATION_STATUSES } from "../constants";
import { formatStatusLabel } from "../applications/status";

export type BorrowerHomeMode = "ready" | "in_progress" | "active_loan";

export type NextStepGuidance = {
  title: string;
  body: string;
};

/** Happy-path stages used for a simple borrower progress bar. */
const PROGRESS_STATUSES = [
  "documents_pending",
  "submitted",
  "for_verification",
  "for_approval",
  "approved",
  "negotiating_terms",
  "awaiting_confirmation",
  "lra_pending",
  "release_signing",
  "release_briefing",
  "release_ready",
  "released",
] as const;

export function borrowerHomeMode(input: {
  hasOpenApplication: boolean;
  hasActiveLoan: boolean;
}): BorrowerHomeMode {
  if (input.hasActiveLoan) return "active_loan";
  if (input.hasOpenApplication) return "in_progress";
  return "ready";
}

export function borrowerHomeDescription(mode: BorrowerHomeMode): string {
  if (mode === "ready") {
    return "Start a loan application when you are ready, or wait for CSA to open a file for you.";
  }
  if (mode === "in_progress") {
    return "Track your application progress and complete the next required step.";
  }
  return "Review your outstanding balance, next payment, and loan details.";
}

export function pipelineProgressPercent(status: string): number {
  const idx = (PROGRESS_STATUSES as readonly string[]).indexOf(status);
  if (idx < 0) {
    const full = (APPLICATION_STATUSES as readonly string[]).indexOf(status);
    if (full < 0) return 0;
    return Math.round(((full + 1) / APPLICATION_STATUSES.length) * 100);
  }
  return Math.round(((idx + 1) / PROGRESS_STATUSES.length) * 100);
}

export function pipelineStageLabel(status: string): string {
  const idx = (PROGRESS_STATUSES as readonly string[]).indexOf(status);
  if (idx < 0) return "In progress";
  return `Step ${idx + 1} of ${PROGRESS_STATUSES.length}`;
}

export function nextActionLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Continue your draft";
    case "documents_pending":
    case "for_revision":
    case "registered":
      return "Continue documents";
    case "awaiting_confirmation":
    case "negotiating_terms":
      return "Review terms";
    case "release_signing":
    case "release_briefing":
      return "View release progress";
    case "on_hold":
      return "View hold details";
    case "committee_hold":
      return "View committee hold";
    default:
      return "Continue application";
  }
}

export type BorrowerAppFocus =
  | "documents"
  | "waiting"
  | "terms"
  | "release"
  | "loan";

/** Which workspace section should lead on the application detail page. */
export function borrowerAppFocus(status: string): BorrowerAppFocus {
  switch (status) {
    case "draft":
    case "registered":
    case "documents_pending":
    case "for_revision":
      return "documents";
    case "negotiating_terms":
    case "awaiting_confirmation":
      return "terms";
    case "lra_pending":
    case "release_signing":
    case "release_briefing":
    case "release_ready":
      return "release";
    case "released":
    case "closed":
    case "loan_active":
    case "paid_off":
      return "loan";
    default:
      return "waiting";
  }
}

export function borrowerAppPageTitle(status: string): string {
  switch (borrowerAppFocus(status)) {
    case "documents":
      return "Application documents";
    case "terms":
      return "Loan terms";
    case "release":
      return "Release & signing";
    case "loan":
      return "Your loan";
    default:
      return "Application status";
  }
}

export function borrowerAppPageDescription(input: {
  status: string;
  applicationNo: string | null;
}): string {
  const no = input.applicationNo ?? "Application in progress";
  const focus = borrowerAppFocus(input.status);
  if (focus === "documents") {
    return `${no} · Upload and complete your intake checklist`;
  }
  if (focus === "terms") {
    return `${no} · Review and confirm your loan computation`;
  }
  if (focus === "release") {
    return `${no} · Release signing and briefing at your branch`;
  }
  if (focus === "loan") {
    return `${no} · Balance, schedule, and payments`;
  }
  return `${no} · ${formatStatusLabel(input.status)}`;
}

export function formatBlockerLabel(
  blocker: string | null | undefined,
): string | null {
  if (!blocker?.trim()) return null;
  const plain = blocker.replaceAll("_", " ").trim();
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

export function docsUploadPercent(input: {
  uploaded: number;
  required: number;
}): number {
  if (input.required <= 0) return 100;
  return Math.round((input.uploaded / input.required) * 100);
}

/**
 * Plain-language “what you need to do” for the borrower home banner.
 */
export function nextStepGuidance(input: {
  status: string;
  blocker?: string | null;
  docsUploaded?: number;
  docsRequired?: number;
}): NextStepGuidance {
  const blocker = formatBlockerLabel(input.blocker);
  const docsRequired = input.docsRequired ?? 0;
  const docsUploaded = input.docsUploaded ?? 0;

  switch (input.status) {
    case "draft":
      return {
        title: "Finish your draft and submit",
        body:
          docsRequired > 0
            ? `You have uploaded ${docsUploaded} of ${docsRequired} required documents. Your application is not yet visible to Loan Star — submit it once your documents are complete.`
            : "Your application is a draft — not yet visible to Loan Star. Upload the required documents, then submit.",
      };
    case "registered":
    case "documents_pending":
      return {
        title: "Upload your required documents",
        body:
          docsRequired > 0
            ? `You have uploaded ${docsUploaded} of ${docsRequired} required documents. Finish the checklist to move forward.`
            : "Open your application and upload the required intake documents.",
      };
    case "for_revision":
      return {
        title: "Update your documents",
        body: blocker
          ? `${blocker}. Review the checklist, replace anything flagged, and resubmit.`
          : "Some documents need changes. Review the checklist and upload the corrected files.",
      };
    case "submitted":
      return {
        title: "Waiting on LoanStar",
        body: "Your file was submitted. CSA will review it next — no action needed from you right now.",
      };
    case "for_verification":
      return {
        title: "Verification in progress",
        body: "Your documents are being verified. You will be notified if anything else is required.",
      };
    case "for_approval":
      return {
        title: "With the credit committee",
        body: "Your application is under committee review. No action needed from you right now.",
      };
    case "committee_hold":
      return {
        title: "On hold pending committee review",
        body: "Your application is on hold pending committee review.",
      };
    case "approved":
      return {
        title: "Approved — terms coming next",
        body: "Your loan was approved. Watch for computation and term confirmation steps.",
      };
    case "negotiating_terms":
    case "awaiting_confirmation":
      return {
        title: "Review and confirm your loan terms",
        body: "Open your application to review the computation and confirm or counter the offer.",
      };
    case "on_hold":
      return {
        title: "Application on hold",
        body: blocker
          ? `${blocker}. Open your file for details, or wait for CSA to clear the hold.`
          : "Your application is on hold. Open your file for details or contact LoanStar support.",
      };
    case "lra_pending":
      return {
        title: "Release setup in progress",
        body: "LRA is preparing your release file. You will be invited to the branch to sign documents next.",
      };
    case "release_signing":
      return {
        title: "Visit the branch to sign your release documents",
        body: "Your release documents are ready. Sign them at the branch with your loan release officer.",
      };
    case "release_briefing":
      return {
        title: "Attend your loan briefing",
        body: "Our collection officer will brief you on payment rules at the branch before disbursement.",
      };
    case "release_ready":
      return {
        title: "Almost released",
        body: "Your file is ready for disbursement. LoanStar will complete the release shortly.",
      };
    case "released":
    case "closed":
      return {
        title: "Funds released",
        body: "Your loan proceeds were released. Accounting is setting up your loan account — your balance and payment schedule will appear here shortly.",
      };
    case "denied":
      return {
        title: "Application denied",
        body: blocker
          ? `${blocker}. You can review the file for details.`
          : "This application was denied. Open the file for details.",
      };
    default:
      return {
        title: "Continue your application",
        body: `Current status: ${formatStatusLabel(input.status)}. Open your file for the latest details.`,
      };
  }
}
