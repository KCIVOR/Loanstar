import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/writer";
import {
  canStartReloan,
  findResumableDraft,
  nextApplicationKind,
} from "@/lib/borrowers/reloan";
import { mapBorrowerRow } from "@/lib/borrowers/types";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import { ensureDocumentSlots } from "@/lib/documents/checklist";
import {
  ForbiddenError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { createClient } from "@/lib/supabase/server";

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

export async function POST() {
  try {
    const user = await requireModulePermission("borrower_portal", "create");
    const supabase = await createClient();
    const borrower = await getOwnBorrower(user.id);

    const { data: existingApps, error: existingError } = await supabase
      .from("loan_applications")
      .select("id, status, status_history, is_reloan, parent_application_id, created_at")
      .eq("borrower_id", borrower.id)
      .order("created_at", { ascending: false });

    if (existingError) {
      throw new Error(existingError.message);
    }

    // Resume an existing draft rather than error or duplicate — a draft is
    // not a terminal status, so canStartReloan would otherwise permanently
    // block anyone who starts and abandons one.
    const resumable = findResumableDraft(existingApps ?? []);
    if (resumable) {
      return jsonOk(
        {
          application: {
            id: resumable.id,
            status: resumable.status,
            statusHistory: resumable.status_history,
            isReloan: resumable.is_reloan,
            parentApplicationId: resumable.parent_application_id,
            createdAt: resumable.created_at,
            kind: resumable.is_reloan ? "reloan" : "first",
          },
          profile: mapBorrowerRow(borrower),
          resumed: true,
        },
        200,
      );
    }

    const statuses = (existingApps ?? []).map((app) => String(app.status));
    const eligibility = canStartReloan({ applicationStatuses: statuses });
    if (!eligibility.ok) {
      return NextResponse.json({ error: eligibility.reason }, { status: 400 });
    }

    const kind = nextApplicationKind({ applicationStatuses: statuses });
    const isReloan = kind === "reloan";
    const latestApp = existingApps?.[0] ?? null;
    const now = new Date().toISOString();

    const { data: application, error: applicationError } = await supabase
      .from("loan_applications")
      .insert({
        borrower_id: borrower.id,
        status: "draft",
        status_history: [
          {
            status: "draft",
            at: now,
            actorId: user.id,
            note: isReloan ? "Reloan draft created" : "Application draft created",
          },
        ],
        is_reloan: isReloan,
        parent_application_id: isReloan ? (latestApp?.id ?? null) : null,
      })
      .select(
        "id, status, status_history, is_reloan, parent_application_id, created_at",
      )
      .single();

    if (applicationError || !application) {
      throw new Error(
        applicationError?.message ??
          (isReloan
            ? "Failed to create reloan application"
            : "Failed to create loan application"),
      );
    }

    await ensureDocumentSlots(
      supabase,
      "intake",
      application.id,
      borrower.id,
    );

    await writeAuditEvent({
      actorId: user.id,
      moduleSlug: "borrower_portal",
      action: "create",
      entityType: "loan_application",
      entityId: application.id,
      afterData: {
        isReloan,
        parentApplicationId: application.parent_application_id,
        borrowerNo: borrower.borrower_no,
        kind,
        status: "draft",
      },
    });

    return jsonOk(
      {
        application: {
          id: application.id,
          status: application.status,
          statusHistory: application.status_history,
          isReloan: application.is_reloan,
          parentApplicationId: application.parent_application_id,
          createdAt: application.created_at,
          kind,
        },
        profile: mapBorrowerRow(borrower),
        resumed: false,
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
