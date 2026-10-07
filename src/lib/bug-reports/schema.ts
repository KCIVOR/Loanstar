import { z } from "zod";

export const bugReportSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(5000),
  expected_behavior: z.string().trim().min(3).max(5000),
  location: z.string().trim().min(2).max(200),
  error_message: z.string().trim().max(3000).optional(),
  severity: z.enum(["low", "medium", "high"]),
});

export const bugStatusSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
  resolution_note: z.string().trim().max(3000).optional(),
});
