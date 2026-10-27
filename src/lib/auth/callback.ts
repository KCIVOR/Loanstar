import { sessionFromHash } from "./session-from-hash";

type CallbackSession = { user?: { email?: string } };
type Result = {
  error: { message: string } | null;
  data?: { session?: CallbackSession | null; user?: { email?: string } | null };
  message?: string;
  msg?: string;
};
export type CallbackAuth = {
  initialize: () => Promise<Result>;
  getSession: () => Promise<Result & { data: { session: CallbackSession | null } }>;
  setSession: (tokens: { access_token: string; refresh_token: string }) => Promise<Result>;
  verifyOtp: (input: { token_hash: string; type: "recovery" | "email_change" }) => Promise<Result>;
};

export type EmailConfirmationOutcome = {
  hasSession: boolean;
  outcome: "pending" | "verified" | "unverified";
  confirmedEmail: string | null;
  providerMessage: string | null;
};

// In-memory, one-use handoff across the client-side redirect. No tokens, URL
// success flags, localStorage or sessionStorage are used to transport evidence.
let emailConfirmation: EmailConfirmationOutcome | null = null;
export function rememberEmailConfirmation(result: EmailConfirmationOutcome) {
  emailConfirmation = { ...result };
}
export function consumeEmailConfirmation(): EmailConfirmationOutcome | null {
  const result = emailConfirmation;
  emailConfirmation = null;
  return result;
}

export function emailConfirmationFeedback(
  result: EmailConfirmationOutcome,
  state: { email: string; pendingEmail: string | null },
): { kind: "info" | "success"; text: string } {
  if (state.pendingEmail || result.outcome === "pending") {
    return { kind: "info", text: "Your email change is still pending. Confirm the link sent to your other email address to finish the change." };
  }
  if (result.outcome === "verified" && result.confirmedEmail
    && state.email.toLowerCase() === result.confirmedEmail.toLowerCase()) {
    return { kind: "success", text: "Your login email has been updated successfully. Use your new email address the next time you sign in." };
  }
  return { kind: "info", text: "We could not establish that your email change completed. Check the current email shown below and complete any outstanding confirmation links." };
}

/** Capture URL before SDK initialization: PKCE can remove its code automatically. */
export async function processAuthCallback(
  auth: CallbackAuth, url: URL,
  currentUrl: () => URL = () => typeof window === "undefined" ? url : new URL(window.location.href),
): Promise<EmailConfirmationOutcome> {
  const hash = new URLSearchParams(url.hash.slice(1));
  const sanitize = (message: string) => {
    let safe = message;
    for (const key of ["code", "token", "token_hash", "access_token", "refresh_token"]) {
      for (const secret of [url.searchParams.get(key), hash.get(key)]) {
        if (secret) safe = safe.split(secret).join("[redacted]");
      }
    }
    return safe.replace(/https?:\/\/\S+/gi, "[link removed]")
      .replace(/(access_token|refresh_token|token_hash|token|code)=\S+/gi, "$1=[redacted]").slice(0, 500);
  };
  const linkError = url.searchParams.get("error_description") ?? hash.get("error_description")
    ?? url.searchParams.get("error") ?? hash.get("error");
  if (linkError) {
    throw new Error(sanitize(linkError));
  }
  const tokens = sessionFromHash(url.hash);
  const tokenHash = url.searchParams.get("token_hash");
  let result: Result;
  if (tokens) {
    // SSR clients default to PKCE and reject implicit URLs; handle legacy templates explicitly.
    result = await auth.setSession(tokens);
  } else if (tokenHash) {
    const type = url.searchParams.get("type");
    if (type !== "recovery" && type !== "email_change") {
      throw new Error("Unsupported confirmation link");
    }
    result = await auth.verifyOtp({ token_hash: tokenHash, type });
  } else {
    // The browser SDK performs PKCE exchange during initialization.
    result = await auth.initialize();
  }
  if (result.error) {
    throw new Error(sanitize(result.error.message));
  }
  const session = await auth.getSession();
  if (session.error) {
    throw new Error(sanitize(session.error.message));
  }
  const rawMessage = url.searchParams.get("message") ?? hash.get("message") ?? result.message ?? result.msg;
  const providerMessage = rawMessage ? sanitize(rawMessage) : null;
  const firstTokenConfirmation = tokenHash && url.searchParams.get("type") === "email_change"
    && result.data?.session === null && result.data.user === null;
  const pending = firstTokenConfirmation || /confirm.*(?:other|both).*email/i.test(providerMessage ?? "");
  // A cached session cannot prove a PKCE exchange occurred. The SDK removes
  // the code only after successful exchange; missing verifier leaves it intact.
  const exchangedCode = Boolean(url.searchParams.get("code")) && !currentUrl().searchParams.has("code");
  const verifiedSession = tokens || tokenHash ? result.data?.session : exchangedCode ? session.data.session : null;
  const verificationType = url.searchParams.get("type") ?? hash.get("type");
  const emailChangeCallback = url.pathname === "/auth/confirm"
    && (verificationType === null || verificationType === "email_change");
  const confirmedEmail = emailChangeCallback ? verifiedSession?.user?.email ?? null : null;
  return {
    hasSession: Boolean(session.data.session),
    outcome: pending ? "pending" : confirmedEmail ? "verified" : "unverified",
    confirmedEmail: pending ? null : confirmedEmail,
    providerMessage,
  };
}

/** Keep the password-recovery contract unchanged. */
export async function finishAuthCallback(auth: CallbackAuth, url: URL): Promise<boolean> {
  return (await processAuthCallback(auth, url)).hasSession;
}
