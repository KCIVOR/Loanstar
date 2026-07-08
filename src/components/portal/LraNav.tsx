"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

const LINKS = [{ href: "/lra", label: "Release queue", exact: true }];

export function LraNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary-600 to-primary-700">
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                <path
                  d="M9 1.5L11.2 6.7 16.5 7.4 12.75 11.1 13.8 16.5 9 13.9 4.2 16.5 5.25 11.1 1.5 7.4 6.8 6.7z"
                  fill="white"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-extrabold text-neutral-900">LoanStar</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-role-lra">
                LRA — Release
              </p>
            </div>
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
                  className={`rounded-sm px-3 py-2 text-[13px] transition-colors ${
                    active
                      ? "bg-role-lra/10 font-semibold text-role-lra"
                      : "font-medium text-neutral-600 hover:bg-neutral-50"
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
          className="rounded-sm px-3 py-2 text-[13px] font-medium text-neutral-500 hover:bg-neutral-50"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
