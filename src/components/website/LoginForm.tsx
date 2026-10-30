"use client";
import { LoginPresentation } from "./LoginPresentation";

import type {
  AuthPageContent,
  WebsiteContent,
  PublicAsset,
} from "@/lib/website/schema";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";

import { sessionFromHash } from "@/lib/auth/session-from-hash";
import { resolveHomePath } from "@/lib/permissions/home";
import type { UserPermissions } from "@/lib/permissions/types";
import { createClient } from "@/lib/supabase/client";

function safeRedirectPath(raw: string | null): string | null {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return null;
}

function authErrorMessage(error: { message: string; code?: string }): string {
  // GoTrue's raw "User is banned" text leaks internal terminology for what
  // is, from the account's perspective, a suspension by an admin — show the
  // wording we actually use elsewhere in the product instead.
  if (error.code === "user_banned") {
    return "This account has been suspended. Contact your administrator.";
  }
  return error.message;
}

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

function LoginForm({
  content,
  site,
  assets = [],
}: {
  content: AuthPageContent;
  site: WebsiteContent["site"];
  assets?: PublicAsset[];
}) {
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
        const { error: sessionError } =
          await supabase.auth.setSession(hashTokens);
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
      // Activity Log: failed attempt (email + IP only). Never blocks the UI.
      void fetch("/api/auth/login-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailValue }),
      }).catch(() => {});
      setError(authErrorMessage(signInError));
      setLoading(false);
      return;
    }

    await fetch("/api/auth/session-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "login" }),
    }).catch(() => {});

    router.push(redirect ?? (await resolveLandingPath()));
    router.refresh();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void signIn(email, password);
  }

  return (
    <LoginPresentation
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
      confirming={confirming}
      remember={remember}
      setRemember={setRemember}
      searchParams={searchParams}
    />
  );
}

export function LoginFormWithSuspense({
  content,
  site,
  assets = [],
}: {
  content: AuthPageContent;
  site: WebsiteContent["site"];
  assets?: PublicAsset[];
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-ink-500">
          Loading…
        </div>
      }
    >
      <LoginForm content={content} site={site} assets={assets} />
    </Suspense>
  );
}
