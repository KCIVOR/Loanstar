import { handleApiError, jsonOk, ValidationError } from "@/lib/api/handler";
import { requireSuperAdmin } from "@/lib/legacy-import/server";
import { parseLegacyWorkbook } from "@/lib/legacy-import/server-workbook";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Safely opens an Excel file server-side for the import mapping screen. */
export async function POST(request: Request) {
  try {
    await requireSuperAdmin();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ValidationError("Choose an Excel file to upload.");
    if (file.size === 0) throw new ValidationError("The selected file is empty.");
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ValidationError("The selected file is too large. Upload a file smaller than 20 MB.");
    }

    const content = await file.arrayBuffer();
    console.info("Legacy import workbook received", {
      fileName: file.name,
      declaredBytes: file.size,
      receivedBytes: content.byteLength,
      contentType: file.type || "not supplied",
    });
    const workbook = await parseLegacyWorkbook(file.name, content);
    return jsonOk(workbook);
  } catch (error) {
    return handleApiError(error);
  }
}
