import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { mapBorrowerRow, type Address } from "@/lib/borrowers/types";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { ensureDocumentSlots } from "@/lib/documents/checklist";
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

async function writeServiceAudit(
  input: Parameters<typeof writeAuditEvent>[0],
) {
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

    const { data: authData, error: authError } =
      await service.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: {
          full_name: [body.firstName, body.middleName, body.lastName]
            .filter(Boolean)
            .join(" "),
        },
      });

    if (authError || !authData.user) {
      throw new Error(authError?.message ?? "Failed to create user account");
    }

    const userId = authData.user.id;

    const { data: borrower, error: borrowerError } = await service
      .from("borrowers")
      .insert({
        user_id: userId,
        email: body.email,
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

    if (borrowerError || !borrower) {
      await service.auth.admin.deleteUser(userId);
      throw new Error(borrowerError?.message ?? "Failed to create borrower profile");
    }

    const initialHistory = [
      {
        status: "registered",
        at: new Date().toISOString(),
        actorId: userId,
        note: "Self-registration",
      },
      {
        status: "documents_pending",
        at: new Date().toISOString(),
        actorId: userId,
        note: null,
      },
    ];

    const { data: application, error: applicationError } = await service
      .from("loan_applications")
      .insert({
        borrower_id: borrower.id,
        status: "documents_pending",
        status_history: initialHistory,
      })
      .select("id, status, status_history, created_at")
      .single();

    if (applicationError || !application) {
      await service.from("borrowers").delete().eq("id", borrower.id);
      await service.auth.admin.deleteUser(userId);
      throw new Error(
        applicationError?.message ?? "Failed to create loan application",
      );
    }

    await ensureDocumentSlots(service, "intake", application.id, borrower.id);

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

    await writeServiceAudit({
      actorId: userId,
      moduleSlug: "borrower_portal",
      action: "create",
      entityType: "borrower",
      entityId: borrower.id,
      afterData: {
        borrowerNo: borrower.borrower_no,
        email: body.email,
        applicationId: application.id,
      },
    });

    return jsonOk(
      {
        borrower: mapBorrowerRow(borrower),
        application: {
          id: application.id,
          status: application.status,
          statusHistory: application.status_history,
          createdAt: application.created_at,
        },
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
