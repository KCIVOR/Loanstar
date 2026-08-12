"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { Alert, Button, Input, Label, LoanStarLogo } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (resetError) {
      setError(resetError.message);
    } else {
      setMessage("Check your email for a password reset link.");
    }
    setLoading(false);
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
          <h3>Reset password</h3>
          <p className="s">Enter your email to receive a reset link.</p>

          <form onSubmit={(e) => void handleSubmit(e)}>
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

            <div className="mb-[22px]">
              <Label htmlFor="email" required>
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              variant="accent"
              size="lg"
              block
              loading={loading}
            >
              Send reset link
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
