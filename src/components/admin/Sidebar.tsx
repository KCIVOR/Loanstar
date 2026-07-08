"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { usePermissions } from "@/hooks/usePermissions";
import type { ModuleSlug } from "@/lib/permissions/types";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  exact?: boolean;
  module?: ModuleSlug;
}> = [
  { href: "/dashboard", label: "Dashboard", exact: true },
  { href: "/admin/roles", label: "Roles", module: "auth_admin" },
  { href: "/admin/users", label: "Users", module: "auth_admin" },
  { href: "/admin/config", label: "Config", module: "system_config" },
  { href: "/admin/loan-types", label: "Loan Types", module: "system_config" },
  { href: "/admin/checklists", label: "Checklists", module: "system_config" },
  { href: "/admin/checks", label: "Checks", module: "system_config" },
  { href: "/admin/audit", label: "Audit", module: "audit_log" },
  { href: "/reports", label: "Reports", module: "reports" },
  { href: "/admin/email-test", label: "Email Test", module: "system_config" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { can, loading } = usePermissions();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.module || can(item.module, "view"),
  );

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-[216px] shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-primary-900">
      <div className="border-b border-white/10 px-[18px] py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary-800 to-primary-900">
            <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
              <path
                d="M9 1.5L11.2 6.7 16.5 7.4 12.75 11.1 13.8 16.5 9 13.9 4.2 16.5 5.25 11.1 1.5 7.4 6.8 6.7z"
                fill="var(--color-gold)"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-extrabold text-brand-red">LoanStar</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-primary-300">
              Admin Portal
            </p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-2.5">
        <p className="px-2 py-1.5 text-[9.5px] font-bold uppercase tracking-widest text-primary-300">
          Main Menu
        </p>
        {loading ? null : visibleItems.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-[5px] px-2 py-[7px] text-[13px] transition-colors ${
                active
                  ? "bg-white/10 font-semibold text-gold"
                  : "font-medium text-primary-100 hover:bg-white/5"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="w-full rounded-[5px] px-2 py-2 text-left text-[13px] font-medium text-primary-100 hover:bg-white/5"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
