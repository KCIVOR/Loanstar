/** Tokens from a Supabase implicit-grant redirect (`#access_token=...`). */
export function sessionFromHash(
  hash: string,
): { access_token: string; refresh_token: string } | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}
