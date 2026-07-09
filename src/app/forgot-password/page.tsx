"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { Alert, Button, Card, Input, Label, LoanStarMark } from "@/components/ui";
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
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo },
    );

    if (resetError) {
      setError(resetError.message);
    } else {
      setMessage("Check your email for a password reset link.");
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-navy-950 px-4 py-12">
      <Card className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <LoanStarMark size={40} />
          <p className="mt-3 font-display text-lg font-semibold text-ink">LoanStar</p>
          <h1 className="mt-4 font-display text-xl font-semibold text-ink">Reset password</h1>
          <p className="mt-1 text-sm text-ink-faint">
            Enter your email to receive a reset link.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          {message ? <Alert variant="success">{message}</Alert> : null}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-ink-faint">
          <Link href="/login" className="text-ink hover:underline">
            Back to sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
