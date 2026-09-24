import type { SupabaseClient } from "@supabase/supabase-js";

import { DOCUMENT_TEMPLATE_ASSET_BUCKET } from "@/lib/constants";

/** Matches the document-template-assets bucket's own file_size_limit
 * (see the bucket migration) — checked in the API route too so a rejection
 * is a clean 400, not a raw Storage error. */
export const DOCX_TEMPLATE_MAX_BYTES = 10 * 1024 * 1024; // 10MB

export const DOCX_TEMPLATE_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** templates/{templateId}/{versionId}.docx — mirrors buildStoragePath's
 * borrowerId/documentId shape in storage.ts, scoped to template+version
 * instead of borrower+document. */
export function buildTemplateAssetPath(
  templateId: string,
  versionId: string,
): string {
  return `templates/${templateId}/${versionId}.docx`;
}

export async function uploadTemplateAssetBytes(
  supabase: SupabaseClient,
  storagePath: string,
  body: Buffer | Uint8Array,
) {
  const { error } = await supabase.storage
    .from(DOCUMENT_TEMPLATE_ASSET_BUCKET)
    .upload(storagePath, body, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload template asset: ${error.message}`);
  }
}

export async function downloadTemplateAssetBytes(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from(DOCUMENT_TEMPLATE_ASSET_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(
      `Failed to download template asset: ${error?.message ?? "empty response"}`,
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function createSignedTemplateAssetDownloadUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 3600,
) {
  const { data, error } = await supabase.storage
    .from(DOCUMENT_TEMPLATE_ASSET_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) {
    throw new Error(`Failed to create template asset download URL: ${error.message}`);
  }

  return data.signedUrl;
}
