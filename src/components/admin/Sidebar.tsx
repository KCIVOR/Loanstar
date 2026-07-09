"use client";

import { useEffect, useState, type ReactNode } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LoanStarMark } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import type { ModuleSlug } from "@/lib/permissions/types";

/* ── Icons (Lucide-style, stroke = currentColor) ────────────────────────── */

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  // Dashboard — grid of panels
  dashboard: (
    <Icon>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </Icon>
  ),
  // Roles — shield (access control)
  roles: (
    <Icon>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Icon>
  ),
  // Users — two people
  users: (
    <Icon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  ),
  // Config — gear
  config: (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Icon>
  ),
  // Loan Types — percent (rates)
  loanTypes: (
    <Icon>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </Icon>
  ),
  // Checklists — clipboard with check
  checklists: (
    <Icon>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="m9 14 2 2 4-4" />
    </Icon>
  ),
  // Checks — circle check
  checks: (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  ),
  // Audit — clock history
  audit: (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </Icon>
  ),
  // Reports — bar chart
  reports: (
    <Icon>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </Icon>
  ),
  // Email Test — envelope
  emailTest: (
    <Icon>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </Icon>
  ),
  // Borrower Portal — wallet
  borrower: (
    <Icon>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </Icon>
  ),
  // Leads — user plus
  leads: (
    <Icon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </Icon>
  ),
  // Intake — inbox tray
  intake: (
    <Icon>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Icon>
  ),
  // Verification — magnifier with check
  verification: (
    <Icon>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <path d="m8 11 2 2 4-4" />
    </Icon>
  ),
  // Committee — scale (decisions)
  committee: (
    <Icon>
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </Icon>
  ),
  // Release (LRA) — send
  release: (
    <Icon>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </Icon>
  ),
  // Accounting (AR) — calculator
  accounting: (
    <Icon>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="6" x2="16" y2="6" />
      <line x1="8" y1="12" x2="8" y2="12.01" />
      <line x1="12" y1="12" x2="12" y2="12.01" />
      <line x1="16" y1="12" x2="16" y2="12.01" />
      <line x1="8" y1="16" x2="8" y2="16.01" />
      <line x1="12" y1="16" x2="12" y2="16.01" />
      <line x1="16" y1="16" x2="16" y2="18" />
    </Icon>
  ),
  // Collection — coins
  collection: (
    <Icon>
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <path d="M7 6h1v4" />
      <path d="m16.71 13.88.7.71-2.82 2.82" />
    </Icon>
  ),
  // Remedial — alert triangle
  remedial: (
    <Icon>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </Icon>
  ),
};

/* ── Nav definitions ─────────────────────────────────────────────────────── */

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  module?: ModuleSlug;
}> = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true },
  { href: "/admin/roles", label: "Roles", icon: "roles", module: "auth_admin" },
  { href: "/admin/users", label: "Users", icon: "users", module: "auth_admin" },
  { href: "/admin/config", label: "Config", icon: "config", module: "system_config" },
  { href: "/admin/loan-types", label: "Loan Types", icon: "loanTypes", module: "system_config" },
  { href: "/admin/checklists", label: "Checklists", icon: "checklists", module: "system_config" },
  { href: "/admin/checks", label: "Checks", icon: "checks", module: "system_config" },
  { href: "/admin/audit", label: "Audit", icon: "audit", module: "audit_log" },
  { href: "/reports", label: "Reports", icon: "reports", module: "reports" },
  { href: "/admin/email-test", label: "Email Test", icon: "emailTest", module: "system_config" },
];

// Business-process modules live in their own role portals (separate route
// trees), not under /admin. Surface a link here too so a module granted view
// access is actually reachable from the sidebar.
const PORTAL_NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: string;
  modules: ModuleSlug[];
}> = [
  { href: "/borrower", label: "Borrower Portal", icon: "borrower", modules: ["borrower_portal"] },
  { href: "/agent", label: "Leads", icon: "leads", modules: ["leads"] },
  { href: "/csa", label: "Intake", icon: "intake", modules: ["intake", "computation", "negotiation"] },
  { href: "/cig", label: "Verification", icon: "verification", modules: ["verification"] },
  { href: "/committee", label: "Committee", icon: "committee", modules: ["committee"] },
  { href: "/lra", label: "Release (LRA)", icon: "release", modules: ["release_lra"] },
  { href: "/ar", label: "Accounting (AR)", icon: "accounting", modules: ["accounting_ar"] },
  { href: "/collector", label: "Collection", icon: "collection", modules: ["collection"] },
  { href: "/remedial", label: "Remedial", icon: "remedial", modules: ["remedial"] },
];

/* ── Sidebar content ─────────────────────────────────────────────────────── */

function NavLink({
  href,
  label,
  icon,
  active,
  collapsed,
  onNavClick,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  collapsed: boolean;
  onNavClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavClick}
      title={label}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] transition-colors ${
        collapsed ? "lg:justify-center lg:px-0" : ""
      } ${
        active
          ? "bg-gold-tint font-bold text-cream"
          : "font-semibold text-navy-muted hover:bg-white/5 hover:text-cream"
      }`}
    >
      {ICONS[icon]}
      <span className={collapsed ? "lg:hidden" : ""}>{label}</span>
    </Link>
  );
}

function SidebarContent({
  collapsed,
  onToggleCollapsed,
  onNavClick,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavClick?: () => void;
}) {
  const pathname = usePathname();
  const { can, loading } = usePermissions();

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.module || can(item.module, "view"),
  );

  const visiblePortalItems = PORTAL_NAV_ITEMS.filter((item) =>
    item.modules.some((mod) => can(mod, "view")),
  );

  return (
    <div className="flex h-full flex-col">
      {/* Sticky logo header — aligned with the main Header (h-14) */}
      <div
        className={`flex h-14 shrink-0 items-center border-b border-navy-border px-4 ${
          collapsed ? "lg:justify-center lg:px-0" : "justify-between"
        }`}
      >
        <div className={`flex items-center gap-2.5 px-1.5 ${collapsed ? "lg:hidden" : ""}`}>
          <LoanStarMark size={28} />
          <div>
            <p className="font-display text-sm font-semibold text-cream">LoanStar</p>
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-navy-subtle">
              Staff console
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-navy-subtle transition-colors hover:bg-white/5 hover:text-cream lg:flex"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {/* Scrollable nav (scrollbar hidden) */}
      <nav className="flex-1 overflow-y-auto scrollbar-hide p-2.5">
        <p
          className={`px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-widest text-navy-subtle ${
            collapsed ? "lg:hidden" : ""
          }`}
        >
          Main Menu
        </p>
        {loading ? (
          <div className="flex flex-col gap-0.5" aria-hidden>
            {NAV_ITEMS.map((item) => (
              <div key={item.href} className="px-3 py-2">
                <div className="h-[17px] w-24 animate-pulse rounded bg-white/10" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {visibleItems.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={active}
                  collapsed={collapsed}
                  onNavClick={onNavClick}
                />
              );
            })}
          </div>
        )}

        {!loading && visiblePortalItems.length > 0 ? (
          <>
            <p
              className={`mt-4 px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-widest text-navy-subtle ${
                collapsed ? "lg:hidden" : ""
              }`}
            >
              Your Portals
            </p>
            <div className={`flex flex-col gap-0.5 ${collapsed ? "lg:mt-4 lg:border-t lg:border-navy-border lg:pt-4" : ""}`}>
              {visiblePortalItems.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={pathname.startsWith(item.href)}
                  collapsed={collapsed}
                  onNavClick={onNavClick}
                />
              ))}
            </div>
          </>
        ) : null}
      </nav>
    </div>
  );
}

/* ── Sidebar shell (mobile drawer + desktop rail) ────────────────────────── */

const COLLAPSE_KEY = "loanstar.sidebar.collapsed";

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Restore collapse preference (after mount, to avoid hydration mismatch)
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSE_KEY, prev ? "0" : "1");
      return !prev;
    });
  }

  return (
    <>
      {/* ── Mobile top bar (hidden on lg+) ── */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-navy-border bg-navy-900 px-4 lg:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-cream hover:bg-white/10"
        >
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden>
            <rect y="0" width="18" height="2" rx="1" fill="currentColor" />
            <rect y="6" width="18" height="2" rx="1" fill="currentColor" />
            <rect y="12" width="18" height="2" rx="1" fill="currentColor" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <LoanStarMark size={28} />
          <span className="font-display text-sm font-semibold text-cream">LoanStar</span>
        </div>
        {/* spacer to center logo */}
        <div className="w-9" />
      </header>

      {/* ── Backdrop (mobile only) ── */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-hidden
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      {/* ── Sidebar panel ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-[236px] border-r border-navy-border bg-navy-900
          transition-transform duration-300 ease-in-out
          lg:static lg:z-auto lg:shrink-0 lg:translate-x-0
          lg:transition-[width] lg:duration-200
          ${collapsed ? "lg:w-[64px]" : "lg:w-[236px]"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <SidebarContent
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          onNavClick={() => setMobileOpen(false)}
        />
      </aside>
    </>
  );
}
