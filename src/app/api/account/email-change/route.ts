import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/permissions/server";
import { approveEmailChange, inspectEmailChange, EmailChangeError } from "@/lib/account/email-change";
import { emailChangeDependencies } from "@/lib/account/email-change-server";

const inputSchema = z.object({ action: z.enum(["inspect", "confirm"]), requestId: z.string().uuid(), token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: "Sign in to the account that requested this change, then reopen the approval email." }, { status: 401 }); }
  try {
    const input = inputSchema.parse(await request.json());
    const deps = emailChangeDependencies(user.id);
    const result = input.action === "inspect"
      ? await inspectEmailChange(user, input.requestId, input.token, deps)
      : await approveEmailChange(user, input.requestId, input.token, deps);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // No raw provider errors or request payloads enter logs or responses.
    return NextResponse.json({ error: error instanceof EmailChangeError ? error.message : "Unable to process this approval link." },
      { status: error instanceof EmailChangeError ? error.status : 400 });
  }
}
