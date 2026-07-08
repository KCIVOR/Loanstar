import { createHash } from "crypto";

/** SHA-256 hex digest of a document buffer for signature verification. */
export function hashDocument(buffer: Buffer | Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}
