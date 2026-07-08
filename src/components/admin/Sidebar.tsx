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
    <aside className="flex w-[216px] shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white">
      <div className="border-b border-neutral-100 px-[18px] py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary-600 to-primary-700">
            <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
              <path
                d="M9 1.5L11.2 6.7 16.5 7.4 12.75 11.1 13.8 16.5 9 13.9 4.2 16.5 5.25 11.1 1.5 7.4 6.8 6.7z"
                fill="white"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-extrabold text-neutral-900">LoanStar</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Admin Portal
            </p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-2.5">
        <p className="px-2 py-1.5 text-[9.5px] font-bold uppercase tracking-widest text-neutral-400">
          Main Menu
        </p>
        {NAV_ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-[5px] px-2 py-[7px] text-[13px] transition-colors ${
                active
                  ? "bg-primary-50 font-semibold text-primary-600"
                  : "font-medium text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-neutral-100 p-3">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="w-full rounded-[5px] px-2 py-2 text-left text-[13px] font-medium text-neutral-600 hover:bg-neutral-50"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
