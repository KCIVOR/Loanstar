/** Build a safe http(s) URL from a stored Facebook field value. */
export function facebookHref(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  const looksLikeAbsolute =
    /^https?:\/\//i.test(value) ||
    /^(www\.)?(facebook\.com|fb\.com|fb\.me)\b/i.test(value);

  if (looksLikeAbsolute) {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
      const url = new URL(withScheme);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url.href;
    } catch {
      return null;
    }
  }

  const handle = value.replace(/^@/, "").replace(/^\/+/, "");
  if (!handle) return null;
  return `https://www.facebook.com/${encodeURI(handle)}`;
}
