"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Avatar, Button } from "@/components/ui";
import { cn } from "@/components/ui/cn";
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
  account: "Account",
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
  accounts: "Accounts",
  "past-due": "Past due",
  collections: "Collections",
  pipeline: "Pipeline",
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
  dcr: "DCRR",
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
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-[12px]">
        <li>
          <Link
            href="/dashboard"
            title="Dashboard"
            className="flex items-center text-ink-400 transition-colors hover:text-ink-700"
          >
            {HomeIcon}
          </Link>
        </li>
        {segments.map((segment, i) => {
          const href = `/${segments.slice(0, i + 1).join("/")}`;
          const last = i === segments.length - 1;
          return (
            <li key={href} className="flex min-w-0 items-center gap-1.5">
              <span className="text-ink-300">{ChevronRightIcon}</span>
              {last ? (
                <span className="truncate font-semibold text-ink-900">{segmentLabel(segment)}</span>
              ) : (
                <Link
                  href={href}
                  className="truncate font-medium text-ink-400 transition-colors hover:text-ink-700"
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
  onOpenNav,
}: {
  title: string;
  links?: HeaderLink[];
  onOpenNav?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { permissions } = usePermissions();
  const displayName = permissions?.fullName ?? null;
  const email = permissions?.email ?? null;
  const avatarUrl = permissions?.avatarUrl ?? null;

  const [openMenu, setOpenMenu] = useState<"bell" | "profile" | null>(null);
  const menusRef = useRef<HTMLDivElement>(null);
  const [notifItems, setNotifItems] = useState<
    Array<{
      id: string;
      title: string;
      body: string;
      link: string | null;
      readAt: string | null;
      createdAt: string;
    }>
  >([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);

  async function loadNotifications() {
    setNotifLoading(true);
    try {
      const res = await fetch("/api/account/notifications?limit=8", {
        credentials: "include",
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        notifications?: typeof notifItems;
        unreadCount?: number;
      };
      setNotifItems(body.notifications ?? []);
      setUnreadCount(body.unreadCount ?? 0);
    } finally {
      setNotifLoading(false);
    }
  }

  async function markAllNotificationsRead() {
    await fetch("/api/account/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setNotifItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
  }

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpenMenu(null);
  }

  useEffect(() => {
    if (!permissions?.userId) return;
    void (async () => {
      try {
        const res = await fetch("/api/account/notifications?limit=1", {
          credentials: "include",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { unreadCount?: number };
        setUnreadCount(body.unreadCount ?? 0);
      } catch {
        /* ignore badge fetch errors */
      }
    })();
  }, [permissions?.userId]);

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
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line-soft bg-surface px-4 sm:px-6">
      {/* Left — mobile menu + title / breadcrumbs / optional section tabs */}
      <div className="flex h-full min-w-0 items-center gap-3">
        {onOpenNav ? (
          <button
            type="button"
            aria-label="Open navigation"
            onClick={onOpenNav}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-700 transition-colors hover:bg-surface-2 lg:hidden"
          >
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden>
              <rect y="0" width="18" height="2" rx="1" fill="currentColor" />
              <rect y="6" width="18" height="2" rx="1" fill="currentColor" />
              <rect y="12" width="18" height="2" rx="1" fill="currentColor" />
            </svg>
          </button>
        ) : null}
        <p className="hidden max-w-[180px] truncate font-display text-sm font-semibold text-navy-900 lg:block">
          {title}
        </p>
        <span className="hidden h-5 w-px bg-line-soft lg:block" aria-hidden />
        <Breadcrumbs />
        {links && links.length > 0 ? (
          <>
            <span className="hidden h-5 w-px bg-line-soft sm:block" aria-hidden />
            <nav className="hidden h-full items-center gap-4 sm:flex">
              {links.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex h-full items-center border-b-2 text-[12.5px] font-semibold transition-colors",
                      active
                        ? "border-teal-600 text-ink-900"
                        : "border-transparent text-ink-400 hover:text-ink-700",
                    )}
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
            onClick={() => {
              const next = openMenu === "bell" ? null : "bell";
              setOpenMenu(next);
              if (next === "bell") void loadNotifications();
            }}
            className={cn(
              "relative h-9 w-9 shrink-0 rounded-lg px-0",
              openMenu === "bell" && "bg-surface-2 text-ink-900",
            )}
          >
            {BellIcon}
            {unreadCount > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </Button>

          {openMenu === "bell" ? (
            <div className="menu absolute right-0 top-11 z-50 w-80">
              <div className="flex items-center justify-between px-3 pb-2 pt-1">
                <p className="font-mono text-[10.5px] font-normal uppercase tracking-[0.14em] text-ink-400 opacity-70">
                  Notifications
                </p>
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-teal-700"
                    onClick={() => void markAllNotificationsRead()}
                  >
                    Mark all read
                  </button>
                ) : null}
              </div>
              <hr />
              {notifLoading ? (
                <p className="px-4 py-6 text-center text-xs text-ink-400">
                  Loading…
                </p>
              ) : notifItems.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-400">
                    {BellIcon}
                  </span>
                  <p className="text-[13px] font-semibold text-ink-700">
                    No notifications yet
                  </p>
                  <p className="text-xs text-ink-400">
                    Updates about applications and approvals will appear here.
                  </p>
                </div>
              ) : (
                <ul className="max-h-80 overflow-y-auto py-1">
                  {notifItems.map((n) => (
                    <li key={n.id}>
                      {n.link ? (
                        <Link
                          href={n.link}
                          className="mi block px-3 py-2"
                          onClick={() => setOpenMenu(null)}
                        >
                          <p
                            className={cn(
                              "text-[13px]",
                              n.readAt
                                ? "font-medium text-ink-700"
                                : "font-semibold text-ink-900",
                            )}
                          >
                            {n.title}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-ink-400">
                            {n.body}
                          </p>
                        </Link>
                      ) : (
                        <div className="px-3 py-2">
                          <p
                            className={cn(
                              "text-[13px]",
                              n.readAt
                                ? "font-medium text-ink-700"
                                : "font-semibold text-ink-900",
                            )}
                          >
                            {n.title}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-ink-400">
                            {n.body}
                          </p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <hr />
              <div style={{ padding: "6px" }}>
                <Link
                  href="/account#notifications"
                  className="mi flex w-full items-center justify-center text-[12.5px] font-semibold"
                  onClick={() => setOpenMenu(null)}
                >
                  View all
                </Link>
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
            className={cn(
              "h-auto gap-2 rounded-lg py-1.5 pl-1.5 pr-2 font-semibold",
              openMenu === "profile" && "bg-surface-2",
            )}
          >
            {avatarUrl ? (
              <Avatar
                src={avatarUrl}
                initials={displayName ? initialsOf(displayName) : "…"}
                size="sm"
              />
            ) : (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-teal-700 font-display text-[11px] font-bold text-white">
                {displayName ? initialsOf(displayName) : "…"}
              </span>
            )}
            <span className="hidden max-w-[140px] truncate text-[12.5px] font-semibold text-ink-700 sm:block">
              {displayName ?? "Loading…"}
            </span>
            <span className="hidden text-ink-400 sm:block">{ChevronDownIcon}</span>
          </Button>

          {openMenu === "profile" ? (
            <div className="menu absolute right-0 top-11 z-50 w-60">
              <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid var(--line-soft)" }}>
                <p className="truncate text-[13px] font-semibold text-ink-900">{displayName}</p>
                {email ? <p className="truncate text-xs text-ink-400">{email}</p> : null}
              </div>
              <div style={{ padding: "6px" }}>
                <Link href="/account" className="mi flex items-center gap-2.5">
                  {UserIcon}
                  Account
                </Link>
                <Link
                  href="/account#preferences"
                  className="mi flex items-center gap-2.5"
                >
                  {SettingsIcon}
                  Settings
                </Link>
              </div>
              <hr />
              <div style={{ padding: "6px" }}>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="mi danger flex w-full items-center gap-2.5"
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
