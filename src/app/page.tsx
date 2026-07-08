import { redirect } from "next/navigation";

import { isSuperAdmin } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const superAdmin = await isSuperAdmin(user.id);
  if (superAdmin) {
    redirect("/admin");
  }

  redirect("/login");
}
