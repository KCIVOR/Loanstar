"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  Alert,
  Avatar,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  PhoneInput,
  Spinner,
  Toggle,
} from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import type { AccountPreferences } from "@/lib/account/types";

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

type AccountResponse = {
  fullName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  preferences: AccountPreferences;
  preferencesResolved?: AccountPreferences & {
    notifications: {
      inApp: boolean;
      email: boolean;
      sms: boolean;
    };
  };
  roles?: Array<{ slug: string; name: string }>;
};

type InboxItem = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export default function AccountPage() {
  const { refresh } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("Asia/Manila");
  const [locale, setLocale] = useState("en-PH");
  const [inAppNotifications, setInAppNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(true);
  const [roles, setRoles] = useState<Array<{ slug: string; name: string }>>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);

  const loadInbox = useCallback(async () => {
    const res = await fetch("/api/account/notifications?limit=30", {
      credentials: "include",
    });
    if (!res.ok) return;
    const body = (await res.json()) as { notifications?: InboxItem[] };
    setInbox(body.notifications ?? []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { credentials: "include" });
      const body = (await res.json().catch(() => null)) as
        | (AccountResponse & { error?: string })
        | null;
      if (!res.ok) {
        throw new Error(body?.error ?? "Failed to load account");
      }
      setFullName(body?.fullName ?? "");
      setEmail(body?.email ?? null);
      setPhone(body?.phone ?? "");
      setAvatarUrl(body?.avatarUrl ?? null);
      setTimezone(
        body?.preferencesResolved?.timezone ??
          body?.preferences?.timezone ??
          "Asia/Manila",
      );
      setLocale(
        body?.preferencesResolved?.locale ??
          body?.preferences?.locale ??
          "en-PH",
      );
      setInAppNotifications(
        body?.preferencesResolved?.notifications?.inApp ?? true,
      );
      setEmailNotifications(
        body?.preferencesResolved?.notifications?.email ?? true,
      );
      setSmsNotifications(
        body?.preferencesResolved?.notifications?.sms ?? true,
      );
      setRoles(body?.roles ?? []);
      await loadInbox();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account");
    } finally {
      setLoading(false);
    }
  }, [loadInbox]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAvatarUpload(file: File | null) {
    if (!file) return;
    setAvatarBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/account/avatar", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const body = (await res.json().catch(() => null)) as {
        avatarUrl?: string | null;
        error?: string;
      } | null;
      if (!res.ok) throw new Error(body?.error ?? "Failed to upload avatar");
      setAvatarUrl(body?.avatarUrl ?? null);
      setMessage("Avatar updated.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload avatar");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleAvatarRemove() {
    setAvatarBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/account/avatar", {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) throw new Error(body?.error ?? "Failed to remove avatar");
      setAvatarUrl(null);
      setMessage("Avatar removed.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove avatar");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim() ? phone.trim() : null,
          preferences: {
            timezone: timezone.trim() || undefined,
            locale: locale.trim() || undefined,
            notifications: {
              inApp: inAppNotifications,
              email: emailNotifications,
              sms: smsNotifications,
            },
          },
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | (AccountResponse & { error?: string })
        | null;
      if (!res.ok) {
        throw new Error(body?.error ?? "Failed to save account");
      }
      setFullName(body?.fullName ?? fullName);
      setPhone(body?.phone ?? "");
      setTimezone(body?.preferences?.timezone ?? timezone);
      setLocale(body?.preferences?.locale ?? locale);
      setInAppNotifications(
        body?.preferencesResolved?.notifications?.inApp ??
          body?.preferences?.notifications?.inApp ??
          inAppNotifications,
      );
      setEmailNotifications(
        body?.preferencesResolved?.notifications?.email ??
          body?.preferences?.notifications?.email ??
          emailNotifications,
      );
      setSmsNotifications(
        body?.preferencesResolved?.notifications?.sms ??
          body?.preferences?.notifications?.sms ??
          smsNotifications,
      );
      setMessage("Account saved.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Account"
        description="Your login identity and preferences. Loan application details stay on the borrower application profile."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {message ? (
        <div className="mb-4">
          <Alert variant="success">{message}</Alert>
        </div>
      ) : null}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        <Card>
          <h2 className="mb-4 text-base font-semibold text-ink-900">Avatar</h2>
          <div className="flex flex-wrap items-center gap-4">
            <Avatar
              src={avatarUrl}
              initials={initialsOf(fullName || email || "User")}
              size="lg"
              teal
            />
            <div className="flex flex-wrap gap-2">
              <input
                id="avatarFile"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={avatarBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  void handleAvatarUpload(file);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                loading={avatarBusy}
                onClick={() => document.getElementById("avatarFile")?.click()}
              >
                Upload photo
              </Button>
              {avatarUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={avatarBusy}
                  onClick={() => void handleAvatarRemove()}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-400">
            JPEG, PNG, or WebP · max 2MB · stored separately from loan documents
          </p>
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold text-ink-900">Identity</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="fullName">Display name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                maxLength={200}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email ?? ""} disabled readOnly />
              <p className="mt-1 text-xs text-ink-400">
                Managed by sign-in. Contact an admin to change email.
              </p>
            </div>
            {roles.length > 0 ? (
              <div className="sm:col-span-2">
                <Label>Roles</Label>
                <p className="text-sm text-ink-700">
                  {roles.map((r) => r.name).join(", ")}
                </p>
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-base font-semibold text-ink-900">Phone</h2>
          <p className="mb-3 text-xs text-ink-400">
            Account contact only — not the borrower KYC mobile on the application
            form.
          </p>
          <PhoneInput id="phone" value={phone} onChange={setPhone} />
        </Card>

        <Card id="notifications">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink-900">
              Notifications
            </h2>
            {inbox.some((n) => !n.readAt) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  void (async () => {
                    await fetch("/api/account/notifications", {
                      method: "PATCH",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ all: true }),
                    });
                    await loadInbox();
                  })();
                }}
              >
                Mark all read
              </Button>
            ) : null}
          </div>
          {inbox.length === 0 ? (
            <p className="text-sm text-ink-400">No notifications yet.</p>
          ) : (
            <ul className="space-y-3">
              {inbox.map((n) => (
                <li
                  key={n.id}
                  className="border-b border-[var(--line-soft)] pb-3 last:border-0 last:pb-0"
                >
                  <p
                    className={
                      n.readAt
                        ? "text-sm font-medium text-ink-700"
                        : "text-sm font-semibold text-ink-900"
                    }
                  >
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">{n.body}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-ink-400">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card id="preferences">
          <h2 className="mb-4 text-base font-semibold text-ink-900">
            Preferences
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="Asia/Manila"
              />
            </div>
            <div>
              <Label htmlFor="locale">Locale</Label>
              <Input
                id="locale"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                placeholder="en-PH"
              />
            </div>
            <div className="sm:col-span-2 space-y-3">
              <Toggle
                checked={inAppNotifications}
                onChange={setInAppNotifications}
                label="In-app notifications"
              />
              <Toggle
                checked={emailNotifications}
                onChange={setEmailNotifications}
                label="Email notifications"
              />
              <Toggle
                checked={smsNotifications}
                onChange={setSmsNotifications}
                label="SMS notifications"
              />
              <p className="text-xs text-ink-400">
                Off means we skip that channel for payment reminders and denial
                email when your account is claimed. Missing preferences still
                send (fail-open). Contacts stay on the borrower application
                profile; admin test SMS always bypasses these toggles.
              </p>
            </div>
          </div>
        </Card>

        <Button type="submit" loading={saving}>
          Save account
        </Button>
      </form>
    </div>
  );
}
