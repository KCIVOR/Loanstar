const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function buildPaymentProofStoragePath(
  borrowerId: string,
  tempKey: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[/\\]/g, "_").replace(/\.\./g, "_");
  return `${borrowerId}/payments/${tempKey}/${safeName}`;
}

export function isAllowedPaymentProofMime(mime: string): boolean {
  return ALLOWED.has(mime.toLowerCase());
}

export function assertPaymentProofPathOwnedByBorrower(
  storagePath: string,
  borrowerId: string,
): void {
  const prefix = `${borrowerId}/payments/`;
  if (!storagePath.startsWith(prefix) || storagePath.includes("..")) {
    throw new Error("Invalid payment proof storage path");
  }
}
