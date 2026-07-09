"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  LoanStarMark,
} from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export default function BorrowerRegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Registration failed");
      }

      const supabase = createClient();
      await supabase.auth.signInWithPassword({ email, password });

      router.push("/borrower");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-navy-950 px-4 py-12">
      <Card className="w-full max-w-lg">
        <div className="flex flex-col items-center text-center">
          <LoanStarMark size={40} />
          <p className="mt-3 font-display text-lg font-semibold text-ink">LoanStar</p>
          <h1 className="mt-4 font-display text-xl font-semibold text-ink">
            Borrower registration
          </h1>
          <p className="mt-1 text-sm text-ink-faint">
            Create your account to start a loan application
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          {error ? <Alert>{error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName">First name</Label>
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

          <div>
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="mobilePhone">Mobile phone</Label>
              <Input
                id="mobilePhone"
                type="tel"
                value={mobilePhone}
                onChange={(e) => setMobilePhone(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dateOfBirth">Date of birth</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="civilStatus">Civil status</Label>
            <Input
              id="civilStatus"
              placeholder="Single, Married, etc."
              value={civilStatus}
              onChange={(e) => setCivilStatus(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating account…" : "Register"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-ink-faint">
          Already have an account?{" "}
          <Link
            href="/login?redirect=/borrower"
            className="text-ink hover:underline"
          >
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
