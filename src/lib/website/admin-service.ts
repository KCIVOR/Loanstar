import 'server-only';
import { z } from 'zod';
import { requireModulePermission, isSuperAdmin, hasModulePermission } from '@/lib/permissions/server';
import { createServiceClient } from '@/lib/supabase/server';
import { collectAssetIds, websiteSchema, type WebsiteContent } from './schema';
import { checkDatabaseError, WebsiteError } from './errors';
import { prepareWebsiteAssets, previewAssets } from './assets';

export const versionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const draftRequestSchema = z.object({ expectedVersion: versionSchema, content: websiteSchema }).strict();
export const publishRequestSchema = z.object({ expectedVersion: versionSchema, expectedPublishedRevisionId: z.string().uuid(), requestId: z.string().uuid(), summary: z.string().max(500).default('') }).strict();
export const restoreRequestSchema = publishRequestSchema.omit({ summary: true }).extend({ targetRevisionId: z.string().uuid() }).strict();
export const reconcileRequestSchema = publishRequestSchema.omit({ requestId: true, summary: true }).extend({ mode: z.enum(['reset', 'rebase']) }).strict();

export function websiteServiceClient() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://ddsvqjaknuniekygpbdr.supabase.co') throw new WebsiteError(503, 'Website CMS staging target mismatch');
  return createServiceClient();
}

export async function requireWebsiteActor(action: 'view' | 'edit' = 'view', publish = false) {
  const user = await requireModulePermission('website_content', action);
  if (publish && !(await isSuperAdmin(user.id))) throw new WebsiteError(403, 'Only Super Admin can publish or restore the website');
  return user;
}

export async function getWebsiteAdminState() {
  const actor = await requireWebsiteActor();
  const service = websiteServiceClient();
  const [draft, publication, canPublish, canEdit] = await Promise.all([
    service.from('website_drafts').select('*').eq('site_key', 'main').single(),
    service.from('website_publications').select('*').eq('site_key', 'main').single(),
    isSuperAdmin(actor.id), hasModulePermission('website_content', 'edit', actor.id),
  ]);
  checkDatabaseError(draft.error); checkDatabaseError(publication.error);
  if (!draft.data || !publication.data) throw new WebsiteError(503, 'Website CMS is not initialized');
  const content = websiteSchema.parse(draft.data.content);
  return { draft: { ...draft.data, content }, publication: publication.data, capabilities: { canEdit, canPublish } };
}

export async function getDraftPreviewAssets(content: WebsiteContent) {
  await requireWebsiteActor();
  const ids = collectAssetIds(content);
  if (!ids.length) return [];
  const { data, error } = await websiteServiceClient().from('website_assets').select('id,private_path,public_path,mime_type,byte_size,width,height,checksum,state,created_at').in('id', ids);
  checkDatabaseError(error);
  return previewAssets(data ?? [], content);
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await websiteServiceClient().rpc(name, args);
  checkDatabaseError(error);
  return data;
}

export async function saveDraft(input: z.infer<typeof draftRequestSchema>) {
  const actor = await requireWebsiteActor('edit');
  const validated = draftRequestSchema.parse(input);
  return rpc('website_save_draft', { p_actor: actor.id, p_expected_version: validated.expectedVersion, p_content: validated.content });
}

export async function reconcileDraft(input: z.infer<typeof reconcileRequestSchema>) {
  const actor = await requireWebsiteActor('edit');
  const validated = reconcileRequestSchema.parse(input);
  return rpc('website_reconcile_draft', { p_actor: actor.id, p_expected_version: validated.expectedVersion, p_expected_live: validated.expectedPublishedRevisionId, p_mode: validated.mode });
}

export async function publishWebsite(input: z.infer<typeof publishRequestSchema>) {
  const actor = await requireWebsiteActor('edit', true);
  const validated = publishRequestSchema.parse(input);
  const service = websiteServiceClient();
  // Check prior request first: a lost-response retry must not inspect changed draft state.
  const prior = await service.from('website_revisions').select('id').eq('publication_request_id', validated.requestId).maybeSingle();
  checkDatabaseError(prior.error);
  if (!prior.data) {
    const draft = await service.from('website_drafts').select('content,lock_version').eq('site_key', 'main').single();
    checkDatabaseError(draft.error);
    if (draft.data?.lock_version !== validated.expectedVersion) throw new WebsiteError(409, 'Draft changed. Reload and compare before publishing.');
    await prepareWebsiteAssets(service, websiteSchema.parse(draft.data.content));
  }
  return rpc('website_publish', { p_actor: actor.id, p_expected_version: validated.expectedVersion, p_expected_live: validated.expectedPublishedRevisionId, p_request_id: validated.requestId, p_summary: validated.summary });
}

export async function restoreWebsite(input: z.infer<typeof restoreRequestSchema>) {
  const actor = await requireWebsiteActor('edit', true);
  const validated = restoreRequestSchema.parse(input);
  const service = websiteServiceClient();
  const prior = await service.from('website_revisions').select('id').eq('publication_request_id', validated.requestId).maybeSingle();
  checkDatabaseError(prior.error);
  if (!prior.data) {
    const target = await service.from('website_revisions').select('content').eq('id', validated.targetRevisionId).single();
    checkDatabaseError(target.error);
    if (!target.data) throw new WebsiteError(404, 'Release not found');
    await prepareWebsiteAssets(service, websiteSchema.parse(target.data.content));
  }
  return rpc('website_restore', { p_actor: actor.id, p_target_revision: validated.targetRevisionId, p_expected_version: validated.expectedVersion, p_expected_live: validated.expectedPublishedRevisionId, p_request_id: validated.requestId });
}

export async function listWebsiteRevisions(offset = 0) {
  await requireWebsiteActor();
  const { data, error } = await websiteServiceClient().from('website_revisions').select('id,revision_no,operation,created_by,created_at,change_summary,restored_from_revision_id').order('revision_no', { ascending: false }).range(offset, offset + 19);
  checkDatabaseError(error);
  return data ?? [];
}
