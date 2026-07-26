import type { SupabaseClient } from "@supabase/supabase-js";
import { createSignedDownloadUrl } from "@/lib/documents/storage";
import { NotFoundError } from "@/lib/permissions/server";

export async function getPaymentProofSignedDownload(
  supabase: SupabaseClient,
  paymentId: string,
): Promise<{ signedUrl: string; fileName: string | null }> {
  const { data, error } = await supabase
    .from("payments")
    .select("id, storage_path, file_name")
    .eq("id", paymentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new NotFoundError("Payment not found");
  }
  if (!data.storage_path) {
    throw new NotFoundError("No file attached to this payment proof");
  }

  const signedUrl = await createSignedDownloadUrl(
    supabase,
    data.storage_path as string,
  );
  return { signedUrl, fileName: (data.file_name as string | null) ?? null };
}
