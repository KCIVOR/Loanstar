export function unsignedGeneratedDocumentIds(
  docs: Array<{ id: string; signed_at: string | null; is_finalized?: boolean | null }>,
): string[] {
  return docs
    .filter((doc) => !doc.signed_at && !doc.is_finalized)
    .map((doc) => doc.id);
}

export function canShowMarkAllSigned(opts: {
  releaseStatus: string | null | undefined;
  unsignedCount: number;
}): boolean {
  return opts.releaseStatus === "awaiting_signatures" && opts.unsignedCount > 0;
}
