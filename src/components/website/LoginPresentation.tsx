"use client";
import type { FormEvent, Dispatch, SetStateAction } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Label,
  Spinner,
} from "@/components/ui";
import type {
  AuthPageContent,
  WebsiteContent,
  PublicAsset,
} from "@/lib/website/schema";
import { AuthMarketing } from "./AuthMarketing";
import { useWebsiteHydrated } from "./useWebsiteHydrated";
type Setter<T> = Dispatch<SetStateAction<T>>;
type BaseProps = {
  content: AuthPageContent;
  site: WebsiteContent["site"];
  assets: PublicAsset[];
  assetUrls?: Record<string, string>;
  mode?: "live" | "preview";
};

type Props = BaseProps & {
  email: string;
  password: string;
  showPassword: boolean;
  loading: boolean;
  error: string | null;
  setEmail: Setter<string>;
  setPassword: Setter<string>;
  setShowPassword: Setter<boolean>;
  handleSubmit: (event: FormEvent) => Promise<void>;
  confirming: boolean;
  remember: boolean;
  setRemember: Setter<boolean>;
  searchParams: { get: (key: string) => string | null };
};
export function LoginPresentation({
  content,
  site,
  assets,
  assetUrls,
  mode = "live",
  email,
  password,
  showPassword,
  loading,
  error,
  setEmail,
  setPassword,
  setShowPassword,
  handleSubmit,
  confirming,
  remember,
  setRemember,
  searchParams,
}: Props) {
  const hydrated = useWebsiteHydrated();
  return (
    <div
      className="login-shell"
      style={
        !content.marketing.enabled ? { gridTemplateColumns: "1fr" } : undefined
      }
    >
      <AuthMarketing
        content={content}
        site={site}
        assets={assets}
        assetUrls={mode === "preview" ? assetUrls : undefined}
        preview={mode === "preview"}
      />

      <div className="login-panel">
        <div className="login-card">
          <Link href={mode === "preview" ? "#" : "/"} className="login-back">
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
            {content.backLabel}
          </Link>
          {confirming ? (
            <>
              <h3>Confirming your email</h3>
              <p className="s">Your email is confirmed. Signing you in…</p>
              <Spinner label="Opening your portal…" className="py-8" />
            </>
          ) : (
            <>
              <h3>{content.greeting}</h3>
              <p className="s">{content.subtitle}</p>
              {searchParams.get("reauth") === "email-change" && (
                <div className="mb-4">
                  <Alert variant="info">
                    Sign in with your updated email address and existing
                    password.
                  </Alert>
                </div>
              )}

              <form
                data-website-hydrated={hydrated ? "true" : "false"}
                onSubmit={(e) => {
                  if (mode === "preview") e.preventDefault();
                  else void handleSubmit(e);
                }}
              >
                <fieldset
                  disabled={mode === "preview"}
                  style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
                >
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
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
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
                      href={mode === "preview" ? "#" : "/forgot-password"}
                      className="text-[13px] font-semibold text-teal-700 no-underline hover:underline"
                    >
                      {content.forgotLabel}
                    </Link>
                  </div>

                  <Button
                    type="submit"
                    variant="accent"
                    size="lg"
                    block
                    loading={loading}
                  >
                    {content.submitLabel}
                  </Button>
                </fieldset>
              </form>

              <div className="login-role-hint">
                <b>{content.staffTitle}</b> {content.staffHint}
              </div>

              <div className="login-foot">
                {content.footerPrompt}{" "}
                <Link
                  href={mode === "preview" ? "#" : "/register"}
                  className="font-semibold text-teal-700 no-underline hover:underline"
                >
                  {content.footerLinkLabel}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
