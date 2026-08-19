import type { DocumentStatus } from "./checklist";

type ChecklistActionOpts = {
  documentId: string | null;
  status: DocumentStatus | null;
  readOnly?: boolean;
  flagsOnly?: boolean;
};

/**
 * When CSA (or other staff) provides confirmApiPath, Confirm is shown only for
 * uploaded requirement rows — not pending/confirmed, and not in read-only/flags views.
 */
export function canShowConfirmAction(
  opts: ChecklistActionOpts & { hasConfirmApi: boolean },
): boolean {
  return (
    opts.hasConfirmApi &&
    !opts.readOnly &&
    !opts.flagsOnly &&
    Boolean(opts.documentId) &&
    opts.status === "uploaded"
  );
}

/**
 * Requirement uploads are CSA-confirmed (workflow §2.6). Sign UI stays opt-in only.
 */
export function canShowSignAction(
  opts: ChecklistActionOpts & { allowSign: boolean },
): boolean {
  return (
    opts.allowSign &&
    !opts.readOnly &&
    !opts.flagsOnly &&
    Boolean(opts.documentId) &&
    opts.status === "uploaded"
  );
}

/**
 * When CSA provides requestRevisionApiPath, Request revision is shown for
 * uploaded, confirmed, or needs_revision rows that already have a document id.
 */
export function canShowRequestRevisionAction(
  opts: ChecklistActionOpts & { hasRequestRevisionApi: boolean },
): boolean {
  return (
    opts.hasRequestRevisionApi &&
    !opts.readOnly &&
    !opts.flagsOnly &&
    Boolean(opts.documentId) &&
    (opts.status === "uploaded" ||
      opts.status === "confirmed" ||
      opts.status === "needs_revision")
  );
}

/** Borrower/staff subtitle for uploaded rows awaiting CSA confirm. */
export function uploadedAwaitingSubtitle(fileName: string | null): string {
  return `${fileName ?? "Uploaded"} · Awaiting CSA confirmation`;
}

/** Subtitle for needs_revision rows. */
export function needsRevisionSubtitle(
  remarks: string | null | undefined,
  fileName: string | null,
): string {
  const fileBit = fileName ?? "Uploaded file kept";
  if (remarks?.trim()) {
    return `Needs revision: ${remarks.trim()} · ${fileBit}`;
  }
  return `Needs revision · ${fileBit}`;
}

export function confirmableDocumentIds(
  items: Array<{ documentId: string | null; status: DocumentStatus | null }>,
): string[] {
  return items
    .filter((item) => item.documentId && item.status === "uploaded")
    .map((item) => item.documentId as string);
}

export function canShowConfirmAllAction(
  opts: { hasConfirmApi: boolean; confirmableCount: number } & Pick<
    ChecklistActionOpts,
    "readOnly" | "flagsOnly"
  >,
): boolean {
  return (
    opts.hasConfirmApi &&
    !opts.readOnly &&
    !opts.flagsOnly &&
    opts.confirmableCount > 0
  );
}
