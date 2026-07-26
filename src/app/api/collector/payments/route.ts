import { handleApiError, jsonOk } from "@/lib/api/handler";
import { paymentIdsLockedForCollectorDesk } from "@/lib/collector/desk";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const PAYMENT_SELECT = `
  id,
  reference_no,
  payment_date,
  amount,
  status,
  channel,
  masterlist_id,
  created_at,
  reviewed_at,
  storage_path,
  file_name,
  masterlist (
    borrower_name,
    loan_account_no
  )
`;

type Scope = "desk" | "dcr" | "history";

function parseScope(raw: string | null): Scope {
  if (raw === "dcr" || raw === "history") return raw;
  return "desk";
}

export async function GET(request: Request) {
  try {
    const user = await requireModulePermission("collection", "view");
    const supabase = await createClient();
    const scope = parseScope(new URL(request.url).searchParams.get("scope"));

    const { data: assignments } = await supabase
      .from("assignments")
      .select("masterlist_id")
      .eq("collector_user_id", user.id);

    const ids = (assignments ?? []).map((a) => a.masterlist_id as string);
    if (!ids.length) {
      return jsonOk({ payments: [] });
    }

    const statuses =
      scope === "history"
        ? ["pending_verification", "confirmed", "rejected", "posted"]
        : scope === "dcr"
          ? ["confirmed"]
          : ["pending_verification", "confirmed"];

    const { data, error } = await supabase
      .from("payments")
      .select(PAYMENT_SELECT)
      .in("masterlist_id", ids)
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(scope === "history" ? 200 : 100);

    if (error) throw new Error(error.message);

    const paymentIds = (data ?? []).map((p) => p.id as string);
    let locked = new Set<string>();
    let draftIds = new Set<string>();

    if (paymentIds.length && scope !== "history") {
      const { data: itemRows, error: itemError } = await supabase
        .from("dcr_items")
        .select("payment_id, dcr!inner ( status )")
        .in("payment_id", paymentIds);

      if (itemError) throw new Error(itemError.message);

      const mapped = (itemRows ?? []).map((row) => {
        const dcr = row.dcr as
          | { status: string }
          | { status: string }[]
          | null;
        const status = Array.isArray(dcr)
          ? (dcr[0]?.status ?? "")
          : (dcr?.status ?? "");
        return {
          payment_id: row.payment_id as string,
          dcr_status: status,
        };
      });

      locked = paymentIdsLockedForCollectorDesk(mapped);
      for (const row of mapped) {
        if (row.dcr_status.trim().toLowerCase() === "draft") {
          draftIds.add(row.payment_id);
        }
      }
    }

    let payments = data ?? [];

    if (scope === "desk") {
      payments = payments.filter((p) => !locked.has(p.id as string));
    } else if (scope === "dcr") {
      // Confirmed and not yet on submitted/reconciled; draft membership OK (In DCR).
      payments = payments.filter((p) => !locked.has(p.id as string));
    }

    return jsonOk({
      payments,
      draftPaymentIds: [...draftIds],
    });
  } catch (error) {
    return handleApiError(error);
  }
}
