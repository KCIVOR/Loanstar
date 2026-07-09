"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { Alert, Button, Card, Input, Label, LoanStarMark } from "@/components/ui";
import { resolveHomePath } from "@/lib/permissions/home";
import type { UserPermissions } from "@/lib/permissions/types";
import { createClient } from "@/lib/supabase/client";

// Seeded demo accounts (see docs/seed script) — password is the same for all.
// Only rendered outside production so this never ships to real users.
const SEED_ACCOUNTS = [
  { label: "Super Admin", email: "super_admin@loanstar.local" },
  { label: "Agent", email: "agent@loanstar.local" },
  { label: "CSA", email: "csa@loanstar.local" },
  { label: "CIG", email: "cig@loanstar.local" },
  { label: "Committee", email: "committee@loanstar.local" },
  { label: "LRA", email: "lra@loanstar.local" },
  { label: "AR", email: "ar@loanstar.local" },
  { label: "Collector", email: "collector@loanstar.local" },
  { label: "Remedial", email: "remedial@loanstar.local" },
  { label: "Borrower", email: "borrower@loanstar.local" },
];
const SEED_PASSWORD = "Loanstar2026";

/** Users whose modules all live in one portal land there directly. */
async function resolveLandingPath(): Promise<string> {
  try {
    const res = await fetch("/api/permissions/me", { credentials: "include" });
    if (!res.ok) return "/dashboard";
    const permissions = (await res.json()) as UserPermissions;
    return resolveHomePath(permissions);
  } catch {
    return "/dashboard";
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(emailValue: string, passwordValue: string) {
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: emailValue,
      password: passwordValue,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push(redirect ?? (await resolveLandingPath()));
    router.refresh();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void signIn(email, password);
  }

  function handleQuickLogin(accountEmail: string) {
    setEmail(accountEmail);
    setPassword(SEED_PASSWORD);
    void signIn(accountEmail, SEED_PASSWORD);
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-navy-950 px-4 py-12">
      <Card className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <LoanStarMark size={40} />
          <p className="mt-3 font-display text-lg font-semibold text-ink">LoanStar</p>
          <h1 className="mt-4 font-display text-xl font-semibold text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-ink-faint">Loan management system</p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-ink-faint">
          <Link href="/forgot-password" className="text-ink hover:underline">
            Forgot password?
          </Link>
        </p>

        <div className="mt-6 space-y-2 border-t border-neutral-200 pt-4 text-center text-sm text-ink-muted">
          <p>
            New borrower?{" "}
            <Link href="/borrower/register" className="font-medium text-ink hover:underline">
              Register here
            </Link>
          </p>
        </div>

        {process.env.NODE_ENV !== "production" ? (
          <div className="mt-6 border-t border-neutral-200 pt-4">
            <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wide text-ink-faint">
              Quick login (seed accounts)
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {SEED_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  disabled={loading}
                  onClick={() => handleQuickLogin(account.email)}
                  className="rounded-md border border-neutral-200 px-2 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-gold-400/40 hover:bg-gold-400/10 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {account.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full flex-1 items-center justify-center bg-navy-950 text-sm text-navy-subtle">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
