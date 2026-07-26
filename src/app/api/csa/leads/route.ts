import { handleApiError, jsonOk } from "@/lib/api/handler";
import { isOpenUnlinkedLead } from "@/lib/csa/leads";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireModulePermission("intake", "view");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, borrower_name, business_name, agent_user_id, application_id, status, created_at",
      )
      .is("application_id", null)
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []).filter((row) =>
      isOpenUnlinkedLead({
        applicationId: row.application_id as string | null,
        status: row.status as string,
      }),
    );

    const agentIds = Array.from(
      new Set(
        rows
          .map((row) => row.agent_user_id as string)
          .filter(Boolean),
      ),
    );

    const nameById = new Map<string, string>();
    if (agentIds.length) {
      const admin = createServiceClient();
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", agentIds);
      for (const profile of profiles ?? []) {
        nameById.set(
          profile.id as string,
          (profile.full_name as string) || (profile.email as string),
        );
      }
    }

    const leads = rows.map((row) => ({
      id: row.id,
      borrowerName: row.borrower_name,
      businessName: row.business_name,
      agentUserId: row.agent_user_id,
      agentName: nameById.get(row.agent_user_id as string) ?? null,
      createdAt: row.created_at,
    }));

    return jsonOk({ leads });
  } catch (error) {
    return handleApiError(error);
  }
}
