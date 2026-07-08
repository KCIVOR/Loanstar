"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PortalNav } from "@/components/portal/PortalNav";
import { Spinner } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login?redirect=/agent");
        return;
      }
      setChecking(false);
    }
    void checkAuth();
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-full items-center justify-center bg-zinc-50">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-zinc-50">
      <PortalNav portal="agent" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
