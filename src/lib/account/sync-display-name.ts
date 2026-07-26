import { createServiceClient } from "@/lib/supabase/server";

/**
 * Keep profiles.full_name and Auth user_metadata.full_name in sync.
 * Uses the service client so admin and self paths share one write.
 */
export async function syncDisplayName(
  userId: string,
  fullName: string,
): Promise<void> {
  const service = createServiceClient();
  const name = fullName.trim();

  const { error: profileError } = await service
    .from("profiles")
    .update({ full_name: name })
    .eq("id", userId);

  if (profileError) {
    throw new Error(`Failed to update profile name: ${profileError.message}`);
  }

  const { error: authError } = await service.auth.admin.updateUserById(userId, {
    user_metadata: { full_name: name },
  });

  if (authError) {
    throw new Error(`Failed to sync auth display name: ${authError.message}`);
  }
}

/** Sync Auth metadata only when profiles.full_name was already written. */
export async function syncAuthDisplayNameMetadata(
  userId: string,
  fullName: string | null,
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(userId, {
    user_metadata: { full_name: fullName?.trim() ?? "" },
  });
  if (error) {
    throw new Error(`Failed to sync auth display name: ${error.message}`);
  }
}
