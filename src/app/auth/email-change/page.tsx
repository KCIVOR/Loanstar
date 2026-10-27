"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, LoanStarLogo, Spinner } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { EmailChangeRequest } from "@/lib/account/email-change";

export default function EmailChangeApprovalPage() {
  const router = useRouter();
  const credentials = useRef<{ requestId: string; token: string } | null>(null);
  const started = useRef(false);
  const inFlight = useRef(false);
  const [request, setRequest] = useState<EmailChangeRequest | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  async function signOutAndContinue() {
    try {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw new Error("Sign out failed");
      router.replace("/login?reauth=email-change");
    } catch {
      setError("Your email was updated, but we could not sign you out. Retry signing out before you log in with your new email.");
    }
  }

  async function retrySignOut() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await signOutAndContinue(); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function call(action: "inspect" | "confirm") {
    const response = await fetch("/api/account/email-change", { method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...credentials.current, action }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to process this approval link.");
    return body;
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let generation = 0;
    function inspect() {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      // Remove bearer material before any requests; keep it only in component memory.
      window.history.replaceState(window.history.state, "", window.location.pathname);
      if (inFlight.current) return;
      credentials.current = { requestId: fragment.get("request_id") || "", token: fragment.get("approval_token") || "" };
      const current = ++generation;
      setRequest(null); setCompleted(false); setError(null); setBusy(true);
      void call("inspect").then((body: EmailChangeRequest) => {
        if (current !== generation) return;
        setRequest(body); setCompleted(body.status === "completed");
      }).catch(() => {
        if (current === generation) setError("This link is unavailable. Sign in to the account that requested it and reopen the email. Expired or superseded links require a new request.");
      }).finally(() => { if (current === generation) setBusy(false); });
    }
    inspect();
    window.addEventListener("hashchange", inspect);
    return () => { generation++; started.current = false; window.removeEventListener("hashchange", inspect); };
  }, []);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const result = await call("confirm");
      if (result.status !== "email_changed" || typeof result.email !== "string") throw new Error("Unable to verify completion. Check Settings.");
      credentials.current = null;
      setCompleted(true);
      await signOutAndContinue();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to process this approval. Check Settings before trying again.");
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <main className="flex min-h-dvh items-center justify-center bg-[#eef1f6] px-4 py-10 sm:px-6">
    <section aria-labelledby="approval-heading" aria-busy={busy} className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#e2e7f0] bg-white shadow-xl shadow-[#0c2247]/5">
      <header className="bg-[#0c2247] px-6 py-7 sm:px-8">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a9bddb]">Secure account update</p>
        <LoanStarLogo height={36} />
      </header>
      <div className="h-1 bg-gradient-to-r from-[#0d9488] via-[#14b8a6] to-[#1a407d]" />
      <div className="space-y-5 px-6 py-8 sm:px-8">
        <span className="inline-flex rounded-full bg-[#e7f5f3] px-3 py-1 text-xs font-semibold text-[#0a7d71]">Login email</span>
        <h1 id="approval-heading" className="text-2xl font-semibold tracking-tight text-[#0f1e38]">{completed ? "Email updated" : busy && !request ? "Checking your approval link" : error && !request ? "Unable to open this link" : "Approve email change"}</h1>
        {error && <div role="alert"><Alert>{error}</Alert></div>}
        {completed ? <>
          <p role="status" className="text-sm leading-6 text-[#54637e]">This email change has completed. Use your new email and existing password to sign in.</p>
          {busy ? <div role="status"><Spinner label="Signing you out…" className="py-4" /></div>
            : <Button onClick={() => void retrySignOut()} variant="primary">Sign out and continue</Button>}
        </> : request ? <>
          <p className="text-sm leading-6 text-[#54637e]">Review the new address before approving this change.</p>
          <dl className="space-y-4 rounded-xl border border-[#e2e7f0] bg-[#f6f8fb] p-4 text-sm">
            <div><dt className="mb-1 text-xs font-medium text-[#7c879c]">Current login email</dt><dd className="break-all font-medium text-[#1c2a41]">{request.oldEmail}</dd></div>
            <div className="border-t border-[#e2e7f0] pt-4"><dt className="mb-1 text-xs font-medium text-[#7c879c]">New login email</dt><dd className="break-all font-semibold text-[#0a7d71]">{request.newEmail}</dd></div>
          </dl>
          <p className="text-sm leading-6 text-[#54637e]">Access to the new inbox is not verified. This approval expires after 30 minutes. After the change, you will be signed out and asked to log in again.</p>
          {request.status === "processing" ? <div role="status"><Alert variant="info">Your change is processing. Check Settings or contact support before trying again.</Alert></div>
            : <Button onClick={() => void confirm()} variant="primary" disabled={busy} loading={busy} className="w-full">{busy ? "Updating your email…" : "Confirm email change"}</Button>}
        </> : busy ? <div role="status"><Spinner label="Securely checking your request…" className="py-6" /><p className="text-center text-sm text-[#7c879c]">Please keep this page open.</p></div> : null}
      </div>
      <footer className="border-t border-[#e2e7f0] bg-[#f6f8fb] px-6 py-5 sm:px-8">
        {completed ? <p className="text-sm text-[#54637e]">Sign in again to continue securely.</p> : <Link href="/settings" className="text-sm font-medium text-[#0d9488] underline underline-offset-4">Return to Settings</Link>}
        <p className="mt-3 text-xs text-[#8590a6]">LoanStar · Account security</p>
      </footer>
    </section>
  </main>;
}
