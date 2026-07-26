import { NextResponse } from "next/server";

import {
  AVATAR_BUCKET,
  AVATAR_MAX_BYTES,
  avatarPathFromPublicUrl,
  buildAvatarStoragePath,
  isAllowedAvatarMime,
} from "@/lib/account/avatar";
import {
  countRecentAvatarUploads,
  isAvatarUploadRateLimited,
} from "@/lib/account/rate-limit";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import { requireAuth } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

function publicAvatarUrl(supabase: Awaited<ReturnType<typeof createClient>>, path: string) {
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  // Cache-bust so Header refreshes after replace.
  const sep = data.publicUrl.includes("?") ? "&" : "?";
  return `${data.publicUrl}${sep}v=${Date.now()}`;
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (!isAllowedAvatarMime(file.type)) {
      return NextResponse.json(
        { error: "Avatar must be JPEG, PNG, or WebP" },
        { status: 400 },
      );
    }
    if (file.size > AVATAR_MAX_BYTES) {
      return NextResponse.json(
        { error: "Avatar must be 2MB or smaller" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    // Service client: users cannot SELECT audit_events under RLS.
    const recentUploads = await countRecentAvatarUploads(
      createServiceClient(),
      user.id,
    );
    if (isAvatarUploadRateLimited(recentUploads)) {
      return NextResponse.json(
        {
          error:
            "Too many avatar uploads. Please wait a few minutes and try again.",
        },
        { status: 429 },
      );
    }

    const path = buildAvatarStoragePath(user.id, file.type);
    const bytes = Buffer.from(await file.arrayBuffer());

    // Remove any prior extension variants in the user folder.
    const { data: existing } = await supabase.storage
      .from(AVATAR_BUCKET)
      .list(user.id);
    const stale = (existing ?? [])
      .map((obj) => `${user.id}/${obj.name}`)
      .filter((p) => p !== path);
    if (stale.length) {
      await supabase.storage.from(AVATAR_BUCKET).remove(stale);
    }

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, bytes, {
        contentType: file.type,
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`Failed to upload avatar: ${uploadError.message}`);
    }

    const avatarUrl = publicAvatarUrl(supabase, path);
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", user.id);
    if (profileError) {
      throw new Error(profileError.message);
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "account_settings",
      action: "avatar_upload",
      entityType: "profile",
      entityId: user.id,
      afterData: { avatarUrl, path },
    });

    return jsonOk({ avatarUrl });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    const currentUrl = (profile?.avatar_url as string | null) ?? null;
    const knownPath = currentUrl
      ? avatarPathFromPublicUrl(currentUrl, user.id)
      : null;

    const { data: listed } = await supabase.storage
      .from(AVATAR_BUCKET)
      .list(user.id);
    const paths = new Set(
      (listed ?? []).map((obj) => `${user.id}/${obj.name}`),
    );
    if (knownPath) paths.add(knownPath);

    if (paths.size > 0) {
      const { error: removeError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .remove([...paths]);
      if (removeError) {
        throw new Error(`Failed to remove avatar: ${removeError.message}`);
      }
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", user.id);
    if (profileError) throw new Error(profileError.message);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "account_settings",
      action: "avatar_remove",
      entityType: "profile",
      entityId: user.id,
      afterData: { avatarUrl: null },
    });

    return jsonOk({ avatarUrl: null });
  } catch (error) {
    return handleApiError(error);
  }
}
