import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/handler";
import { BUG_IMAGE_BUCKET } from "@/lib/bug-reports/images";
import { requireAuth } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
) {
  try {
    await requireAuth();
    const { id, imageId } = await params;
    const supabase = await createClient();
    // Both queries use RLS: only the reporter and super admins can read a report's images.
    const { data: image, error } = await supabase
      .from("bug_report_images")
      .select("storage_path")
      .eq("id", imageId)
      .eq("report_id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!image) return NextResponse.json({ error: "Image not found" }, { status: 404 });

    const { data, error: signError } = await createServiceClient().storage
      .from(BUG_IMAGE_BUCKET)
      .createSignedUrl(image.storage_path, 60);
    if (signError || !data) throw new Error(signError?.message ?? "Image unavailable");
    return NextResponse.redirect(data.signedUrl, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
