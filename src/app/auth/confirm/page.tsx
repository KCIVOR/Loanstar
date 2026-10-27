"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, Card, Spinner } from "@/components/ui";
import { processAuthCallback, rememberEmailConfirmation } from "@/lib/auth/callback";
import { createClient } from "@/lib/supabase/client";

export default function ConfirmEmailPage() {
  const router = useRouter();
  const started = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    void processAuthCallback(createClient().auth, url).then((result) => {
      window.history.replaceState(window.history.state, "", "/auth/confirm");
      if (result.hasSession) {
        rememberEmailConfirmation(result);
        router.replace("/settings");
      } else setMessage(result.outcome === "pending"
        ? "One confirmation was accepted. Confirm the link sent to your other email address, then sign in to view Settings."
        : "We could not verify completion of the email change. Complete any outstanding confirmation links, then sign in to check your current email in Settings.");
    }).catch((error: unknown) => {
      window.history.replaceState(window.history.state, "", "/auth/confirm");
      setError(`${error instanceof Error ? error.message : "Unable to confirm email"}. The link may be expired, invalid, or already used. Check your current email in Settings before requesting a fresh confirmation link.`);
    });
  }, [router]);
  return <main className="mx-auto w-full max-w-lg p-6 sm:pt-20"><Card>
    <h1 className="mb-4 text-xl font-semibold">Email verification</h1>
    {error ? <Alert>{error}</Alert> : message ? <Alert variant="info">{message}</Alert> : <Spinner />}
    <Link href="/settings" className="mt-5 inline-block text-sm underline">Return to Settings</Link>
  </Card></main>;
}
