import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { mapBorrowerRow, type Address } from "@/lib/borrowers/types";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getRequestIp } from "@/lib/permissions/server";
import { createServiceClient } from "@/lib/supabase/server";

const addressSchema = z.object({
  street: z.string().optional(),
  barangay: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(100),
  middleName: z.string().max(100).optional(),
  lastName: z.string().min(1).max(100),
  suffix: z.string().max(20).optional(),
  dateOfBirth: z.string().optional(),
  placeOfBirth: z.string().max(200).optional(),
  citizenship: z.string().max(100).optional(),
  civilStatus: z.string().max(50).optional(),
  gender: z.string().max(50).optional(),
  mobilePhone: z.string().max(30).optional(),
  landline: z.string().max(30).optional(),
  presentAddress: addressSchema.optional(),
  permanentAddress: addressSchema.optional(),
});

/** Anon client for Auth signUp so Supabase sends the confirmation email. */
function createSignupClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}

async function writeServiceAudit(input: {
  actorId: string;
  actorRoleId?: string | null;
  moduleSlug: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  ipAddress?: string | null;
}) {
  const service = createServiceClient();
  const ipAddress = input.ipAddress ?? (await getRequestIp());

  const { error } = await service.from("audit_events").insert({
    actor_id: input.actorId,
    actor_role_id: input.actorRoleId ?? null,
    module_slug: input.moduleSlug,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    before_data: input.beforeData ?? null,
    after_data: input.afterData ?? null,
    ip_address: ipAddress,
  });

  if (error) {
    throw new Error(`Failed to write audit event: ${error.message}`);
  }
}

export async function POST(request: Request) {
  try {
    const body = registerSchema.parse(await request.json());
    const service = createServiceClient();
    const email = body.email.trim().toLowerCase();
    const origin = new URL(request.url).origin;

    // Supabase Auth sends the confirmation email when "Confirm email" is
    // enabled in Authentication → Providers → Email (not Resend).
    const signup = createSignupClient();
    const { data: authData, error: authError } = await signup.auth.signUp({
      email,
      password: body.password,
      options: {
        emailRedirectTo: `${origin}/login?redirect=/borrower`,
        data: {
          full_name: [body.firstName, body.middleName, body.lastName]
            .filter(Boolean)
            .join(" "),
        },
      },
    });

    if (authError || !authData.user) {
      const message = authError?.message ?? "Failed to create user account";
      if (/already|registered|exists/i.test(message)) {
        return NextResponse.json(
          { error: "An account with this email already exists." },
          { status: 409 },
        );
      }
      throw new Error(message);
    }

    const userId = authData.user.id;
    // No session ⇒ confirmations are on and Supabase queued the email.
    // Session present ⇒ confirmations are off (user can log in immediately).
    const requiresEmailConfirmation = !authData.session;
    const confirmationSent = requiresEmailConfirmation;

    let borrower: Record<string, unknown> | null = null;

    try {
      const { data: created, error: borrowerError } = await service
        .from("borrowers")
        .insert({
          user_id: userId,
          email,
          first_name: body.firstName,
          middle_name: body.middleName ?? null,
          last_name: body.lastName,
          suffix: body.suffix ?? null,
          date_of_birth: body.dateOfBirth ?? null,
          place_of_birth: body.placeOfBirth ?? null,
          citizenship: body.citizenship ?? "Filipino",
          civil_status: body.civilStatus ?? null,
          gender: body.gender ?? null,
          mobile_phone: body.mobilePhone ?? null,
          landline: body.landline ?? null,
          present_address: (body.presentAddress ?? {}) as Address,
          permanent_address: (body.permanentAddress ?? {}) as Address,
        })
        .select("*")
        .single();

      if (borrowerError || !created) {
        throw new Error(
          borrowerError?.message ?? "Failed to create borrower profile",
        );
      }
      borrower = created;

      const { data: borrowerRole } = await service
        .from("roles")
        .select("id")
        .eq("slug", "borrower")
        .single();

      if (borrowerRole) {
        const { error: roleError } = await service.from("user_roles").insert({
          user_id: userId,
          role_id: borrowerRole.id,
          assigned_by: userId,
        });
        if (roleError) {
          throw new Error(`Failed to assign borrower role: ${roleError.message}`);
        }
      }
    } catch (profileError) {
      if (borrower?.id) {
        await service.from("borrowers").delete().eq("id", borrower.id);
      }
      await service.auth.admin.deleteUser(userId);
      throw profileError;
    }

    if (!borrower) {
      throw new Error("Borrower profile was not created");
    }

    await writeServiceAudit({
      actorId: userId,
      moduleSlug: "borrower_portal",
      action: "create",
      entityType: "borrower",
      entityId: borrower.id as string,
      afterData: {
        borrowerNo: borrower.borrower_no,
        email,
        confirmationSent,
        requiresEmailConfirmation,
        provider: "supabase_auth",
      },
    });

    return jsonOk(
      {
        borrower: mapBorrowerRow(borrower as never),
        requiresEmailConfirmation,
        confirmationSent,
      },
      201,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
