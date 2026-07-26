import type { SupabaseClient } from "@supabase/supabase-js";

export type TemplateStatus = "draft" | "published" | "archived";

export type DocumentTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DocumentTemplateVersion = {
  id: string;
  templateId: string;
  versionNo: number;
  body: string;
  mergeFields: unknown;
  status: TemplateStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type TemplateRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type VersionRow = {
  id: string;
  template_id: string;
  version_no: number;
  body: string;
  merge_fields: unknown;
  status: TemplateStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapTemplate(row: TemplateRow): DocumentTemplate {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row: VersionRow): DocumentTemplateVersion {
  return {
    id: row.id,
    templateId: row.template_id,
    versionNo: row.version_no,
    body: row.body,
    mergeFields: row.merge_fields,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TEMPLATE_COLS =
  "id, slug, name, description, category, is_active, created_at, updated_at";
const VERSION_COLS =
  "id, template_id, version_no, body, merge_fields, status, published_at, created_at, updated_at";

export async function listTemplates(
  supabase: SupabaseClient,
): Promise<Array<DocumentTemplate & { publishedVersionNo: number | null }>> {
  const { data: templates, error } = await supabase
    .from("document_templates")
    .select(TEMPLATE_COLS)
    .order("category", { nullsFirst: false })
    .order("name");
  if (error) throw new Error(error.message);

  const { data: published, error: pubError } = await supabase
    .from("document_template_versions")
    .select("template_id, version_no")
    .eq("status", "published");
  if (pubError) throw new Error(pubError.message);

  const publishedByTemplate = new Map<string, number>();
  for (const row of (published ?? []) as Array<{
    template_id: string;
    version_no: number;
  }>) {
    publishedByTemplate.set(row.template_id, row.version_no);
  }

  return ((templates ?? []) as TemplateRow[]).map((row) => ({
    ...mapTemplate(row),
    publishedVersionNo: publishedByTemplate.get(row.id) ?? null,
  }));
}

export async function getTemplateWithVersions(
  supabase: SupabaseClient,
  templateId: string,
): Promise<{
  template: DocumentTemplate;
  versions: DocumentTemplateVersion[];
} | null> {
  const { data: template, error } = await supabase
    .from("document_templates")
    .select(TEMPLATE_COLS)
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!template) return null;

  const { data: versions, error: vError } = await supabase
    .from("document_template_versions")
    .select(VERSION_COLS)
    .eq("template_id", templateId)
    .order("version_no", { ascending: false });
  if (vError) throw new Error(vError.message);

  return {
    template: mapTemplate(template as TemplateRow),
    versions: ((versions ?? []) as VersionRow[]).map(mapVersion),
  };
}

/**
 * Resolve the currently-published template body for a slug, or null when there
 * is none (caller then falls back to the legacy renderer). Readable by any
 * authenticated staffer via RLS (published versions + active templates).
 */
export async function getPublishedTemplate(
  supabase: SupabaseClient,
  slug: string,
): Promise<{ versionId: string; body: string } | null> {
  const { data: template, error } = await supabase
    .from("document_templates")
    .select("id, is_active")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!template || !(template as { is_active: boolean }).is_active) return null;

  const { data: version, error: vError } = await supabase
    .from("document_template_versions")
    .select("id, body")
    .eq("template_id", (template as { id: string }).id)
    .eq("status", "published")
    .maybeSingle();
  if (vError) throw new Error(vError.message);
  if (!version) return null;

  return {
    versionId: (version as { id: string }).id,
    body: (version as { body: string }).body,
  };
}

export async function createTemplate(
  supabase: SupabaseClient,
  input: {
    slug: string;
    name: string;
    description?: string | null;
    category?: string | null;
  },
): Promise<DocumentTemplate> {
  const { data, error } = await supabase
    .from("document_templates")
    .insert({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      category: input.category ?? null,
    })
    .select(TEMPLATE_COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapTemplate(data as TemplateRow);
}

/**
 * Save the working draft for a template. There is at most one draft per template:
 * if one exists its body is updated; otherwise a new draft is created with the
 * next version number. Published/archived versions are never touched (the DB
 * immutability trigger enforces this too).
 */
export async function saveDraft(
  supabase: SupabaseClient,
  templateId: string,
  input: { body: string; mergeFields?: unknown },
  actorId: string,
): Promise<DocumentTemplateVersion> {
  const { data: existingDraft, error: draftError } = await supabase
    .from("document_template_versions")
    .select(VERSION_COLS)
    .eq("template_id", templateId)
    .eq("status", "draft")
    .maybeSingle();
  if (draftError) throw new Error(draftError.message);

  if (existingDraft) {
    const { data, error } = await supabase
      .from("document_template_versions")
      .update({
        body: input.body,
        merge_fields: input.mergeFields ?? [],
      })
      .eq("id", (existingDraft as VersionRow).id)
      .select(VERSION_COLS)
      .single();
    if (error) throw new Error(error.message);
    return mapVersion(data as VersionRow);
  }

  const { data: maxRow, error: maxError } = await supabase
    .from("document_template_versions")
    .select("version_no")
    .eq("template_id", templateId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw new Error(maxError.message);

  const nextVersionNo = ((maxRow as { version_no: number } | null)?.version_no ?? 0) + 1;

  const { data, error } = await supabase
    .from("document_template_versions")
    .insert({
      template_id: templateId,
      version_no: nextVersionNo,
      body: input.body,
      merge_fields: input.mergeFields ?? [],
      status: "draft",
      created_by: actorId,
    })
    .select(VERSION_COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapVersion(data as VersionRow);
}

/**
 * Publish a draft version: archive the currently-published version first (the
 * DB enforces at most one published per template), then promote the draft.
 */
export async function publishVersion(
  supabase: SupabaseClient,
  templateId: string,
  versionId: string,
  actorId: string,
): Promise<DocumentTemplateVersion> {
  const { error: archiveError } = await supabase
    .from("document_template_versions")
    .update({ status: "archived" })
    .eq("template_id", templateId)
    .eq("status", "published");
  if (archiveError) throw new Error(archiveError.message);

  const { data, error } = await supabase
    .from("document_template_versions")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      published_by: actorId,
    })
    .eq("id", versionId)
    .eq("template_id", templateId)
    .eq("status", "draft")
    .select(VERSION_COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapVersion(data as VersionRow);
}
