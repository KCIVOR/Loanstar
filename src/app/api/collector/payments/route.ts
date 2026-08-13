import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { paymentIdsLockedForCollectorDesk } from "@/lib/collector/desk";
import { DOCUMENT_BUCKET } from "@/lib/constants";
import {
  assertPaymentProofPathOwnedByBorrower,
  isAllowedPaymentProofMime,
} from "@/lib/payments/proof-storage";
import {
  ForbiddenError,
  hasModulePermission,
  requireAuth,
} from "@/lib/permissions/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const PAYMENT_SELECT = `
  id,
  reference_no,
  payment_date,
  amount,
  status,
  channel,
  masterlist_id,
  created_at,
  reviewed_at,
  storage_path,
  file_name,
  uploaded_by,
  masterlist (
    borrower_name,
    loan_account_no,
    segment
  )
`;

const recordSchema = z.object({
  masterlistId: z.string().uuid(),
  referenceNo: z.string().optional(),
  paymentDate: z.string().min(1),
  amount: z.number().positive(),
  channel: z.enum(["bank_deposit", "check", "pos_cash"]),
  storagePath: z.string().optional(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
});

type Scope = "desk" | "dcr" | "history";

function parseScope(raw: string | null): Scope {
  if (raw === "dcr" || raw === "history") return raw;
  return "desk";
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const isCollector = await hasModulePermission("collection", "view", user.id);
    const isRemedial = await hasModulePermission("remedial", "view", user.id);
    if (!isCollector && !isRemedial) {
      throw new ForbiddenError(
        "Missing 'view' permission on module 'collection' or 'remedial'",
      );
    }

    const supabase = await createClient();
    const scope = parseScope(new URL(request.url).searchParams.get("scope"));

    let assignmentQuery = supabase
      .from("assignments")
      .select("masterlist_id");
    if (isCollector) {
      assignmentQuery = assignmentQuery.eq("collector_user_id", user.id);
    } else {
      assignmentQuery = assignmentQuery.eq("remedial_user_id", user.id);
    }

    const { data: assignments } = await assignmentQuery;

    const ids = (assignments ?? []).map((a) => a.masterlist_id as string);
    if (!ids.length) {
      return jsonOk({ payments: [] });
    }

    const statuses =
      scope === "history"
        ? ["pending_verification", "confirmed", "rejected", "posted"]
        : scope === "dcr"
          ? ["confirmed"]
          : ["pending_verification", "confirmed"];

    const { data, error } = await supabase
      .from("payments")
      .select(PAYMENT_SELECT)
      .in("masterlist_id", ids)
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(scope === "history" ? 200 : 100);

    if (error) throw new Error(error.message);

    const paymentIds = (data ?? []).map((p) => p.id as string);
    let locked = new Set<string>();
    let draftIds = new Set<string>();

    if (paymentIds.length && scope !== "history") {
      const { data: itemRows, error: itemError } = await supabase
        .from("dcr_items")
        .select("payment_id, dcr!inner ( status )")
        .in("payment_id", paymentIds);

      if (itemError) throw new Error(itemError.message);

      const mapped = (itemRows ?? []).map((row) => {
        const dcr = row.dcr as
          | { status: string }
          | { status: string }[]
          | null;
        const status = Array.isArray(dcr)
          ? (dcr[0]?.status ?? "")
          : (dcr?.status ?? "");
        return {
          payment_id: row.payment_id as string,
          dcr_status: status,
        };
      });

      locked = paymentIdsLockedForCollectorDesk(mapped);
      for (const row of mapped) {
        if (row.dcr_status.trim().toLowerCase() === "draft") {
          draftIds.add(row.payment_id);
        }
      }
    }

    let payments = data ?? [];

    if (scope === "desk") {
      payments = payments.filter((p) => !locked.has(p.id as string));
    } else if (scope === "dcr") {
      // Confirmed and not yet on submitted/reconciled; draft membership OK (In DCR).
      payments = payments.filter((p) => !locked.has(p.id as string));
    }

    const uploaderIds = Array.from(
      new Set(
        payments
          .map((p) => p.uploaded_by as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const nameById = new Map<string, string>();
    if (uploaderIds.length > 0) {
      const admin = createServiceClient();
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", uploaderIds);
      for (const p of profiles ?? []) {
        nameById.set(
          p.id as string,
          (p.full_name as string) || (p.email as string),
        );
      }
    }

    const paymentsWithNames = payments.map((p) => ({
      ...p,
      uploadedByName: p.uploaded_by
        ? (nameById.get(p.uploaded_by as string) ?? null)
        : null,
    }));

    return jsonOk({
      payments: paymentsWithNames,
      draftPaymentIds: [...draftIds],
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const isCollector = await hasModulePermission("collection", "edit", user.id);
    const isRemedial = await hasModulePermission("remedial", "edit", user.id);
    if (!isCollector && !isRemedial) {
      throw new ForbiddenError(
        "Missing 'edit' permission on module 'collection' or 'remedial'",
      );
    }

    const body = recordSchema.parse(await request.json());
    const supabase = await createClient();

    let assignmentQuery = supabase
      .from("assignments")
      .select("masterlist_id")
      .eq("masterlist_id", body.masterlistId);
    if (isCollector) {
      assignmentQuery = assignmentQuery.eq("collector_user_id", user.id);
    } else {
      assignmentQuery = assignmentQuery.eq("remedial_user_id", user.id);
    }

    const { data: assignment } = await assignmentQuery.maybeSingle();

    if (!assignment) {
      throw new ForbiddenError("You are not assigned to this account");
    }

    const { data: masterlist, error: mlError } = await supabase
      .from("masterlist")
      .select("id, loan_application_id, borrower_id")
      .eq("id", body.masterlistId)
      .single();

    if (mlError || !masterlist) {
      throw new ForbiddenError("Account not found");
    }

    const borrowerId = masterlist.borrower_id as string;

    if (body.storagePath || body.fileName) {
      if (!body.storagePath || !body.fileName) {
        return NextResponse.json(
          { error: "storagePath and fileName are required together" },
          { status: 400 },
        );
      }
      try {
        assertPaymentProofPathOwnedByBorrower(body.storagePath, borrowerId);
      } catch (pathError) {
        return NextResponse.json(
          {
            error:
              pathError instanceof Error
                ? pathError.message
                : "Invalid payment proof storage path",
          },
          { status: 400 },
        );
      }
      if (body.mimeType && !isAllowedPaymentProofMime(body.mimeType)) {
        return NextResponse.json(
          { error: "Unsupported file type for payment proof" },
          { status: 400 },
        );
      }
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("payments")
      .insert({
        masterlist_id: body.masterlistId,
        loan_application_id: masterlist.loan_application_id,
        borrower_id: borrowerId,
        reference_no: body.referenceNo ?? null,
        payment_date: body.paymentDate,
        amount: body.amount,
        channel: body.channel,
        storage_path: body.storagePath ?? null,
        file_name: body.fileName ?? null,
        status: "confirmed",
        uploaded_by: user.id,
        reviewed_by: user.id,
        reviewed_at: now,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to record payment");
    }

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: isCollector ? "collection" : "remedial",
      action: "create",
      entityType: "payment",
      entityId: data.id,
      afterData: {
        masterlistId: body.masterlistId,
        amount: body.amount,
        channel: body.channel,
        status: "confirmed",
        bucket: DOCUMENT_BUCKET,
      },
    });

    return jsonOk({ payment: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
