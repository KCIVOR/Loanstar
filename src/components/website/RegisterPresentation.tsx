"use client";
import type { FormEvent, Dispatch, SetStateAction } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Input,
  Label,
  PhoneInput,
  Select,
} from "@/components/ui";
import type {
  AuthPageContent,
  WebsiteContent,
  PublicAsset,
} from "@/lib/website/schema";
import { AuthMarketing } from "./AuthMarketing";
import { WebsiteLogo } from "./WebsiteLogo";
import { useWebsiteHydrated } from "./useWebsiteHydrated";
type Setter<T> = Dispatch<SetStateAction<T>>;
type BaseProps = {
  content: AuthPageContent;
  site: WebsiteContent["site"];
  assets: PublicAsset[];
  assetUrls?: Record<string, string>;
  mode?: "live" | "preview";
};

const CIVIL_STATUS_OPTIONS = [
  "Single",
  "Married",
  "Widowed",
  "Separated",
  "Annulled",
  "Legally Separated",
] as const;

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
  done: boolean;
  confirmationSent: boolean;
  firstName: string;
  middleName: string;
  lastName: string;
  mobilePhone: string;
  dateOfBirth: string;
  civilStatus: string;
  setFirstName: Setter<string>;
  setMiddleName: Setter<string>;
  setLastName: Setter<string>;
  setMobilePhone: Setter<string>;
  setDateOfBirth: Setter<string>;
  setCivilStatus: Setter<string>;
  onLogin: () => void;
};
export function RegisterPresentation({
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
  done,
  confirmationSent,
  firstName,
  middleName,
  lastName,
  mobilePhone,
  dateOfBirth,
  civilStatus,
  setFirstName,
  setMiddleName,
  setLastName,
  setMobilePhone,
  setDateOfBirth,
  setCivilStatus,
  onLogin,
}: Props) {
  const hydrated = useWebsiteHydrated();
  if (done) {
    return (
      <div
        className="login-shell"
        style={
          !content.marketing.enabled
            ? { gridTemplateColumns: "1fr" }
            : undefined
        }
      >
        <div className="login-panel" style={{ gridColumn: "1 / -1" }}>
          <div className="login-card">
            <Link
              href={mode === "preview" ? "#" : "/"}
              className="inline-flex items-center no-underline mb-4"
            >
              <WebsiteLogo
                site={site}
                assets={assets}
                assetUrls={mode === "preview" ? assetUrls : undefined}
                height={36}
              />
            </Link>
            <h3>Check your email</h3>
            <p className="s">
              {confirmationSent
                ? "We sent a confirmation link to your inbox. Open it to confirm your email — you will be signed in automatically."
                : "Your account has been created. If you don't see a confirmation email in a few minutes, please check your spam folder, or try logging in. If you still need help, contact our office."}
            </p>
            <Button
              type="button"
              variant="accent"
              size="lg"
              block
              onClick={() => onLogin()}
            >
              Go to log in
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
        <div className="login-card login-card-wide">
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
          <h3>{content.greeting}</h3>
          <p className="s">{content.subtitle}</p>

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
                <Select
                  id="civilStatus"
                  value={civilStatus}
                  onChange={(e) => setCivilStatus(e.target.value)}
                >
                  <option value="">Select</option>
                  {CIVIL_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
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

          <div className="login-foot">
            {content.footerPrompt}{" "}
            <Link
              href={mode === "preview" ? "#" : "/login?redirect=/borrower"}
              className="font-semibold text-teal-700 no-underline hover:underline"
            >
              {content.footerLinkLabel}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
