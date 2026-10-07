import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/handler";
import {
  BUG_IMAGE_BUCKET,
  BUG_IMAGE_MAX_BYTES,
  BUG_IMAGE_MAX_COUNT,
  imageExtension,
  imageTypeFromBytes,
} from "@/lib/bug-reports/images";
import { bugReportSchema } from "@/lib/bug-reports/schema";
import { notifyUser } from "@/lib/notifications/write";
import { isSuperAdmin, requireAuth } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("bug_reports")
      .select("id, reporter_id, title, description, expected_behavior, location, error_message, severity, status, resolution_note, created_at, updated_at, bug_report_images(id, file_name)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    if (!(await isSuperAdmin(user.id))) return NextResponse.json({ reports: data ?? [] });

    const ids = [...new Set((data ?? []).map((report) => report.reporter_id))];
    if (ids.length === 0) return NextResponse.json({ reports: [] });
    const { data: profiles, error: profileError } = await createServiceClient()
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    if (profileError) throw new Error(profileError.message);
    const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    return NextResponse.json({
      reports: (data ?? []).map((report) => ({ ...report, reporter: byId.get(report.reporter_id) ?? null })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const form = await request.formData();
    const parsed = bugReportSchema.safeParse({
      title: form.get("title"),
      description: form.get("description"),
      expected_behavior: form.get("expected_behavior"),
      location: form.get("location"),
      error_message: form.get("error_message") ?? "",
      severity: form.get("severity"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Please complete the required fields within their length limits." }, { status: 400 });
    }

    const files = form.getAll("images");
    if (files.length > BUG_IMAGE_MAX_COUNT || files.some((file) => !(file instanceof File))) {
      return NextResponse.json({ error: "Attach no more than three images." }, { status: 400 });
    }
    const images: Array<{ bytes: Uint8Array<ArrayBuffer>; type: "image/jpeg" | "image/png" | "image/webp"; name: string }> = [];
    for (const file of files as File[]) {
      if (file.size === 0 || file.size > BUG_IMAGE_MAX_BYTES) {
        return NextResponse.json({ error: "Each image must be 5 MB or smaller." }, { status: 400 });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = imageTypeFromBytes(bytes);
      if (!type || type !== file.type) {
        return NextResponse.json({ error: "Images must be JPEG, PNG, or WebP files." }, { status: 400 });
      }
      images.push({ bytes, type, name: file.name.slice(0, 200) });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("bug_reports")
      .insert({ ...parsed.data, error_message: parsed.data.error_message || null, reporter_id: user.id })
      .select("id, reporter_id, title, description, expected_behavior, location, error_message, severity, status, resolution_note, created_at, updated_at, bug_report_images(id, file_name)")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Report could not be saved");

    const service = createServiceClient();
    const uploaded: string[] = [];
    const savedImages: Array<{ id: string; file_name: string }> = [];
    try {
      for (const image of images) {
        const path = `${user.id}/${data.id}/${crypto.randomUUID()}.${imageExtension(image.type)}`;
        const { error: uploadError } = await service.storage.from(BUG_IMAGE_BUCKET).upload(path, image.bytes, {
          contentType: image.type,
          upsert: false,
        });
        if (uploadError) throw new Error(uploadError.message);
        uploaded.push(path);
        const { data: savedImage, error: imageError } = await service.from("bug_report_images").insert({
          report_id: data.id,
          storage_path: path,
          file_name: image.name,
          content_type: image.type,
          byte_size: image.bytes.length,
        }).select("id, file_name").single();
        if (imageError || !savedImage) throw new Error(imageError?.message ?? "Image record could not be saved");
        savedImages.push(savedImage);
      }
    } catch (uploadError) {
      if (uploaded.length) await service.storage.from(BUG_IMAGE_BUCKET).remove(uploaded);
      await service.from("bug_reports").delete().eq("id", data.id);
      throw uploadError;
    }

    // Delivery is best effort: the saved report remains visible in the admin queue.
    try {
      const { data: role } = await service.from("roles").select("id").eq("slug", "super_admin").maybeSingle();
      if (role) {
        const { data: admins } = await service.from("user_roles").select("user_id").eq("role_id", role.id);
        await Promise.allSettled(
          [...new Set((admins ?? []).map((admin) => admin.user_id))].map((adminId) =>
            notifyUser({
              userId: adminId,
              title: "New bug report",
              body: data.title,
              link: "/admin/bug-reports",
              kind: "bug_report",
              entityType: "bug_report",
              entityId: data.id,
            }, service),
          ),
        );
      }
    } catch (notificationError) {
      console.error("Bug report saved but admin notification failed", notificationError);
    }
    return NextResponse.json({ report: { ...data, bug_report_images: savedImages } }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
