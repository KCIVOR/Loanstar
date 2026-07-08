import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import {
  borrowerProfileToRow,
  mapBorrowerRow,
  type Address,
  type AllotteeInfo,
  type Dependent,
  type FinancialInfo,
  type ManningAgency,
  type PicWorkInfo,
  type Reference,
} from "@/lib/borrowers/types";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

const addressSchema = z.object({
  street: z.string().optional(),
  barangay: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
});

const manningAgencySchema = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

const financialSchema = z.object({
  monthlyIncome: z.number().optional(),
  otherIncome: z.number().optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  accountType: z.string().optional(),
});

const allotteeSchema = z.object({
  name: z.string().optional(),
  relationship: z.string().optional(),
  address: addressSchema.optional(),
  phone: z.string().optional(),
});

const picWorkSchema = z.object({
  rank: z.string().optional(),
  vessel: z.string().optional(),
  contractDuration: z.string().optional(),
  embarkationDate: z.string().optional(),
  disembarkationDate: z.string().optional(),
});

const dependentSchema = z.object({
  name: z.string().optional(),
  relationship: z.string().optional(),
  dateOfBirth: z.string().optional(),
});

const referenceSchema = z.object({
  name: z.string().optional(),
  relationship: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
});

const patchProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  middleName: z.string().max(100).nullable().optional(),
  lastName: z.string().min(1).max(100).optional(),
  suffix: z.string().max(20).nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  placeOfBirth: z.string().max(200).nullable().optional(),
  citizenship: z.string().max(100).nullable().optional(),
  civilStatus: z.string().max(50).nullable().optional(),
  gender: z.string().max(50).nullable().optional(),
  mobilePhone: z.string().max(30).nullable().optional(),
  landline: z.string().max(30).nullable().optional(),
  presentAddress: addressSchema.optional(),
  permanentAddress: addressSchema.optional(),
  manningAgency: manningAgencySchema.optional(),
  financial: financialSchema.optional(),
  allottee: allotteeSchema.optional(),
  picWork: picWorkSchema.optional(),
  dependents: z.array(dependentSchema).optional(),
  references: z.array(referenceSchema).optional(),
  profileData: z.record(z.string(), z.unknown()).optional(),
});

async function getOwnBorrower(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("borrowers")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new ForbiddenError("Borrower profile not found");
  }

  return data;
}

export async function GET() {
  try {
    const user = await requireModulePermission("borrower_portal", "view");
    const borrower = await getOwnBorrower(user.id);
    return jsonOk({ profile: mapBorrowerRow(borrower) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireModulePermission("borrower_portal", "edit");
    const body = patchProfileSchema.parse(await request.json());
    const supabase = await createClient();

    const existing = await getOwnBorrower(user.id);
    const updates = borrowerProfileToRow({
      firstName: body.firstName,
      middleName: body.middleName ?? undefined,
      lastName: body.lastName,
      suffix: body.suffix ?? undefined,
      dateOfBirth: body.dateOfBirth ?? undefined,
      placeOfBirth: body.placeOfBirth ?? undefined,
      citizenship: body.citizenship ?? undefined,
      civilStatus: body.civilStatus ?? undefined,
      gender: body.gender ?? undefined,
      mobilePhone: body.mobilePhone ?? undefined,
      landline: body.landline ?? undefined,
      presentAddress: body.presentAddress as Address | undefined,
      permanentAddress: body.permanentAddress as Address | undefined,
      manningAgency: body.manningAgency as ManningAgency | undefined,
      financial: body.financial as FinancialInfo | undefined,
      allottee: body.allottee as AllotteeInfo | undefined,
      picWork: body.picWork as PicWorkInfo | undefined,
      dependents: body.dependents as Dependent[] | undefined,
      references: body.references as Reference[] | undefined,
      profileData: body.profileData,
    });

    const { data: updated, error } = await supabase
      .from("borrowers")
      .update(updates)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "borrower_portal",
      action: "update",
      entityType: "borrower",
      entityId: existing.id,
      beforeData: mapBorrowerRow(existing),
      afterData: mapBorrowerRow(updated),
    });

    return jsonOk({ profile: mapBorrowerRow(updated) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
