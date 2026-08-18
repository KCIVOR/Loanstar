"use client";

import { useEffect, useState, type ReactNode } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LoanStarLogo, LoanStarMark } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { usePermissions } from "@/hooks/usePermissions";
import {
  resolveActiveChildHref,
  type NavChildMatch,
} from "@/lib/nav/active-nav";
import { resolveHomePath } from "@/lib/permissions/home";
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
  dashboard: (
    <Icon>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </Icon>
  ),
  roles: (
    <Icon>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Icon>
  ),
  users: (
    <Icon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  ),
  config: (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Icon>
  ),
  loanTypes: (
    <Icon>
      <line x1="19" y1="5" x2="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </Icon>
  ),
  checklists: (
    <Icon>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="m9 14 2 2 4-4" />
    </Icon>
  ),
  checks: (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  ),
  docTemplates: (
    <Icon>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </Icon>
  ),
  audit: (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </Icon>
  ),
  reports: (
    <Icon>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </Icon>
  ),
  emailTest: (
    <Icon>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </Icon>
  ),
  borrower: (
    <Icon>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </Icon>
  ),
  leads: (
    <Icon>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </Icon>
  ),
  intake: (
    <Icon>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Icon>
  ),
  verification: (
    <Icon>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <path d="m8 11 2 2 4-4" />
    </Icon>
  ),
  committee: (
    <Icon>
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </Icon>
  ),
  release: (
    <Icon>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </Icon>
  ),
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
  collection: (
    <Icon>
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <path d="M7 6h1v4" />
      <path d="m16.71 13.88.7.71-2.82 2.82" />
    </Icon>
  ),
  remedial: (
    <Icon>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </Icon>
  ),
};

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
  { href: "/admin/document-templates", label: "Doc Templates", icon: "docTemplates", module: "system_config" },
  { href: "/admin/checks", label: "Checks", icon: "checks", module: "system_config" },
  { href: "/admin/audit", label: "Audit", icon: "audit", module: "audit_log" },
  { href: "/reports", label: "Reports", icon: "reports", module: "reports" },
  { href: "/admin/email-test", label: "Email Test", icon: "emailTest", module: "system_config" },
  { href: "/admin/email-templates", label: "Decision Emails", icon: "emailTest", module: "system_config" },
];

type PortalNavChild = NavChildMatch & {
  label: string;
};

type PortalNavItem = {
  href: string;
  label: string;
  icon: string;
  modules: ModuleSlug[];
  children?: PortalNavChild[];
};

const PORTAL_NAV_ITEMS: PortalNavItem[] = [
  { href: "/borrower", label: "Borrower Portal", icon: "borrower", modules: ["borrower_portal"] },
  {
    href: "/agent",
    label: "Leads",
    icon: "leads",
    modules: ["leads"],
    children: [
      {
        href: "/agent",
        label: "Leads pipeline",
        exact: true,
        matchPrefixes: ["/agent/leads"],
      },
      { href: "/agent/history", label: "Closed leads" },
    ],
  },

  {
    href: "/csa",
    label: "Intake",
    icon: "intake",
    modules: ["intake", "computation", "negotiation"],
    children: [
      {
        href: "/csa",
        label: "Intake list",
        exact: true,
        matchPrefixes: ["/csa/applications"],
      },
      { href: "/csa/leads", label: "Leads list" },
      { href: "/csa/history", label: "Application history" },
    ],
  },
  {
    href: "/cig",
    label: "Verification",
    icon: "verification",
    modules: ["verification"],
    children: [
      {
        href: "/cig",
        label: "Verification queue",
        exact: true,
        matchPrefixes: ["/cig/applications"],
      },
      { href: "/cig/denials", label: "Denial calls" },
      { href: "/cig/callbacks", label: "Scheduled callbacks" },
      { href: "/cig/history", label: "History" },
    ],
  },
  {
    href: "/committee",
    label: "Committee",
    icon: "committee",
    modules: ["committee"],
    children: [
      { href: "/committee", label: "Voting queue", exact: true },
      { href: "/committee/history", label: "Decision history" },
    ],
  },
  {
    href: "/lra",
    label: "Release (LRA)",
    icon: "release",
    modules: ["release_lra"],
    children: [
      { href: "/lra", label: "Release queue", exact: true, matchPrefixes: ["/lra/applications"] },
      { href: "/lra/history", label: "Released loans" },
    ],
  },
  {
    href: "/ar",
    label: "Accounting (AR)",
    icon: "accounting",
    modules: ["accounting_ar"],
    children: [
      { href: "/ar", label: "Masterlist", exact: true, matchPrefixes: ["/ar/masterlist"] },
      { href: "/ar/dcr", label: "DCRR queue" },
      { href: "/ar/history", label: "Posting history" },
      { href: "/ar/rounding-writeoffs", label: "Rounding write-offs" },
    ],
  },
  {
    href: "/collector",
    label: "Collection",
    icon: "collection",
    modules: ["collection"],
    children: [
      { href: "/collector", label: "Overview", exact: true },
      { href: "/collector/accounts", label: "Accounts" },
      { href: "/collector/proofs", label: "Payment proofs" },
      { href: "/collector/dcr", label: "DCRR" },
      { href: "/collector/dcr/history", label: "DCRR history" },
      { href: "/collector/history", label: "History" },
      { href: "/collector/closed-accounts", label: "Closed accounts" },
    ],
  },
  { href: "/collector/briefings", label: "Briefings", icon: "collection", modules: ["briefings"] },
  {
    href: "/remedial",
    label: "Remedial",
    icon: "remedial",
    modules: ["remedial"],
    children: [
      {
        href: "/remedial",
        label: "Recovery queue",
        exact: true,
        matchPrefixes: ["/remedial/accounts"],
      },
      { href: "/remedial/dcr", label: "DCRR" },
    ],
  },
];

function NavLink({
  href,
  label,
  icon,
  active,
  collapsed,
  onNavClick,
  child,
}: {
  href: string;
  label: string;
  icon?: string;
  active: boolean;
  collapsed: boolean;
  onNavClick?: () => void;
  child?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavClick}
      title={label}
      className={cn(
        "side-link",
        child && "side-link--child",
        active && "is-active",
        /* Center the 16px icon inside the visible 64px rail while width animates. */
        collapsed && !child && "lg:pl-6 lg:pr-0",
      )}
    >
      {icon ? ICONS[icon] : <span className="side-link-dot" aria-hidden />}
      <span
        className={cn(
          "truncate transition-opacity duration-200",
          collapsed && "lg:opacity-0",
        )}
      >
        {label}
      </span>
    </Link>
  );
}

function PortalNavGroup({
  item,
  pathname,
  collapsed,
  onNavClick,
}: {
  item: PortalNavItem;
  pathname: string;
  collapsed: boolean;
  onNavClick?: () => void;
}) {
  const inSection = pathname.startsWith(item.href);
  const hasChildren = Boolean(item.children?.length);
  const activeChildHref = hasChildren
    ? resolveActiveChildHref(pathname, item.children!)
    : null;
  /* When expanded with children, only the matching child is highlighted. */
  const parentActive = hasChildren
    ? collapsed && inSection
    : inSection;

  return (
    <div className="flex flex-col gap-0.5">
      <NavLink
        href={item.href}
        label={item.label}
        icon={item.icon}
        active={parentActive}
        collapsed={collapsed}
        onNavClick={onNavClick}
      />
      {hasChildren ? (
        <div
          className={cn(
            "mb-0.5 ml-3 flex flex-col gap-0.5 border-l border-navy-800 pl-1.5",
            collapsed && "lg:hidden",
          )}
        >
          {item.children!.map((child) => (
            <NavLink
              key={child.href + child.label}
              href={child.href}
              label={child.label}
              active={child.href === activeChildHref}
              collapsed={false}
              onNavClick={onNavClick}
              child
            />
          ))}
        </div>
      ) : null}
    </div>
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
  const { can, loading, permissions } = usePermissions();

  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      (!item.module || can(item.module, "view")) &&
      !(item.href === "/dashboard" && resolveHomePath(permissions) === "/borrower"),
  );

  const visiblePortalItems = PORTAL_NAV_ITEMS.filter((item) =>
    item.modules.some((mod) => can(mod, "view")),
  );

  return (
    /* Fixed inner width so collapse only clips — no per-frame text reflow. */
    <div className="flex h-full w-[236px] flex-col">
      <div className="relative flex h-14 shrink-0 items-center border-b border-navy-800">
        {/* Mark lives in the left 64px so it stays visible/centered while clipping */}
        <div
          className={cn(
            "absolute inset-y-0 left-0 hidden w-16 items-center justify-center transition-opacity duration-200 lg:flex",
            collapsed ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <LoanStarMark size={30} />
        </div>
        {/* Wordmark centered in full expanded width */}
        <div
          className={cn(
            "hidden h-full w-full items-center justify-center px-10 transition-opacity duration-200 lg:flex",
            collapsed ? "pointer-events-none opacity-0" : "opacity-100",
          )}
        >
          <LoanStarLogo height={34} className="max-w-[168px]" />
        </div>
        {/* Mobile drawer: always wordmark */}
        <div className="flex h-full w-full items-center justify-center px-3 lg:hidden">
          <LoanStarLogo height={34} className="max-w-[168px]" />
        </div>

        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-navy-200 transition-colors hover:bg-white/5 hover:text-white lg:flex",
            collapsed && "pointer-events-none opacity-0",
          )}
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
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="absolute inset-0 z-10 hidden lg:block"
          />
        ) : null}
      </div>

      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden p-2.5"
        style={{ scrollbarWidth: "none" }}
      >
        {!loading && visibleItems.length > 0 ? (
          <>
            <p className={cn("side-grp", collapsed && "lg:hidden")}>Main Menu</p>
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
          </>
        ) : null}

        {!loading && visiblePortalItems.length > 0 ? (
          <>
            <p className={cn("side-grp mt-2", collapsed && "lg:hidden")}>
              Your Portals
            </p>
            <div
              className={cn(
                "flex flex-col gap-0.5",
                collapsed && "lg:mt-4 lg:border-t lg:border-navy-800 lg:pt-4",
              )}
            >
              {visiblePortalItems.map((item) => (
                <PortalNavGroup
                  key={item.href}
                  item={item}
                  pathname={pathname}
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

const COLLAPSE_KEY = "loanstar.sidebar.collapsed";

function readCollapsedPreference() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function Sidebar({
  mobileOpen,
  onMobileOpenChange,
}: {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}) {
  // Start collapsed=false to match SSR output; the real preference is
  // applied after mount to avoid a hydration mismatch against localStorage.
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setCollapsed(readCollapsedPreference());
  }, []);

  useEffect(() => {
    onMobileOpenChange(false);
  }, [pathname, onMobileOpenChange]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  }

  return (
    <>
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-hidden
          onClick={() => onMobileOpenChange(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[236px] overflow-hidden border-r border-navy-800 bg-navy-950",
          "transition-transform duration-300 ease-out",
          "lg:static lg:z-auto lg:shrink-0 lg:translate-x-0",
          "lg:transition-[width] lg:duration-300 lg:ease-[cubic-bezier(0.22,1,0.36,1)]",
          collapsed ? "lg:w-[64px]" : "lg:w-[236px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          onNavClick={() => onMobileOpenChange(false)}
        />
      </aside>
    </>
  );
}
