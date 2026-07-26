import { NextResponse } from "next/server";

/**
 * Retired endpoint (workflow-alignment Phase 1).
 *
 * Requirement uploads (Passport, Seaman's Book, …) are confirmed by CSA via
 * POST /api/documents/[id]/confirm — they are never click-signed by the
 * borrower. Borrower signatures exist only where the approved workflow
 * requires them: the loan computation (/api/borrower/.../computation) and the
 * LRA release documents (/api/lra/.../documents/[docId]/sign, witnessed
 * in-branch). Kept as an explicit 403 (rather than deleted) so any stale
 * client gets a clear error instead of a 404.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Signing uploaded requirement documents is not supported — a CSA reviews and confirms each upload.",
    },
    { status: 403 },
  );
}
