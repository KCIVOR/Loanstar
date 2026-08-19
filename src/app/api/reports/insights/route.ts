import { NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError, jsonOk } from "@/lib/api/handler";
import { writeAuditEvent } from "@/lib/audit/writer";
import { requireModulePermission } from "@/lib/permissions/server";
import { loadReportsAiConfig } from "@/lib/reports/assistant/config";
import { buildEvidenceBundle } from "@/lib/reports/insights/evidence";
import { generateExecutiveBrief } from "@/lib/reports/insights/generate";
import { clampMonths, DEFAULT_TREND_MONTHS } from "@/lib/reports/trends";
import { createServiceClient } from "@/lib/supabase/server";

/** Reconstructing a year of history and then waiting on the model runs well
 *  past Vercel's 10s default. No other reports route needs this. */
export const maxDuration = 60;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const generateSchema = z.object({
  period: z.object({ from: isoDate, to: isoDate }),
  months: z.number().int().optional(),
});

const BRIEF_COLUMNS =
  "id, period_from, period_to, months, model, brief, evidence, created_at, generated_by";

type BriefRow = {
  id: string;
  period_from: string;
  period_to: string;
  months: number;
  model: string;
  brief: unknown;
  evidence: unknown;
  created_at: string;
};

function toResponse(row: BriefRow) {
  return {
    id: row.id,
    period: { from: row.period_from, to: row.period_to },
    months: row.months,
    model: row.model,
    brief: row.brief,
    evidence: row.evidence,
    createdAt: row.created_at,
  };
}

/** Latest brief for the requested period, plus recent history for the picker. */
export async function GET(request: Request) {
  try {
    await requireModulePermission("reports", "view");
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const admin = createServiceClient();

    let latest: BriefRow | null = null;
    if (from && to) {
      const { data, error } = await admin
        .from("reports_insight_briefs")
        .select(BRIEF_COLUMNS)
        .eq("period_from", from)
        .eq("period_to", to)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      latest = (data as BriefRow | null) ?? null;
    }

    const { data: history, error: historyError } = await admin
      .from("reports_insight_briefs")
      .select("id, period_from, period_to, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (historyError) throw new Error(historyError.message);

    return jsonOk({
      latest: latest ? toResponse(latest) : null,
      history: (history ?? []).map((row) => ({
        id: row.id as string,
        period: { from: row.period_from as string, to: row.period_to as string },
        createdAt: row.created_at as string,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireModulePermission("reports", "view");
    const body = generateSchema.parse(await request.json());
    const months = body.months ? clampMonths(body.months) : DEFAULT_TREND_MONTHS;

    const admin = createServiceClient();
    const cfg = await loadReportsAiConfig(admin);
    if (!cfg.enabled) {
      return NextResponse.json(
        {
          error:
            "Executive Insights is turned off. Ask Super Admin to enable LoanBot in System Config.",
        },
        { status: 503 },
      );
    }
    if (!cfg.ready) {
      return NextResponse.json(
        { error: "Executive Insights is not configured (missing API key)." },
        { status: 503 },
      );
    }

    try {
      const evidence = await buildEvidenceBundle(admin, body.period, months);
      const { brief, droppedRecommendations } = await generateExecutiveBrief({
        apiKey: cfg.apiKey,
        model: cfg.model,
        bundle: evidence,
      });

      const { data, error } = await admin
        .from("reports_insight_briefs")
        .insert({
          generated_by: user.id,
          period_from: body.period.from,
          period_to: body.period.to,
          months,
          model: cfg.model,
          evidence,
          brief,
        })
        .select(BRIEF_COLUMNS)
        .single();
      if (error) throw new Error(error.message);

      await writeAuditEvent({
        actorId: user.id,
        moduleSlug: "reports",
        action: "generate",
        entityType: "reports_insight_brief",
        entityId: data.id as string,
        afterData: {
          period: body.period,
          months,
          model: cfg.model,
          sections: brief.sections.length,
          recommendations: brief.recommendations.length,
          droppedRecommendations,
        },
      });

      return jsonOk({ ...toResponse(data as BriefRow), droppedRecommendations });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Brief generation failed";
      if (
        message.startsWith("OpenAI") ||
        /\bHTTP [45]\d\d\b/.test(message) ||
        error instanceof DOMException
      ) {
        return NextResponse.json({ error: message }, { status: 502 });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return handleApiError(error);
  }
}
