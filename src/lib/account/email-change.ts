import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export type EmailChangeRequest = { id: string; oldEmail: string; newEmail: string; status: "pending" | "processing" | "completed"; expiresAt: string };
type Params = { p_user_id: string; p_request_id?: string; p_token_hash?: string; p_new_email?: string; p_old_email?: string };
export type EmailChangeDependencies = {
  rpc: (action: "start" | "pending" | "inspect" | "claim" | "delivery_failed" | "failed", params: Params) => Promise<EmailChangeRequest | null>;
  sendApproval: (input: { to: string; newEmail: string; approvalUrl: string }) => Promise<void>;
  updateAuthEmail: (email: string) => Promise<{ email?: string }>;
  isDefiniteRejection: (error: unknown) => boolean;
};
type Actor = { id: string; email?: string | null };
export class EmailChangeError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const hashApprovalToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function approvalOrigin(requestOrigin: string, configured: string | undefined, production: boolean) {
  if (production && !configured) throw new EmailChangeError("Email approval is temporarily unavailable", 503);
  const url = new URL(configured || requestOrigin);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && local && !production))) {
    throw new EmailChangeError("Email approval is temporarily unavailable", 503);
  }
  return url.origin;
}

export async function requestEmailChange(actor: Actor, email: string, origin: string, deps: EmailChangeDependencies) {
  const newEmail = z.string().trim().email().max(254).parse(email).toLowerCase();
  if (!actor.email || actor.email.toLowerCase() === newEmail) throw new EmailChangeError("Choose a different email address");
  const token = randomBytes(32).toString("hex");
  let request: EmailChangeRequest | null;
  try { request = await deps.rpc("start", { p_user_id: actor.id, p_old_email: actor.email, p_new_email: newEmail, p_token_hash: hashApprovalToken(token) }); }
  catch { throw new EmailChangeError("Unable to request this email change. Check the address or try again later."); }
  if (!request) throw new EmailChangeError("Email approval is temporarily unavailable", 503);
  const url = new URL("/auth/email-change", origin);
  url.hash = new URLSearchParams({ request_id: request.id, approval_token: token }).toString();
  try { await deps.sendApproval({ to: actor.email, newEmail: request.newEmail, approvalUrl: url.href }); }
  catch {
    await deps.rpc("delivery_failed", { p_user_id: actor.id, p_request_id: request.id, p_token_hash: hashApprovalToken(token) }).catch(() => null);
    throw new EmailChangeError("Unable to send approval email. Please try again later.", 503);
  }
  return { newEmail: request.newEmail, expiresAt: request.expiresAt };
}

async function access(actor: Actor, id: string, token: string, action: "inspect" | "claim", deps: EmailChangeDependencies) {
  if (!z.string().uuid().safeParse(id).success || !/^[a-f0-9]{64}$/.test(token)) throw new EmailChangeError("This approval link is invalid or expired.");
  try {
    const request = await deps.rpc(action, { p_user_id: actor.id, p_request_id: id, p_token_hash: hashApprovalToken(token) });
    if (!request) throw new Error();
    return request;
  } catch { throw new EmailChangeError("This approval link is invalid, expired, superseded, or already being processed. Use the account that requested it."); }
}
export function inspectEmailChange(actor: Actor, id: string, token: string, deps: EmailChangeDependencies) {
  return access(actor, id, token, "inspect", deps);
}
export async function approveEmailChange(actor: Actor, id: string, token: string, deps: EmailChangeDependencies) {
  const request = await access(actor, id, token, "claim", deps);
  if (request.status === "completed") return { status: "email_changed" as const, email: request.newEmail };
  let updated: { email?: string };
  try { updated = await deps.updateAuthEmail(request.newEmail); }
  catch (error) {
    if (deps.isDefiniteRejection(error)) {
      await deps.rpc("failed", { p_user_id: actor.id, p_request_id: id, p_token_hash: hashApprovalToken(token) }).catch(() => null);
      throw new EmailChangeError("Unable to complete this email change. Check Settings before requesting a new link.");
    }
    throw new EmailChangeError("We could not verify completion. Check Settings or contact support before trying again.", 503);
  }
  const completed = await access(actor, id, token, "inspect", deps);
  if (updated.email?.toLowerCase() !== request.newEmail.toLowerCase() || completed.status !== "completed") {
    throw new EmailChangeError("We could not verify completion. Check Settings or contact support.", 503);
  }
  return { status: "email_changed" as const, email: completed.newEmail };
}
