export const SECTION_ANCHORS = {
  hero: "top",
  products: "products",
  how: "how",
  why: "why",
  "closing-cta": "closing-cta",
} as const;
export function isSafeWebsiteLink(value: string): boolean {
  if (/^(\/|#)/.test(value))
    return [
      "/",
      "/login",
      "/register",
      "/forgot-password",
      "#top",
      "#products",
      "#how",
      "#why",
      "#closing-cta",
    ].includes(value);
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !/[\u0000-\u0020\\]/.test(value)
    );
  } catch {
    return false;
  }
}
