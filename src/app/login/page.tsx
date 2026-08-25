"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";

import {
  Alert,
  Button,
  Checkbox,
  Input,
  Label,
  LoanStarLogo,
  Spinner,
} from "@/components/ui";
import { sessionFromHash } from "@/lib/auth/session-from-hash";
import { resolveHomePath } from "@/lib/permissions/home";
import type { UserPermissions } from "@/lib/permissions/types";
import { createClient } from "@/lib/supabase/client";

function safeRedirectPath(raw: string | null): string | null {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return null;
}

const SEED_ACCOUNTS = [
  { label: "Super Admin", email: "super_admin@loanstar.local" },
  { label: "Agent", email: "agent@loanstar.local" },
  { label: "CSA", email: "csa@loanstar.local" },
  { label: "CIG", email: "cig@loanstar.local" },
  { label: "Committee", email: "committee@loanstar.local" },
  { label: "LRA", email: "lra@loanstar.local" },
  { label: "AR", email: "ar@loanstar.local" },
  { label: "Collector", email: "collector@loanstar.local" },
  { label: "Briefer", email: "collection_head@loanstar.local" },
  { label: "Remedial", email: "remedial@loanstar.local" },
  { label: "Borrower", email: "borrower@loanstar.local" },
];
const SEED_PASSWORD = "Loanstar2026";

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
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function finishEmailConfirmation() {
      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const otpType = searchParams.get("type");
      const linkError =
        searchParams.get("error_description") ?? searchParams.get("error");
      const hashTokens = sessionFromHash(window.location.hash);
      const fromEmailLink =
        Boolean(code) || Boolean(tokenHash) || Boolean(hashTokens);

      if (linkError && fromEmailLink) {
        setError(linkError.replace(/\+/g, " "));
        return;
      }

      if (!fromEmailLink) return;

      setConfirming(true);
      setLoading(true);

      let authError: string | null = null;

      // @supabase/ssr hardcodes PKCE and rejects #access_token hashes.
      // Confirmation emails use implicit tokens, so apply them explicitly.
      if (hashTokens) {
        const { error: sessionError } = await supabase.auth.setSession(hashTokens);
        if (sessionError) authError = sessionError.message;
        else {
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${window.location.search}`,
          );
        }
      } else if (tokenHash && otpType) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType as EmailOtpType,
        });
        if (otpError) authError = otpError.message;
      } else if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) authError = exchangeError.message;
      }

      if (cancelled) return;

      if (authError) {
        setError(authError);
        setConfirming(false);
        setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!data.session) {
        setError(
          "Email confirmed, but we couldn't sign you in automatically. Please log in.",
        );
        setConfirming(false);
        setLoading(false);
        return;
      }

      router.replace(
        safeRedirectPath(redirect) ?? (await resolveLandingPath()),
      );
      router.refresh();
    }

    void finishEmailConfirmation();
    return () => {
      cancelled = true;
    };
  }, [searchParams, redirect, router]);

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
          <Link href="/" className="login-back">
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
            Back to home
          </Link>
          {confirming ? (
            <>
              <h3>Confirming your email</h3>
              <p className="s">Your email is confirmed. Signing you in…</p>
              <Spinner label="Opening your portal…" className="py-8" />
            </>
          ) : (
            <>
          <h3>Welcome back</h3>
          <p className="s">Log in to your LoanStar portal.</p>

          <form onSubmit={(e) => void handleSubmit(e)}>
            {error ? (
              <div className="mb-4">
                <Alert>{error}</Alert>
              </div>
            ) : null}

            <div className="mb-[18px]">
              <Label htmlFor="email" required>
                Email or borrower ID
              </Label>
              <Input
                id="email"
                type="text"
                autoComplete="username"
                required
                placeholder="you@email.com or BR-000000"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="mb-[18px]">
              <Label htmlFor="password" required>
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-11"
                />
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-ink-400 hover:text-ink-700"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="login-row">
              <Checkbox
                id="remember"
                label="Remember me"
                checked={remember}
                onChange={setRemember}
              />
              <Link
                href="/forgot-password"
                className="text-[13px] font-semibold text-teal-700 no-underline hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              variant="accent"
              size="lg"
              block
              loading={loading}
            >
              Log in
            </Button>
          </form>

          <div className="login-role-hint">
            <b>Staff?</b> CSA, CIG, LRA, Committee, and Collections accounts use
            the same login — you&apos;ll land on your role&apos;s workspace.
          </div>

          <div className="login-foot">
            New borrower?{" "}
            <Link
              href="/register"
              className="font-semibold text-teal-700 no-underline hover:underline"
            >
              Create an account
            </Link>
          </div>

          {process.env.NODE_ENV !== "production" ||
          process.env.NEXT_PUBLIC_ENABLE_SEED_LOGIN === "true" ? (
            <div className="mt-6 border-t border-line-soft pt-4">
              <p className="side-grp mb-2 text-center" style={{ padding: 0, opacity: 0.6 }}>
                Quick login (seed accounts)
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {SEED_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    disabled={loading}
                    onClick={() => handleQuickLogin(account.email)}
                    className="rounded-md border border-line px-2 py-1.5 text-xs font-semibold text-ink-500 transition-colors hover:border-teal-600/40 hover:bg-teal-50 hover:text-navy-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-ink-500">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
