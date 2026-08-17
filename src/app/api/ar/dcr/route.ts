import { handleApiError, jsonOk } from "@/lib/api/handler";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    await requireModulePermission("accounting_ar", "view");
    const supabase = await createClient();
    const status =
      new URL(request.url).searchParams.get("status") === "rejected"
        ? "rejected"
        : "submitted";

    const { data, error } = await supabase
      .from("dcr")
      .select(
        `
        *,
        dcr_items (
          id,
          amount,
          payments (
            id,
            reference_no,
            payment_date,
            amount,
            masterlist_id,
            storage_path,
            file_name,
            notes,
            masterlist ( borrower_name, loan_account_no, segment )
          )
        )
      `,
      )
      .eq("status", status)
      .order(status === "rejected" ? "rejected_at" : "submitted_at", {
        ascending: status !== "rejected",
      });

    if (error) throw new Error(error.message);

    // `profiles` RLS only allows reading your own row — AR can't otherwise
    // see who submitted a DCRR (same gap fixed elsewhere for CIG/Committee).
    const collectorIds = Array.from(
      new Set((data ?? []).map((row) => row.collector_user_id as string)),
    );
    const nameById = new Map<string, string>();
    if (collectorIds.length) {
      const admin = createServiceClient();
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name")
        .in("id", collectorIds);
      for (const p of profiles ?? []) {
        nameById.set(p.id as string, (p.full_name as string | null) ?? "");
      }
    }

    const dcrQueue = (data ?? []).map((row) => ({
      ...row,
      // Rejected DCRs have their `dcr_items` deleted (frees the payment for
      // re-batching) — the display data lives in `rejected_items` instead.
      dcr_items:
        status === "rejected"
          ? ((row.rejected_items as unknown[]) ?? [])
          : row.dcr_items,
      collector_name: nameById.get(row.collector_user_id as string) ?? null,
    }));

    return jsonOk({ dcrQueue, status });
  } catch (error) {
    return handleApiError(error);
  }
}
