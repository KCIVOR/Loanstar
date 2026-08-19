import { z } from "zod";

/** Shared schema for admin loan-type enrollment (Phase 4.3). */
export const createLoanTypeSchema = z.object({
  name: z.string().min(1).max(100),
  interestRate: z.number().min(0).max(1),
  pfRate: z.number().min(0).max(1),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deactivatePrevious: z.boolean().default(true),
  segment: z.enum(["seafarer", "sme", "individual"]).default("seafarer"),
});

export type CreateLoanTypeInput = z.infer<typeof createLoanTypeSchema>;
