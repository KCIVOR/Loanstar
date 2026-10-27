"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { Alert, Button, Input, Label, LoanStarLogo } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { finishAuthCallback } from "@/lib/auth/callback";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    void finishAuthCallback(createClient().auth, url).then(setReady).catch((error: unknown) => {
      setError(error instanceof Error ? error.message : "Unable to open the reset link");
    }).finally(() => window.history.replaceState(null, "", "/reset-password"));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="login-shell">
      <div className="login-brand">
        <Link href="/" className="inline-flex items-center no-underline">
          <LoanStarLogo height={36} />
        </Link>
        <div className="mid">
          <h2>
            Your loan, <em>charted clearly</em> — wherever you sail.
          </h2>
          <p>
            Track your application, view your payment schedule, and download
            your statement of account from any port in the world.
          </p>
          <div className="login-quote">
            <div className="q">
              &ldquo;Na-approve yung loan ko bago pa ako sumakay. Kitang-kita
              ko rin lahat ng bawas at schedule — walang gulat.&rdquo;
            </div>
            <div className="who">
              <span className="av">JD</span>
              <div>
                <b>Juan D.</b>
                <span>Able Seaman · MV Pacific Star</span>
              </div>
            </div>
          </div>
        </div>
        <div className="foot-note">MERIDIAN · SECURE PORTAL · LOANSTAR 2026</div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <Link href="/login" className="login-back">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to sign in
          </Link>
          <h3>Set new password</h3>

          {!ready ? (
            <div className="mt-6">
              {error ? <Alert>{error}</Alert> : null}
              <Alert variant="info">
                Open this page from the reset link in your email, or sign in first.
              </Alert>
            </div>
          ) : (
            <>
              <p className="s">Choose a new password for your account.</p>
              <form onSubmit={(e) => void handleSubmit(e)}>
                {error ? (
                  <div className="mb-4">
                    <Alert>{error}</Alert>
                  </div>
                ) : null}

                <div className="mb-[18px]">
                  <Label htmlFor="password" required>
                    New password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div className="mb-[22px]">
                  <Label htmlFor="confirm" required>
                    Confirm password
                  </Label>
                  <Input
                    id="confirm"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Re-enter your new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>

                <Button
                  type="submit"
                  variant="accent"
                  size="lg"
                  block
                  loading={loading}
                >
                  Update password
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
