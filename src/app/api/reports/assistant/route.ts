import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/audit/writer";
import { handleApiError, jsonOk } from "@/lib/api/handler";
import {
  hasModulePermission,
  isSuperAdmin,
  NotFoundError,
  requireModulePermission,
} from "@/lib/permissions/server";
import { loadReportsAiConfig } from "@/lib/reports/assistant/config";
import { runReportsAssistant } from "@/lib/reports/assistant/loop";
import {
  appendThreadMessages,
  parseStoredMessages,
  titleFromQuestion,
  type StoredChatMessage,
} from "@/lib/reports/assistant/threads";
import { createServiceClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  period: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  threadId: z.string().uuid().nullable().optional(),
  content: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  try {
    const user = await requireModulePermission("reports", "view");
    const body = bodySchema.parse(await request.json());

    const admin = createServiceClient();
    const cfg = await loadReportsAiConfig(admin);
    if (!cfg.enabled) {
      return NextResponse.json(
        {
          error:
            "LoanBot is turned off. Ask Super Admin to enable it in System Config.",
        },
        { status: 503 },
      );
    }
    if (!cfg.ready) {
      return NextResponse.json(
        { error: "LoanBot is not configured (missing API key)." },
        { status: 503 },
      );
    }

    let threadId = body.threadId ?? null;
    let existing: StoredChatMessage[] = [];
    let title = "New chat";

    if (threadId) {
      const { data, error } = await admin
        .from("reports_assistant_threads")
        .select("id, title, messages")
        .eq("id", threadId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new NotFoundError("Chat not found");
      existing = parseStoredMessages(data.messages);
      title = (data.title as string) || "New chat";
    }

    const includeBorrowerNames =
      (await isSuperAdmin(user.id)) ||
      (await hasModulePermission("accounting_ar", "view", user.id));

    const userMessage: StoredChatMessage = { role: "user", content: body.content };
    const llmMessages = [...existing, userMessage].slice(-8);

    try {
      const result = await runReportsAssistant({
        apiKey: cfg.apiKey,
        model: cfg.model,
        period: body.period,
        messages: llmMessages,
        supabase: admin,
        includeBorrowerNames,
      });

      const assistantMessage: StoredChatMessage = {
        role: "assistant",
        content: result.reply,
        ...(result.card ? { card: result.card, evidence: result.evidence } : {}),
      };
      const messages = appendThreadMessages(existing, [userMessage, assistantMessage]);
      if (title === "New chat") title = titleFromQuestion(body.content);
      const now = new Date().toISOString();

      if (!threadId) {
        const { data, error } = await admin
          .from("reports_assistant_threads")
          .insert({
            user_id: user.id,
            title,
            messages,
            updated_at: now,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        threadId = data.id as string;
      } else {
        const { error } = await admin
          .from("reports_assistant_threads")
          .update({ title, messages, updated_at: now })
          .eq("id", threadId)
          .eq("user_id", user.id);
        if (error) throw new Error(error.message);
      }

      await writeAuditEvent({
        actorId: user.id,
        moduleSlug: "reports",
        action: "ask",
        entityType: "reports_assistant",
        entityId: threadId,
        afterData: {
          period: body.period,
          question: body.content.slice(0, 500),
          skillsUsed: result.skillsUsed,
        },
      });

      return jsonOk({
        reply: result.reply,
        skillsUsed: result.skillsUsed,
        threadId,
        title,
        messages,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assistant failed";
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
