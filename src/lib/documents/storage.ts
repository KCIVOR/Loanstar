import type { SupabaseClient } from "@supabase/supabase-js";

import { DOCUMENT_BUCKET } from "@/lib/constants";

export function buildStoragePath(
  borrowerId: string,
  documentId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[/\\]/g, "_");
  return `${borrowerId}/${documentId}/${safeName}`;
}

export async function createSignedUploadUrl(
  supabase: SupabaseClient,
  storagePath: string,
) {
  const { data, error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error) {
    throw new Error(`Failed to create upload URL: ${error.message}`);
  }

  return data;
}

export async function createSignedDownloadUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 3600,
) {
  const { data, error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) {
    throw new Error(`Failed to create download URL: ${error.message}`);
  }

  return data.signedUrl;
}

export async function uploadDocumentBytes(
  supabase: SupabaseClient,
  storagePath: string,
  body: Buffer | Uint8Array,
  contentType: string,
) {
  const { error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, body, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload document: ${error.message}`);
  }
}

export async function downloadDocumentBytes(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(
      `Failed to download document: ${error?.message ?? "empty response"}`,
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
