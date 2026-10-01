import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ applicationId: string }> };

/**
 * Notification deep-link target: workflow notifications only know the loan
 * application id, while the AR account page is keyed by masterlist id.
 * Falls back to the masterlist when no account exists yet.
 */
export default async function ArAccountByApplicationRedirect({ params }: PageProps) {
  const { applicationId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("masterlist")
    .select("id")
    .eq("loan_application_id", applicationId)
    .maybeSingle();

  redirect(data?.id ? `/ar/masterlist/${data.id}` : "/ar");
}
