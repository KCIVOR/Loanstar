import { z } from "zod";

import {
  mergeAccountPreferences,
  pickAccountSelfPatch,
  preparePreferencesResponse,
} from "@/lib/account/preferences";
import { resolveDisplayName } from "@/lib/account/display-name";
import { syncDisplayName } from "@/lib/account/sync-display-name";
import type { AccountPreferences } from "@/lib/account/types";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import {
  getUserPermissions,
  requireAuth,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const patchSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  phone: z.string().max(30).nullable().optional(),
  preferences: z
    .object({
      timezone: z.string().max(100).optional(),
      locale: z.string().max(40).optional(),
      notifications: z
        .object({
          inApp: z.boolean().optional(),
          email: z.boolean().optional(),
          sms: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

export async function GET() {
  try {
    const user = await requireAuth();
    const permissions = await getUserPermissions(user.id);
    const supabase = await createClient();

    const [{ data: profile, error }, { data: roleRows }] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email, phone, avatar_url, preferences")
        .eq("id", user.id)
        .single(),
      supabase
        .from("user_roles")
        .select("roles ( slug, name )")
        .eq("user_id", user.id),
    ]);

    if (error || !profile) {
      throw new Error(error?.message ?? "Profile not found");
    }

    const fullName = resolveDisplayName(
      profile.full_name as string | null,
      user.user_metadata?.full_name as string | undefined,
      user.email,
    );

    const roles = (roleRows ?? []).flatMap((row) => {
      const role = row.roles as
        | { slug: string; name: string }
        | { slug: string; name: string }[]
        | null;
      if (!role) return [];
      const list = Array.isArray(role) ? role : [role];
      return list.map((r) => ({ slug: r.slug, name: r.name }));
    });

    const prefs = preparePreferencesResponse(
      (profile.preferences ?? {}) as AccountPreferences,
    );

    return jsonOk({
      fullName,
      email: user.email ?? (profile.email as string | null),
      phone: (profile.phone as string | null) ?? null,
      avatarUrl: (profile.avatar_url as string | null) ?? null,
      /** Raw DB value — no channel-key backfill. */
      preferences: prefs.stored,
      /** In-memory defaults for UI (not persisted by GET). */
      preferencesResolved: prefs.resolved,
      roles,
      isSuperAdmin: permissions.isSuperAdmin,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuth();
    const raw = patchSchema.parse(await request.json());
    const body = pickAccountSelfPatch(raw as Record<string, unknown>);
    const supabase = await createClient();

    const { data: existing, error: loadError } = await supabase
      .from("profiles")
      .select("full_name, phone, preferences")
      .eq("id", user.id)
      .single();

    if (loadError || !existing) {
      throw new Error(loadError?.message ?? "Profile not found");
    }

    const nextPreferences =
      body.preferences !== undefined
        ? mergeAccountPreferences(
            (existing.preferences ?? {}) as AccountPreferences,
            body.preferences,
            // Phase 6: email/sms channel keys may persist from Account UI.
            { allowChannelKeys: true },
          )
        : undefined;

    const profilePatch: Record<string, unknown> = {};
    if (body.phone !== undefined) profilePatch.phone = body.phone;
    if (nextPreferences !== undefined) {
      profilePatch.preferences = nextPreferences;
    }

    const didChange =
      body.fullName !== undefined || Object.keys(profilePatch).length > 0;

    if (body.fullName !== undefined) {
      await syncDisplayName(user.id, body.fullName);
    }

    if (Object.keys(profilePatch).length > 0) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update(profilePatch)
        .eq("id", user.id);
      if (updateError) throw new Error(updateError.message);
    }

    const { data: after, error: afterError } = await supabase
      .from("profiles")
      .select("full_name, email, phone, avatar_url, preferences")
      .eq("id", user.id)
      .single();

    if (afterError || !after) {
      throw new Error(afterError?.message ?? "Failed to reload profile");
    }

    const fullName = resolveDisplayName(
      after.full_name as string | null,
      body.fullName ?? (user.user_metadata?.full_name as string | undefined),
      user.email,
    );

    const prefs = preparePreferencesResponse(
      (after.preferences ?? {}) as AccountPreferences,
    );

    if (didChange) {
      await writeAuditEvent({
        actorId: user.id,
        moduleSlug: "account_settings",
        action: "update",
        entityType: "profile",
        entityId: user.id,
        beforeData: {
          fullName: existing.full_name,
          phone: existing.phone,
          preferences: existing.preferences,
        },
        afterData: {
          fullName: after.full_name,
          phone: after.phone,
          preferences: after.preferences,
        },
      });
    }

    return jsonOk({
      fullName,
      email: user.email ?? (after.email as string | null),
      phone: (after.phone as string | null) ?? null,
      avatarUrl: (after.avatar_url as string | null) ?? null,
      preferences: prefs.stored,
      preferencesResolved: prefs.resolved,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
