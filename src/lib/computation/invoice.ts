import { halfUp } from "./money";

export type InvoiceComputeInput = {
  principal: number;
  terms: number; // 1, 2, or 3 months only
  releaseDate: Date;
};

export type InvoiceWeek = {
  weekNo: number;
  dueDate: string;
  interestRate: number;
  amountDue: number;
  month: number;
};

export type InvoiceComputeResult = {
  principal: number;
  terms: number;
  weeklySchedule: InvoiceWeek[];
  totalInterest: number;
  principalDueDate: string;
  principalAmount: number;
  /** 5% of principal — informational only, not part of origination.
   * Penalty applies as a collections event if principal isn't paid after
   * the final weekly interest payment. See transcription timestamp 2:35:34. */
  penaltyAmount: number;
};

/** Weekly interest rates by month: 1% → 2% → 2.5% */
const WEEKLY_RATES = [0.01, 0.02, 0.025] as const;

/**
 * Invoice Financing computation — weekly interest-only payments for 1-3 months.
 * 
 * Business Rules (from transcription.md lines 901-920, timestamp 2:32:43):
 * - NO PF bundle (no processing fee, doc stamp, notary, admin cost)
 * - Pure interest-only product: weekly % of principal
 * - Week 1-4 (Month 1): 1% per week = 4% total
 * - Week 5-8 (Month 2): 2% per week = 8% total
 * - Week 9-12 (Month 3): 2.5% per week = 10% total
 * - Total interest over 3 months: 22% of principal
 * - Principal due one week after final interest payment
 * - 5% penalty if principal not paid (collections event, not origination)
 * 
 * Formula per week: amountDue = halfUp(principal × weeklyRate)
 * 
 * Example (3-month, ₱100,000 principal):
 * - Weeks 1-4: ₱1,000 each (1% × 100k) = ₱4,000
 * - Weeks 5-8: ₱2,000 each (2% × 100k) = ₱8,000
 * - Weeks 9-12: ₱2,500 each (2.5% × 100k) = ₱10,000
 * - Total interest: ₱22,000
 * - Principal due: Week 13 (₱100,000)
 * - Penalty (if late): ₱5,000 (5% × 100k)
 */
export function computeInvoiceLoan(input: InvoiceComputeInput): InvoiceComputeResult {
  if (!Number.isInteger(input.terms) || input.terms < 1 || input.terms > 3) {
    throw new Error("Invoice financing terms must be 1, 2, or 3 months");
  }

  const schedule: InvoiceWeek[] = [];
  let totalInterest = 0;
  let weekNo = 0;

  // Generate weekly interest payments for each month
  for (let month = 1; month <= input.terms; month += 1) {
    const rate = WEEKLY_RATES[month - 1];
    
    // 4 weekly payments per month
    for (let w = 0; w < 4; w += 1) {
      weekNo += 1;
      const dueDate = new Date(input.releaseDate);
      dueDate.setDate(dueDate.getDate() + weekNo * 7);
      
      const amountDue = halfUp(input.principal * rate);
      
      schedule.push({
        weekNo,
        dueDate: formatDateForSchedule(dueDate),
        interestRate: rate,
        amountDue,
        month,
      });
      
      totalInterest = halfUp(totalInterest + amountDue);
    }
  }

  // Principal due one week after final interest payment
  const principalDueDate = new Date(input.releaseDate);
  principalDueDate.setDate(principalDueDate.getDate() + (weekNo + 1) * 7);

  return {
    principal: input.principal,
    terms: input.terms,
    weeklySchedule: schedule,
    totalInterest,
    principalDueDate: formatDateForSchedule(principalDueDate),
    principalAmount: input.principal,
    penaltyAmount: halfUp(input.principal * 0.05),
  };
}

/**
 * Format date as YYYY-MM-DD for schedule storage (matches release-date.ts convention).
 */
function formatDateForSchedule(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
