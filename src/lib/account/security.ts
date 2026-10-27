import { z } from "zod";

export const securitySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("password"),
    currentPassword: z.string().min(1).max(1024),
    password: z.string().min(8).max(1024),
    confirmPassword: z.string().max(1024),
  }).refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match", path: ["confirmPassword"],
  }).refine((value) => value.currentPassword !== value.password, {
    message: "Choose a different new password", path: ["password"],
  }),
  z.object({
    kind: z.literal("email"),
    currentPassword: z.string().min(1).max(1024),
    email: z.string().trim().email().max(254),
  }),
]);

export type SecurityInput = z.infer<typeof securitySchema>;
export type SecurityDependencies = {
  requestEmailChange: (email: string) => Promise<unknown>;
  verifyPassword: (email: string, password: string, userId: string) => Promise<boolean>;
  recordAttempt: (kind: SecurityInput["kind"], details: Record<string, unknown>) => Promise<boolean>;
  update: (attributes: { password?: string; current_password?: string; email?: string }) => Promise<{ email?: string }>;
};

/** Server-only adapters own authentication and persistence; credentials never enter audit data. */
export async function changeSecurity(
  actor: { id: string; email?: string | null; is_anonymous?: boolean },
  raw: unknown,
  dependencies: SecurityDependencies,
) {
  const input = securitySchema.parse(raw);
  if (actor.is_anonymous) throw new Error("Anonymous accounts cannot change login credentials");
  if (!actor.email) throw new Error("This account does not have a login email");
  if (input.kind === "email" && input.email.toLowerCase() === actor.email.toLowerCase()) {
    throw new Error("Choose a different email address");
  }
  if (!await dependencies.verifyPassword(actor.email, input.currentPassword, actor.id)) {
    throw new Error("Current password is incorrect");
  }
  const details = input.kind === "email" ? { email: actor.email, requestedEmail: input.email } : {};
  if (!await dependencies.recordAttempt(input.kind, details)) {
    throw new Error("Unable to record the security request. No change was made. Please try again later.");
  }
  if (input.kind === "email") {
    await dependencies.requestEmailChange(input.email);
    return { status: "email_verification_pending" as const };
  }
  await dependencies.update({ password: input.password, current_password: input.currentPassword });
  return { status: "password_changed" as const };
}
