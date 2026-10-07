export const BUG_IMAGE_BUCKET = "bug-report-images";
export const BUG_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const BUG_IMAGE_MAX_COUNT = 3;

export function imageTypeFromBytes(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export function imageExtension(type: "image/jpeg" | "image/png" | "image/webp") {
  return type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp";
}
