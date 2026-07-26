import { handleApiError, jsonOk } from "@/lib/api/handler";
import { refreshMasterlistAging } from "@/lib/ar/posting";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireModulePermission("collection", "view");
    const supabase = await createClient();

    const { data: assignments } = await supabase
      .from("assignments")
      .select("masterlist_id")
      .eq("collector_user_id", user.id)
      .is("remedial_user_id", null);

    const ids = (assignments ?? []).map((a) => a.masterlist_id as string);
    if (!ids.length) {
      return jsonOk({ accounts: [] });
    }

    // Privileged aging refresh: amortization_schedules/masterlist/penalties
    // writes require accounting_ar:edit, which the collection role doesn't
    // have — refreshMasterlistAging must run under the service role or every
    // write here silently no-ops under RLS. Run it before the select below so
    // the response reflects the just-refreshed numbers, not stale ones.
    const admin = createServiceClient();
    for (const id of ids) {
      await refreshMasterlistAging(admin, id);
    }

    const { data, error } = await supabase
      .from("masterlist")
      .select(
        `
        *,
        amortization_schedules ( id, installment_no, due_date, amount_due, status, penalty_amount, rolled_at, rolled_into_installment_no )
      `,
      )
      .in("id", ids)
      .eq("remedial_flag", false)
      .order("first_payment_date");

    if (error) throw new Error(error.message);

    const { data: contacts } = await supabase
      .from("collector_contacts")
      .select("masterlist_id, contact_type, callback_at, created_at")
      .in("masterlist_id", ids)
      .order("created_at", { ascending: false });

    const lastContactByMasterlist = new Map<
      string,
      { contactType: string; callbackAt: string | null; createdAt: string }
    >();
    for (const row of contacts ?? []) {
      const id = row.masterlist_id as string;
      if (!lastContactByMasterlist.has(id)) {
        lastContactByMasterlist.set(id, {
          contactType: row.contact_type as string,
          callbackAt: row.callback_at as string | null,
          createdAt: row.created_at as string,
        });
      }
    }

    const accounts = (data ?? []).map((row) => ({
      ...row,
      lastContact: lastContactByMasterlist.get(row.id as string) ?? null,
    }));

    return jsonOk({ accounts });
  } catch (error) {
    return handleApiError(error);
  }
}
