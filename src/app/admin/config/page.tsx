"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  PhoneInput,
  Spinner,
} from "@/components/ui";

type Setting = {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
};

export default function ConfigPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingSms, setTestingSms] = useState(false);

  const [penaltyRate, setPenaltyRate] = useState("");
  const [penaltyRateSme, setPenaltyRateSme] = useState("");
  const [coverageRatio, setCoverageRatio] = useState("");
  const [committeeSize, setCommitteeSize] = useState("");
  const [aging30, setAging30] = useState("");
  const [aging60, setAging60] = useState("");
  const [aging90, setAging90] = useState("");

  const [smsEnabled, setSmsEnabled] = useState(false);
  const [twilioSid, setTwilioSid] = useState("");
  const [twilioToken, setTwilioToken] = useState("");
  const [twilioFrom, setTwilioFrom] = useState("");
  const [appBaseUrl, setAppBaseUrl] = useState("");
  const [cronSecret, setCronSecret] = useState("");
  const [testMobile, setTestMobile] = useState("");

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/config");
      if (!res.ok) throw new Error("Failed to load config");
      const data = (await res.json()) as { settings: Setting[] };
      setSettings(data.settings);

      for (const s of data.settings) {
        if (s.key === "penalty_rate") setPenaltyRate(String(s.value));
        if (s.key === "penalty_rate_sme") setPenaltyRateSme(String(s.value));
        if (s.key === "coverage_ratio") setCoverageRatio(String(s.value));
        if (s.key === "committee_size") setCommitteeSize(String(s.value));
        if (s.key === "aging_thresholds" && typeof s.value === "object") {
          const v = s.value as Record<string, number>;
          setAging30(String(v["30"] ?? ""));
          setAging60(String(v["60"] ?? ""));
          setAging90(String(v["90"] ?? ""));
        }
        if (s.key === "sms_enabled") setSmsEnabled(Boolean(s.value));
        if (s.key === "twilio_account_sid") setTwilioSid(String(s.value ?? ""));
        if (s.key === "twilio_auth_token") setTwilioToken(String(s.value ?? ""));
        if (s.key === "twilio_from_number") setTwilioFrom(String(s.value ?? ""));
        if (s.key === "app_base_url") setAppBaseUrl(String(s.value ?? ""));
        if (s.key === "cron_secret") setCronSecret(String(s.value ?? ""));
        if (s.key === "email_enabled") setEmailEnabled(Boolean(s.value));
        if (s.key === "smtp_host") setSmtpHost(String(s.value ?? ""));
        if (s.key === "smtp_port") setSmtpPort(String(s.value ?? "587"));
        if (s.key === "smtp_secure") setSmtpSecure(Boolean(s.value));
        if (s.key === "smtp_user") setSmtpUser(String(s.value ?? ""));
        if (s.key === "smtp_password") setSmtpPassword(String(s.value ?? ""));
        if (s.key === "smtp_from") setSmtpFrom(String(s.value ?? ""));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          penalty_rate: Number(penaltyRate),
          penalty_rate_sme: Number(penaltyRateSme),
          coverage_ratio: Number(coverageRatio),
          committee_size: Number(committeeSize),
          aging_thresholds: {
            "30": Number(aging30),
            "60": Number(aging60),
            "90": Number(aging90),
          },
          sms_enabled: smsEnabled,
          twilio_account_sid: twilioSid,
          twilio_auth_token: twilioToken,
          twilio_from_number: twilioFrom,
          app_base_url: appBaseUrl,
          cron_secret: cronSecret,
          email_enabled: emailEnabled,
          smtp_host: smtpHost,
          smtp_port: Number(smtpPort),
          smtp_secure: smtpSecure,
          smtp_user: smtpUser,
          smtp_password: smtpPassword,
          smtp_from: smtpFrom,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to save");
      }
      setMessage("Configuration saved");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSmsTest() {
    setTestingSms(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testMobile }),
      });
      const body = (await res.json()) as {
        error?: string;
        status?: string;
        reason?: string;
        to?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "SMS test failed");
      if (body.status === "skipped") {
        setMessage(`SMS skipped: ${body.reason ?? "disabled"}`);
      } else {
        setMessage(`Test SMS sent to ${body.to ?? testMobile}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "SMS test failed");
    } finally {
      setTestingSms(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="System Config"
        description="Penalty rate, coverage ratio, aging thresholds, SMS (Twilio), and Email (SMTP)"
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
          <h2 className="mb-4 font-display text-lg font-semibold text-navy-900">
            System settings
          </h2>
          <div className="max-w-md space-y-4">
            <div>
              <Label htmlFor="penalty" required>
                Penalty rate — Seafarer (decimal)
              </Label>
              <Input
                id="penalty"
                type="number"
                step="0.001"
                min="0"
                max="1"
                required
                value={penaltyRate}
                onChange={(e) => setPenaltyRate(e.target.value)}
                className="mono"
              />
              <p className="mt-1 text-xs text-ink-400">
                {settings.find((s) => s.key === "penalty_rate")?.description}
              </p>
            </div>
            <div>
              <Label htmlFor="penalty-sme" required>
                Penalty rate — SME (decimal)
              </Label>
              <Input
                id="penalty-sme"
                type="number"
                step="0.001"
                min="0"
                max="1"
                required
                value={penaltyRateSme}
                onChange={(e) => setPenaltyRateSme(e.target.value)}
                className="mono"
              />
              <p className="mt-1 text-xs text-ink-400">
                {settings.find((s) => s.key === "penalty_rate_sme")
                  ?.description ?? "Maximum penalty rate per month (SME)"}
              </p>
            </div>
            <div>
              <Label htmlFor="coverage" required>
                Coverage ratio (decimal)
              </Label>
              <Input
                id="coverage"
                type="number"
                step="0.01"
                min="0"
                max="1"
                required
                value={coverageRatio}
                onChange={(e) => setCoverageRatio(e.target.value)}
                className="mono"
              />
            </div>
            <div>
              <Label htmlFor="committee-size" required>
                Committee size (approvers required)
              </Label>
              <Input
                id="committee-size"
                type="number"
                step="1"
                min="1"
                max="15"
                required
                value={committeeSize}
                onChange={(e) => setCommitteeSize(e.target.value)}
                className="mono"
              />
              <p className="mt-1 text-xs text-ink-400">
                {settings.find((s) => s.key === "committee_size")?.description}
              </p>
            </div>
            <div>
              <Label>Aging thresholds (days)</Label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <div>
                  <Label htmlFor="aging-30" className="text-xs text-ink-500">
                    30
                  </Label>
                  <Input
                    id="aging-30"
                    type="number"
                    placeholder="30"
                    value={aging30}
                    onChange={(e) => setAging30(e.target.value)}
                    className="mono"
                  />
                </div>
                <div>
                  <Label htmlFor="aging-60" className="text-xs text-ink-500">
                    60
                  </Label>
                  <Input
                    id="aging-60"
                    type="number"
                    placeholder="60"
                    value={aging60}
                    onChange={(e) => setAging60(e.target.value)}
                    className="mono"
                  />
                </div>
                <div>
                  <Label htmlFor="aging-90" className="text-xs text-ink-500">
                    90
                  </Label>
                  <Input
                    id="aging-90"
                    type="number"
                    placeholder="90"
                    value={aging90}
                    onChange={(e) => setAging90(e.target.value)}
                    className="mono"
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
            SMS (Twilio)
          </h2>
          <p className="mb-4 text-sm text-ink-500">
            Payment-due reminders via SMS. Leave disabled until credentials are
            verified. Auth token is masked after save — leave the masked value
            unchanged to keep the existing token.
          </p>
          <div className="max-w-md space-y-4">
            <label className="flex items-center gap-2 text-sm text-ink-800">
              <input
                type="checkbox"
                checked={smsEnabled}
                onChange={(e) => setSmsEnabled(e.target.checked)}
              />
              Enable SMS sending
            </label>
            <div>
              <Label htmlFor="twilio-sid">Account SID</Label>
              <Input
                id="twilio-sid"
                value={twilioSid}
                onChange={(e) => setTwilioSid(e.target.value)}
                className="mono"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="twilio-token">Auth token</Label>
              <Input
                id="twilio-token"
                type="password"
                value={twilioToken}
                onChange={(e) => setTwilioToken(e.target.value)}
                className="mono"
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="twilio-from">From number (E.164)</Label>
              <Input
                id="twilio-from"
                value={twilioFrom}
                onChange={(e) => setTwilioFrom(e.target.value)}
                placeholder="+63917…"
                className="mono"
              />
            </div>
            <div>
              <Label htmlFor="app-url">App base URL (reminder cron)</Label>
              <Input
                id="app-url"
                value={appBaseUrl}
                onChange={(e) => setAppBaseUrl(e.target.value)}
                placeholder="https://your-app.vercel.app"
                className="mono"
              />
              <p className="mt-1 text-xs text-ink-400">
                Used by pg_cron + pg_net to POST /api/cron/reminders. Also set
                CRON_SECRET in the app env to match the cron secret below.
              </p>
            </div>
            <div>
              <Label htmlFor="cron-secret">Cron secret</Label>
              <Input
                id="cron-secret"
                type="password"
                value={cronSecret}
                onChange={(e) => setCronSecret(e.target.value)}
                className="mono"
                autoComplete="new-password"
              />
            </div>
            <div className="border-t border-line-soft pt-4">
              <Label htmlFor="test-mobile">Send test SMS</Label>
              <div className="mt-1 flex flex-wrap items-start gap-2">
                <PhoneInput
                  id="test-mobile"
                  value={testMobile}
                  onChange={setTestMobile}
                  className="max-w-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  loading={testingSms}
                  disabled={!testMobile.trim()}
                  onClick={() => void handleSmsTest()}
                >
                  Send test
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
            Email (SMTP)
          </h2>
          <p className="mb-4 text-sm text-ink-500">
            Google SMTP uses an App Password (not your account password). Host{" "}
            <span className="mono">smtp.gmail.com</span>, port{" "}
            <span className="mono">587</span> (STARTTLS) or{" "}
            <span className="mono">465</span> with Secure checked. Password is
            masked after save — leave the masked value unchanged to keep the
            existing secret. Enable only after credentials work. Auth
            confirmation emails are configured in Supabase Auth, not here.
            Committee Approve/Deny templates are edited at{" "}
            <Link
              href="/admin/email-templates"
              className="font-medium text-navy-700 underline underline-offset-2 hover:text-navy-900"
            >
              /admin/email-templates
            </Link>
            ; Approve sends SMTP plus an in-app notice. Send a test from{" "}
            <Link
              href="/admin/email-test"
              className="font-medium text-navy-700 underline underline-offset-2 hover:text-navy-900"
            >
              /admin/email-test
            </Link>
            .
          </p>
          <div className="max-w-md space-y-4">
            <label className="flex items-center gap-2 text-sm text-ink-800">
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
              />
              Enable transactional email
            </label>
            <div>
              <Label htmlFor="smtp-host">Host</Label>
              <Input
                id="smtp-host"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.gmail.com"
                className="mono"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="smtp-port">Port</Label>
              <Input
                id="smtp-port"
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                className="mono"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-800">
              <input
                type="checkbox"
                checked={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.checked)}
              />
              Secure (TLS/SSL on connect — use with port 465)
            </label>
            <div>
              <Label htmlFor="smtp-user">Username</Label>
              <Input
                id="smtp-user"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="you@gmail.com"
                className="mono"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="smtp-password">Password</Label>
              <Input
                id="smtp-password"
                type="password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                className="mono"
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="smtp-from">From</Label>
              <Input
                id="smtp-from"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder="LoanStar &lt;you@gmail.com&gt;"
                className="mono"
              />
            </div>
            <div className="border-t border-line-soft pt-4">
              <Link href="/admin/email-test" className="btn btn-secondary">
                Open email test
              </Link>
            </div>
          </div>
        </Card>

        <Button type="submit" loading={saving}>
          Save configuration
        </Button>
      </form>
    </div>
  );
}
