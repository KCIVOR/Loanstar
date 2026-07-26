/** Prefer profiles.full_name, then Auth metadata, then email. */
export function resolveDisplayName(
  profileFullName: string | null | undefined,
  metadataFullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const fromProfile = profileFullName?.trim();
  if (fromProfile) return fromProfile;
  const fromMeta = metadataFullName?.trim();
  if (fromMeta) return fromMeta;
  const fromEmail = email?.trim();
  if (fromEmail) return fromEmail;
  return "User";
}
