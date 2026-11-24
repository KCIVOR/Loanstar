import { NextResponse } from "next/server";
import { z } from "zod";
import { formatZodError } from "@/lib/api/zod-error";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { getBorrowerActiveLoans } from "@/lib/computation/active-loans";
import {
  findCrossBucketAccountNos,
  findDuplicateAccountNos,
} from "@/lib/computation/deduction-breakdown";
import { getActiveComputation } from "@/lib/csa/computation";
import { recomputeAtRelease } from "@/lib/lra/release-service";
import { requireModulePermission } from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

// Same body as the Committee override route (the two share the calculator
// panel), with a required `reason` instead of the optional `message`.
const recomputeSchema = z.object({
  amount: z.number().positive(),
  inputMode: z.enum(["NET_SARADO", "NET_LESS_SECURITY", "PRINCIPAL"]),
  terms: z.number().int().positive(),
  addonMonths: z.number().int().min(0).optional(),
  loanTypeId: z.string().uuid().optional(),
  /** SME/Individual only — free-text rate override. Ignored for Seafarer. */
  pfRate: z.number().min(0).optional(),
  interestRate: z.number().min(0).optional(),
  adminRate: z.number().min(0).optional(),
  chattelRate: z.number().min(0).optional(),
  withDsAndNotary: z.boolean().optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  seafarerBorrowerType: z.enum(["SEAFARER", "ALLOTTEE"]).nullable().optional(),
  /** SME or Individual — unified schedule/product choice. Defaults to the
   * application's own payment_schedule (set at intake); Committee may
   * override it here. */
  paymentSchedule: z
    .enum([
      "mpl",
      "salary",
      "monthly",
      "weekly",
      "bi_monthly",
      "quarterly",
      "two_monthly",
      "daily",
      "quarterly_special",
      "two_monthly_special",
    ])
    .optional(),
  originationDiscounts: z
    .array(
      z.object({
        installmentNo: z.number().int().positive(),
        percent: z.number().min(0).max(100),
      }),
    )
    .optional(),
  /** Daily Interest only — manual payment date. */
  paymentDate: z.string().optional(),
  /** Planned release date (YYYY-MM-DD); Daily uses it as its interest anchor. */
  releaseDate: z
    .string()
    .refine(
      (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)),
      "Release date must be a valid date (YYYY-MM-DD)",
    )
    .optional(),
  /** Required — why LRA is changing the computation (written to the audit log). */
  reason: z.string().trim().min(1, "A reason is required").max(2000),
  otherDeductions: z
    .object({
      otherLoan: z.number().min(0).optional(),
      otherLoanAccountNo: z.string().nullable().optional(),
      offset: z.number().min(0).optional(),
      offsetAccountNo: z.string().nullable().optional(),
      offsetMonths: z.number().min(0).optional(),
      otherLoans: z
        .array(
          z.object({
            accountNo: z.string().nullable(),
            amount: z.number().min(0),
            // Early-settlement discount breakdown (Phase 5) — optional,
            // present only when a discount was applied in the modal.
            discountAmount: z.number().min(0).optional(),
            discountedInstallmentNos: z.array(z.number().int().positive()).optional(),
          }),
        )
        .optional(),
      offsets: z
        .array(
          z.object({
            accountNo: z.string().nullable(),
            amount: z.number().min(0),
            months: z.number().min(0).nullable(),
          }),
        )
        .optional(),
      advancePayment: z.number().min(0).optional(),
      previousLoanBalance: z.number().min(0).optional(),
      accountOpening: z.number().min(0).optional(),
    })
    .superRefine((val, ctx) => {
      for (const dup of findDuplicateAccountNos(val.otherLoans)) {
        ctx.addIssue(`Duplicate account "${dup}" in Offset entries`);
      }
      for (const dup of findDuplicateAccountNos(val.offsets)) {
        ctx.addIssue(`Duplicate account "${dup}" in Other Loan entries`);
      }
      for (const dup of findCrossBucketAccountNos(val.otherLoans, val.offsets)) {
        ctx.addIssue(
          `Account "${dup}" cannot be targeted by both Offset and Other Loan in the same computation`,
        );
      }
    })
    .optional(),
});

/** Calculator data for the LRA panel: the active computation, the borrower's
 * active loans (Offset / Other Loan pickers), and what a recompute would clear. */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireModulePermission("release_lra", "view");
    const { id } = await params;
    const supabase = await createClient();

    const { data: app } = await supabase
      .from("loan_applications")
      .select("id, borrower_id, segment, collateral_type, payment_schedule")
      .eq("id", id)
      .maybeSingle();
    if (!app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const computation = await getActiveComputation(supabase, id);
    const activeLoans = await getBorrowerActiveLoans(
      createServiceClient(),
      app.borrower_id as string | null,
    );

    const { data: releaseRow } = await supabase
      .from("release_files")
      .select("id, status")
      .eq("loan_application_id", id)
      .maybeSingle();

    let generatedDocuments = 0;
    let pdcChecks = 0;
    let briefingAcknowledged = false;
    if (releaseRow) {
      const [docs, checks, briefing] = await Promise.all([
        supabase
          .from("generated_documents")
          .select("id", { count: "exact", head: true })
          .eq("release_file_id", releaseRow.id),
        supabase
          .from("pdc_checks")
          .select("id", { count: "exact", head: true })
          .eq("release_file_id", releaseRow.id),
        supabase
          .from("briefings")
          .select("acknowledged_at")
          .eq("release_file_id", releaseRow.id)
          .maybeSingle(),
      ]);
      generatedDocuments = docs.count ?? 0;
      pdcChecks = checks.count ?? 0;
      briefingAcknowledged = Boolean(briefing.data?.acknowledged_at);
    }

    return jsonOk({
      computation,
      activeLoans,
      application: {
        segment:
          app.segment === "sme" || app.segment === "individual"
            ? app.segment
            : "seafarer",
        collateralType:
          app.collateral_type === "car_refinancing" ||
          app.collateral_type === "real_estate"
            ? app.collateral_type
            : "none",
        paymentSchedule: (app.payment_schedule as string | null) ?? null,
      },
      releaseFileStatus: (releaseRow?.status as string | null) ?? null,
      wouldClear: { generatedDocuments, pdcChecks, briefingAcknowledged },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** LRA recompute at the release stage — see `recomputeAtRelease`. */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const user = await requireModulePermission("release_lra", "edit");
    const { id } = await params;
    const { reason, ...input } = recomputeSchema.parse(await request.json());
    const supabase = await createClient();

    const result = await recomputeAtRelease(supabase, id, user.id, input, reason);

    return jsonOk({
      computation: result.computation,
      cleared: result.cleared,
      releaseFileStatus: result.status,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: formatZodError(error) }, { status: 400 });
    }
    return handleApiError(error);
  }
}
