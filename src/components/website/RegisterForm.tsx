"use client";
import { RegisterPresentation } from "./RegisterPresentation";

import type {
  AuthPageContent,
  WebsiteContent,
  PublicAsset,
} from "@/lib/website/schema";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function RegisterForm({
  content,
  site,
  assets = [],
}: {
  content: AuthPageContent;
  site: WebsiteContent["site"];
  assets?: PublicAsset[];
}) {
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

  return (
    <RegisterPresentation
      content={content}
      site={site}
      assets={assets}
      email={email}
      password={password}
      showPassword={showPassword}
      loading={loading}
      error={error}
      setEmail={setEmail}
      setPassword={setPassword}
      setShowPassword={setShowPassword}
      handleSubmit={handleSubmit}
      done={done}
      confirmationSent={confirmationSent}
      firstName={firstName}
      middleName={middleName}
      lastName={lastName}
      mobilePhone={mobilePhone}
      dateOfBirth={dateOfBirth}
      civilStatus={civilStatus}
      setFirstName={setFirstName}
      setMiddleName={setMiddleName}
      setLastName={setLastName}
      setMobilePhone={setMobilePhone}
      setDateOfBirth={setDateOfBirth}
      setCivilStatus={setCivilStatus}
      onLogin={() => router.push("/login?redirect=/borrower")}
    />
  );
}
