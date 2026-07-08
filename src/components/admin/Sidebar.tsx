"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS: Array<{ href: string; label: string; exact?: boolean }> = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/roles", label: "Roles" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/config", label: "Config" },
  { href: "/admin/loan-types", label: "Loan Types" },
  { href: "/admin/checklists", label: "Checklists" },
  { href: "/admin/checks", label: "Checks" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/reports", label: "Reports" },
  { href: "/admin/email-test", label: "Email Test" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50">
      <div className="border-b border-zinc-200 px-4 py-5">
        <p className="text-sm font-semibold tracking-tight text-zinc-900">
          LoanStar
        </p>
        <p className="text-xs text-zinc-500">Super Admin</p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV_ITEMS.map((item) => {
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
                  : "text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-200 p-3">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-200"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
