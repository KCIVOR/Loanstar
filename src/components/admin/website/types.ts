import type { WebsiteContent } from "@/lib/website/schema";

export type Draft = {
  content: WebsiteContent;
  lock_version: number;
  base_revision_id: string | null;
};
export type AdminState = {
  draft: Draft;
  publication: {
    revision_id: string;
    published_at: string;
    public_content?: { content: WebsiteContent };
  };
  capabilities: { canEdit: boolean; canPublish: boolean };
};
export type WebsiteAsset = {
  id: string;
  mime_type: string;
  width: number;
  height: number;
  byte_size: number;
  state: string;
  previewUrl: string;
};
export type Revision = {
  id: string;
  revision_no: number;
  created_at: string;
  created_by: string | null;
  change_summary: string;
  operation: string;
  restored_from_revision_id: string | null;
};

export class RequestFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function websiteRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/admin/website${path}`, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init.headers
        : { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new RequestFailure(
      body?.error ?? `Request failed (${response.status})`,
      response.status,
    );
  return body as T;
}
