"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Button, Card, Input, Label, PageHeader, Spinner } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { consumeEmailConfirmation, emailConfirmationFeedback } from "@/lib/auth/callback";

async function loadSettings(): Promise<{ email: string; pendingEmail: string | null; verificationMode?: string; emailChangeStatus?: string }> {
  const response = await fetch("/api/account/security", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Unable to load settings");
  return body;
}

export default function SettingsPage() {
  const { refresh } = usePermissions();
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [verificationMode, setVerificationMode] = useState<string>();
  const [emailChangeStatus, setEmailChangeStatus] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"password" | "email" | null>(null);
  const submitting = useRef(false);
  const started = useRef(false);
  const [confirmation, setConfirmation] = useState<{ kind: "info" | "success"; text: string } | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "password" | "email"; error: boolean; text: string } | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const outcome = consumeEmailConfirmation();
    // URL hints are never evidence. Remove legacy confirmation hints if present.
    const url = new URL(window.location.href);
    if (url.searchParams.has("emailConfirmation")) {
      url.searchParams.delete("emailConfirmation");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    void loadSettings().then((body) => {
      setEmail(body.email);
      setPendingEmail(body.pendingEmail || null);
      setVerificationMode(body.verificationMode);
      setEmailChangeStatus(body.emailChangeStatus);
      if (outcome) setConfirmation(emailConfirmationFeedback(outcome, body));
    })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Unable to load settings. We could not verify whether the email change completed.");
      })
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>, kind: "password" | "email") {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const input: Record<string, FormDataEntryValue> = { kind, ...Object.fromEntries(fields.entries()) };
    if (kind === "password" && input.password !== input.confirmPassword) {
      setFeedback({ kind, error: true, text: "Passwords do not match" });
      return;
    }
    submitting.current = true;
    setBusy(kind);
    setFeedback(null);
    if (kind === "email") setConfirmation(null);
    try {
      const response = await fetch("/api/account/security", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update settings");
      form.reset();
      const text = result.status === "password_changed"
        ? "Your password has been changed."
        : result.status === "email_changed"
          ? "Your login email has been changed."
          : "Approval requested. Check your current email inbox and approve the change. No confirmation is sent to your new email.";
      setFeedback({ kind, error: false, text });
      try {
        const body = await loadSettings();
        setEmail(body.email);
        setPendingEmail(body.pendingEmail || null);
        setVerificationMode(body.verificationMode);
        setEmailChangeStatus(body.emailChangeStatus);
        await refresh();
      } catch {
        setFeedback({ kind, error: false, text: `${text} Reload this page to refresh your account details.` });
      }
    } catch (error) {
      setFeedback({ kind, error: true, text: error instanceof Error ? error.message : "Unable to update settings" });
    } finally {
      submitting.current = false;
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" description="Manage your password and login email address." />
      {loading ? <Spinner /> : loadError ? <Alert>{loadError}</Alert> : <>
        {confirmation && <div role="status"><Alert variant={confirmation.kind}>{confirmation.text}</Alert></div>}
        <Card>
          <h2 className="text-base font-semibold text-ink-900">Change password</h2>
          <p className="mb-5 mt-1 text-sm text-ink-500">Enter your current password and choose a new password with at least 8 characters.</p>
          <form onSubmit={(event) => void submit(event, "password")} className="space-y-4">
            {feedback?.kind === "password" && <div role={feedback.error ? "alert" : "status"}><Alert variant={feedback.error ? "error" : "success"}>{feedback.text}</Alert></div>}
            <div><Label htmlFor="password-current">Current password</Label><Input id="password-current" name="currentPassword" type="password" autoComplete="current-password" required maxLength={1024} disabled={busy !== null} /></div>
            <div><Label htmlFor="password-new">New password</Label><Input id="password-new" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={1024} disabled={busy !== null} /></div>
            <div><Label htmlFor="password-confirm">Confirm new password</Label><Input id="password-confirm" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={1024} disabled={busy !== null} /></div>
            <Button type="submit" variant="primary" loading={busy === "password"} disabled={busy !== null}>Change password</Button>
          </form>
        </Card>
        <Card>
          <h2 className="text-base font-semibold text-ink-900">Login email</h2>
          <p className="mb-5 mt-1 text-sm text-ink-500">Approve the change using your current email inbox. Check the new address carefully; its inbox is not verified.</p>
          <div className="mb-4"><Label htmlFor="email-current">Current login email</Label><Input id="email-current" type="email" value={email} readOnly disabled /></div>
          {pendingEmail && <div className="mb-4" role="status"><Alert variant="info">Pending login email: {pendingEmail}. {emailChangeStatus === "processing" ? "Your change is processing. Contact support if it remains pending." : verificationMode === "current_email" ? "Approve the link sent to your current email address." : "This earlier request uses the provider's confirmation flow. Complete the required confirmations from your current and new addresses."}</Alert></div>}
          <form onSubmit={(event) => void submit(event, "email")} className="space-y-4">
            {feedback?.kind === "email" && <div role={feedback.error ? "alert" : "status"}><Alert variant={feedback.error ? "error" : "success"}>{feedback.text}</Alert></div>}
            <div><Label htmlFor="email-new">New login email</Label><Input id="email-new" name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy !== null} /></div>
            <div><Label htmlFor="email-password">Current password</Label><Input id="email-password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={1024} disabled={busy !== null} /></div>
            <Button type="submit" variant="primary" loading={busy === "email"} disabled={busy !== null || emailChangeStatus === "processing"}>Send approval email</Button>
          </form>
        </Card>
      </>}
    </div>
  );
}
