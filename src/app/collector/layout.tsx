"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { CollectorNav } from "@/components/portal/CollectorNav";
import { Spinner } from "@/components/admin/ui";
import { createClient } from "@/lib/supabase/client";

export default function CollectorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }
      setChecking(false);
    }
    void checkAuth();
  }, [router, pathname]);

  if (checking) {
    return (
      <div className="flex min-h-full items-center justify-center bg-neutral-50">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-neutral-50">
      <CollectorNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
