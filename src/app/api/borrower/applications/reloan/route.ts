import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/audit/writer";
import {
  canStartReloan,
  findResumableDraft,
  nextApplicationKind,
  resolveBorrowerCreateSegment,
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

/**
 * Body segment/entityType is honored for both first and reloan application
 * creation (see resolveBorrowerCreateSegment). Resuming an existing draft
 * still ignores it — that path returns before this is consulted.
 * Loosely typed on purpose: invalid values fall through to the resolver,
 * which returns a clear ok:false error rather than a zod stack trace.
 */
function readSegmentBody(value: unknown): {
  segment?: string | null;
  entityType?: string | null;
} {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const segment = typeof record.segment === "string" ? record.segment : undefined;
  const entityType =
    typeof record.entityType === "string" ? record.entityType : undefined;
  return { segment, entityType };
}

export async function POST(request: Request) {
  try {
    const user = await requireModulePermission("borrower_portal", "create");
    const supabase = await createClient();
    const borrower = await getOwnBorrower(user.id);
    const body = readSegmentBody(await request.json().catch(() => ({})));

    const { data: existingApps, error: existingError } = await supabase
      .from("loan_applications")
      .select(
        "id, status, status_history, is_reloan, parent_application_id, created_at, segment, entity_type",
      )
      .eq("borrower_id", borrower.id)
      .order("created_at", { ascending: false });

    if (existingError) {
      throw new Error(existingError.message);
    }

    // Resume an existing draft rather than error or duplicate — a draft is
    // not a terminal status, so canStartReloan would otherwise permanently
    // block anyone who starts and abandons one. Segment body is ignored here
    // (P3) — a resumed draft already has its slots.
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
            segment: resumable.segment,
            entityType: resumable.entity_type,
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

    const resolved = resolveBorrowerCreateSegment({
      kind: isReloan ? "reloan" : "first",
      bodySegment: body.segment,
      bodyEntityType: body.entityType,
      parentSegment: latestApp?.segment,
      parentEntityType: latestApp?.entity_type,
    });

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }

    const { segment, entityType } = resolved.scope;

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
        segment,
        entity_type: entityType,
      })
      .select(
        "id, status, status_history, is_reloan, parent_application_id, created_at, segment, entity_type",
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
      { segment, entityType },
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
        segment,
        entityType,
        segmentInheritedFromParent: segment === "sme",
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
          segment: application.segment,
          entityType: application.entity_type,
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
