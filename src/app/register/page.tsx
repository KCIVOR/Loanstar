"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Button,
  Input,
  Label,
  LoanStarLogo,
  PhoneInput,
} from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [civilStatus, setCivilStatus] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/borrower/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          middleName: middleName || undefined,
          lastName,
          email,
          password,
          mobilePhone: mobilePhone || undefined,
          dateOfBirth: dateOfBirth || undefined,
          civilStatus: civilStatus || undefined,
        }),
      });

      const body = (await res.json().catch(() => null)) as {
        error?: string;
        confirmationSent?: boolean;
        requiresEmailConfirmation?: boolean;
      } | null;

      if (!res.ok) {
        throw new Error(body?.error ?? "Registration failed");
      }

      // Do not auto-sign-in — email must be confirmed first when Auth
      // confirmations are enabled (Supabase sends that email).
      setConfirmationSent(body?.confirmationSent !== false);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="login-shell">
        <div className="login-panel" style={{ gridColumn: "1 / -1" }}>
          <div className="login-card">
            <Link href="/" className="inline-flex items-center no-underline mb-4">
              <LoanStarLogo height={36} />
            </Link>
            <h3>Check your email</h3>
            <p className="s">
              {confirmationSent
                ? "We sent a confirmation link to your inbox (via Supabase Auth). Confirm your email, then log in to open your borrower portal."
                : "Your account was created. If you did not receive a confirmation email, Confirm email may be disabled in Supabase Auth settings — you can try logging in, or ask an admin to enable email confirmations."}
            </p>
            <Button
              type="button"
              variant="accent"
              size="lg"
              block
              onClick={() => router.push("/login?redirect=/borrower")}
            >
              Go to log in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <div className="login-brand">
        <Link href="/" className="inline-flex items-center no-underline">
          <LoanStarLogo height={36} />
        </Link>
        <div className="mid">
          <h2>
            Start your loan, <em>charted clearly</em> — before you sail.
          </h2>
          <p>
            Create a borrower account to apply online, upload documents, and
            track every step from verification to release.
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
        <div className="login-card login-card-wide">
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
          <h3>Create your account</h3>
          <p className="s">Create your borrower account. You can start a loan application after you sign in.</p>

          <form onSubmit={(e) => void handleSubmit(e)}>
            {error ? (
              <div className="mb-4">
                <Alert>{error}</Alert>
              </div>
            ) : null}

            <div className="mb-[18px] grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="firstName" required>
                  First name
                </Label>
                <Input
                  id="firstName"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="middleName">Middle name</Label>
                <Input
                  id="middleName"
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-[18px]">
              <Label htmlFor="lastName" required>
                Last name
              </Label>
              <Input
                id="lastName"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>

            <div className="mb-[18px]">
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

            <div className="mb-[18px]">
              <Label htmlFor="password" required>
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
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

            <div className="mb-[18px]">
              <Label htmlFor="mobilePhone">Mobile phone</Label>
              <PhoneInput
                id="mobilePhone"
                value={mobilePhone}
                onChange={setMobilePhone}
              />
            </div>

            <div className="mb-[18px]">
              <Label htmlFor="dateOfBirth">Date of birth</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>

            <div className="mb-[22px]">
              <Label htmlFor="civilStatus">Civil status</Label>
              <Input
                id="civilStatus"
                placeholder="Single, Married, etc."
                value={civilStatus}
                onChange={(e) => setCivilStatus(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              variant="accent"
              size="lg"
              block
              loading={loading}
            >
              Create account
            </Button>
          </form>

          <div className="login-foot">
            Already have an account?{" "}
            <Link
              href="/login?redirect=/borrower"
              className="font-semibold text-teal-700 no-underline hover:underline"
            >
              Log in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
