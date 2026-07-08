"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

const LINKS = [{ href: "/reports", label: "Executive dashboard", exact: true }];

export function ReportsNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-6">
          <div>
            <p className="text-sm font-semibold text-zinc-900">LoanStar</p>
            <p className="text-xs text-zinc-500">Reports</p>
          </div>
          <nav className="hidden items-center gap-1 sm:flex">
            {LINKS.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-zinc-900 font-medium text-white"
                      : "text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
