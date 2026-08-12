import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { ensureDocumentSlots } from "@/lib/documents/checklist";

export const createApplicationSchema = z
  .object({
    email: z.string().email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    middleName: z.string().optional(),
    mobilePhone: z.string().optional(),
    segment: z.enum(["seafarer", "sme"]).default("seafarer"),
    entityType: z.enum(["individual", "corporate"]).optional(),
  })
  .refine((data) => data.segment !== "sme" || data.entityType != null, {
    message: "entityType is required when segment is sme",
    path: ["entityType"],
  });

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export async function createCsaApplication(
  supabase: SupabaseClient,
  actorId: string,
  body: CreateApplicationInput,
): Promise<{ applicationId: string; borrowerId: string }> {
  const { data: existingBorrower } = await supabase
    .from("borrowers")
    .select("id")
    .eq("email", body.email.toLowerCase())
    .maybeSingle();

  let borrowerId = existingBorrower?.id as string | undefined;

  if (!borrowerId) {
    const { data: createdBorrower, error: borrowerError } = await supabase
      .from("borrowers")
      .insert({
        email: body.email.toLowerCase(),
        first_name: body.firstName,
        middle_name: body.middleName ?? null,
        last_name: body.lastName,
        mobile_phone: body.mobilePhone ?? null,
      })
      .select("id")
      .single();

    if (borrowerError) {
      throw new Error(borrowerError.message);
    }
    borrowerId = createdBorrower.id as string;
  }

  const { data: application, error: appError } = await supabase
    .from("loan_applications")
    .insert({
      borrower_id: borrowerId,
      status: "submitted",
      segment: body.segment,
      entity_type: body.entityType ?? null,
      status_history: [
        {
          status: "submitted",
          at: new Date().toISOString(),
          actorId,
          note: "CSA created application",
        },
      ],
    })
    .select("id, status, created_at")
    .single();

  if (appError) {
    throw new Error(appError.message);
  }

  await supabase.from("application_details").upsert({
    loan_application_id: application.id,
    internal_flags: {},
  });

  await ensureDocumentSlots(supabase, "intake", application.id, borrowerId, {
    segment: body.segment,
    entityType: body.entityType ?? null,
  });

  await writeAuditEvent({
    actorId,
    moduleSlug: "intake",
    action: "create",
    entityType: "loan_application",
    entityId: application.id,
    afterData: {
      borrowerId,
      email: body.email,
      segment: body.segment,
      entityType: body.entityType ?? null,
    },
  });

  return { applicationId: application.id as string, borrowerId };
}
