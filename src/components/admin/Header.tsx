"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { createClient } from "@/lib/supabase/client";

export type HeaderLink = {
  href: string;
  label: string;
  exact?: boolean;
};

/* ── Icons ───────────────────────────────────────────────────────────────── */

function Icon({ size = 15, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
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

const HomeIcon = (
  <Icon size={13}>
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </Icon>
);

const ChevronRightIcon = (
  <Icon size={12}>
    <polyline points="9 18 15 12 9 6" />
  </Icon>
);

const BellIcon = (
  <Icon size={16}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Icon>
);

const ChevronDownIcon = (
  <Icon size={13}>
    <polyline points="6 9 12 15 18 9" />
  </Icon>
);

const SettingsIcon = (
  <Icon size={14}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
);

const UserIcon = (
  <Icon size={14}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
);

const SignOutIcon = (
  <Icon size={14}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </Icon>
);

/* ── Breadcrumbs ─────────────────────────────────────────────────────────── */

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  admin: "Admin",
  roles: "Roles",
  users: "Users",
  config: "Config",
  "loan-types": "Loan Types",
  checklists: "Checklists",
  checks: "Checks",
  audit: "Audit",
  "email-test": "Email Test",
  reports: "Reports",
  borrower: "Borrower",
  agent: "Agent",
  csa: "CSA",
  cig: "CIG",
  committee: "Committee",
  lra: "LRA",
  ar: "AR",
  collector: "Collector",
  remedial: "Remedial",
  applications: "Applications",
  leads: "Leads",
  masterlist: "Masterlist",
  dcr: "DCR",
  documents: "Documents",
  sign: "Sign",
  profile: "Profile",
  new: "New",
};

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^\d+$/i;

function segmentLabel(segment: string) {
  if (ID_RE.test(segment)) return "Details";
  return (
    SEGMENT_LABELS[segment] ??
    segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 sm:block">
      <ol className="flex items-center gap-1.5 text-[12px]">
        <li>
          <Link
            href="/dashboard"
            title="Dashboard"
            className="flex items-center text-ink-faint transition-colors hover:text-ink"
          >
            {HomeIcon}
          </Link>
        </li>
        {segments.map((segment, i) => {
          const href = `/${segments.slice(0, i + 1).join("/")}`;
          const last = i === segments.length - 1;
          return (
            <li key={href} className="flex min-w-0 items-center gap-1.5">
              <span className="text-ink-faint/60">{ChevronRightIcon}</span>
              {last ? (
                <span className="truncate font-bold text-ink">{segmentLabel(segment)}</span>
              ) : (
                <Link
                  href={href}
                  className="truncate font-semibold text-ink-faint transition-colors hover:text-ink"
                >
                  {segmentLabel(segment)}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ── Header ──────────────────────────────────────────────────────────────── */

function initialsOf(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Header({
  title,
  links,
}: {
  title: string;
  links?: HeaderLink[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { permissions } = usePermissions();
  const displayName = permissions?.fullName ?? null;
  const email = permissions?.email ?? null;

  const [openMenu, setOpenMenu] = useState<"bell" | "profile" | null>(null);
  const menusRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on route change — adjusted during render rather than in
  // an effect, per https://react.dev/learn/you-might-not-need-an-effect
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpenMenu(null);
  }

  // Close dropdowns on outside click / Escape
  useEffect(() => {
    if (!openMenu) return;
    function onPointerDown(e: MouseEvent) {
      if (menusRef.current && !menusRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-neutral-0 px-4 sm:px-6">
      {/* Left — title, breadcrumbs, optional section tabs */}
      <div className="flex h-full min-w-0 items-center gap-4">
        <p className="hidden max-w-[180px] truncate text-sm font-bold text-ink lg:block">
          {title}
        </p>
        <span className="hidden h-5 w-px bg-neutral-200 lg:block" aria-hidden />
        <Breadcrumbs />
        {links && links.length > 0 ? (
          <>
            <span className="hidden h-5 w-px bg-neutral-200 sm:block" aria-hidden />
            <nav className="hidden h-full items-center gap-4 sm:flex">
              {links.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex h-full items-center border-b-2 text-[12.5px] font-semibold transition-colors ${
                      active
                        ? "border-gold-400 text-ink"
                        : "border-transparent text-ink-faint hover:text-ink-muted"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </>
        ) : null}
      </div>

      {/* Right — notifications + profile */}
      <div ref={menusRef} className="flex shrink-0 items-center gap-1">
        {/* Notification bell */}
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Notifications"
            aria-expanded={openMenu === "bell"}
            onClick={() => setOpenMenu(openMenu === "bell" ? null : "bell")}
            className={`relative h-9 w-9 shrink-0 rounded-lg px-0 ${
              openMenu === "bell" ? "bg-neutral-100 text-ink" : ""
            }`}
          >
            {BellIcon}
          </Button>

          {openMenu === "bell" ? (
            <div className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-neutral-200 bg-neutral-0 py-2 shadow-lg">
              <p className="border-b border-neutral-100 px-4 pb-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                Notifications
              </p>
              {/* Placeholder until notifications are wired up */}
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-ink-faint">
                  {BellIcon}
                </span>
                <p className="text-[13px] font-semibold text-ink-muted">No notifications yet</p>
                <p className="text-xs text-ink-faint">
                  Updates about applications and approvals will appear here.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Profile dropdown */}
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={openMenu === "profile"}
            onClick={() => setOpenMenu(openMenu === "profile" ? null : "profile")}
            className={`h-auto gap-2 rounded-lg py-1.5 pl-1.5 pr-2 font-semibold ${
              openMenu === "profile" ? "bg-neutral-100" : ""
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-[11px] font-bold text-navy-900">
              {displayName ? initialsOf(displayName) : "…"}
            </span>
            <span className="hidden max-w-[140px] truncate text-[12.5px] font-semibold text-ink sm:block">
              {displayName ?? "Loading…"}
            </span>
            <span className="hidden text-ink-faint sm:block">{ChevronDownIcon}</span>
          </Button>

          {openMenu === "profile" ? (
            <div className="absolute right-0 top-11 z-50 w-60 rounded-xl border border-neutral-200 bg-neutral-0 py-1.5 shadow-lg">
              <div className="border-b border-neutral-100 px-4 py-2.5">
                <p className="truncate text-[13px] font-bold text-ink">{displayName}</p>
                {email ? <p className="truncate text-xs text-ink-faint">{email}</p> : null}
              </div>
              <div className="p-1.5">
                <Link
                  href="/borrower/profile"
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-semibold text-ink-muted transition-colors hover:bg-neutral-100 hover:text-ink"
                >
                  {UserIcon}
                  Profile
                </Link>
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-ink-muted opacity-50"
                >
                  {SettingsIcon}
                  Settings
                </button>
              </div>
              <div className="border-t border-neutral-100 p-1.5">
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-danger-ink transition-colors hover:bg-danger-50"
                >
                  {SignOutIcon}
                  Sign out
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
