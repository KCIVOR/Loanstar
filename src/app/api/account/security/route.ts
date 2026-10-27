import { createClient as createIsolatedClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

import { changeSecurity } from "@/lib/account/security";
import { approvalOrigin, EmailChangeError, requestEmailChange } from "@/lib/account/email-change";
import { emailChangeDependencies } from "@/lib/account/email-change-server";
import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError } from "@/lib/api/handler";
import { requireAuth } from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireAuth();
    const pending = await emailChangeDependencies(user.id).rpc("pending", { p_user_id: user.id });
    return NextResponse.json({ email: user.email ?? "", pendingEmail: pending?.newEmail ?? user.new_email ?? null,
      verificationMode: pending ? "current_email" : "native", emailChangeStatus: pending?.status ?? null });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    if (request.headers.get("origin") !== origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
    }
    const user = await requireAuth();
    const body: unknown = await request.json();
    const supabase = await createClient();
    const { data: auditReady, error: auditError } = await supabase.rpc("settings_security_audit_ready");
    if (auditError || auditReady !== true) {
      return NextResponse.json({ error: "Security settings are temporarily unavailable. Please contact support." }, { status: 503 });
    }
    const result = await changeSecurity(user, body, {
      async requestEmailChange(email) {
        const configured = process.env.EMAIL_CHANGE_APP_ORIGIN || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
        return requestEmailChange(user, email, approvalOrigin(origin, configured, process.env.NODE_ENV === "production"), emailChangeDependencies(user.id));
      },
      async verifyPassword(email, password, userId) {
        // An isolated client prevents reauthentication from replacing the user's current session.
        const verifier = createIsolatedClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
        );
        const { data, error } = await verifier.auth.signInWithPassword({ email, password });
        if (error || data.user?.id !== userId) return false;
        await verifier.auth.signOut({ scope: "local" });
        return true;
      },
      async recordAttempt(kind, details) {
        return Boolean(await writeAuditEvent({
          actorId: user.id, moduleSlug: "account_settings",
          action: `${kind}_change_attempt`, entityType: "user", entityId: user.id,
          afterData: details,
        }));
      },
      async update(attributes) {
        const { data, error } = await supabase.auth.updateUser(attributes, {
          emailRedirectTo: `${origin}/auth/confirm`,
        });
        if (error) throw new Error(error.message);
        return { email: data.user?.email };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EmailChangeError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid settings" }, { status: 400 });
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    // Do not log credential payloads or raw provider objects.
    if (error instanceof Error && error.name === "Error") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
