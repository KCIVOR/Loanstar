"use client";
import type {
  AuthPageContent,
  PublicAsset,
  WebsiteContent,
} from "@/lib/website/schema";
import { LoginPresentation } from "./LoginPresentation";
import { RegisterPresentation } from "./RegisterPresentation";
export function AuthPreview({
  content,
  site,
  assets,
  assetUrls,
  register,
}: {
  content: AuthPageContent;
  site: WebsiteContent["site"];
  assets: PublicAsset[];
  assetUrls?: Record<string, string>;
  register: boolean;
}) {
  const noop = () => {};
  const common = {
    content,
    site,
    assets,
    assetUrls,
    mode: "preview" as const,
    email: "",
    password: "",
    showPassword: false,
    loading: false,
    error: null,
    setEmail: noop,
    setPassword: noop,
    setShowPassword: noop,
    handleSubmit: async () => {},
  };
  return register ? (
    <RegisterPresentation
      {...common}
      done={false}
      confirmationSent
      firstName=""
      middleName=""
      lastName=""
      mobilePhone=""
      dateOfBirth=""
      civilStatus=""
      setFirstName={noop}
      setMiddleName={noop}
      setLastName={noop}
      setMobilePhone={noop}
      setDateOfBirth={noop}
      setCivilStatus={noop}
      onLogin={noop}
    />
  ) : (
    <LoginPresentation
      {...common}
      confirming={false}
      remember
      setRemember={noop}
      searchParams={{ get: () => null }}
    />
  );
}
