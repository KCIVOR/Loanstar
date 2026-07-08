import { computeFirstPaymentDate } from "@/lib/computation/release-date";
import { halfUp } from "@/lib/computation/money";

function formatDateLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export type AmortizationInstallment = {
  installmentNo: number;
  dueDate: string;
  amountDue: number;
};

export function generateAmortizationSchedule(input: {
  terms: number;
  monthlyAmortization: number;
  releaseDate: string | Date;
  addonMonths: number;
  dueDay?: number;
}): AmortizationInstallment[] {
  const releaseDate =
    input.releaseDate instanceof Date
      ? input.releaseDate
      : new Date(input.releaseDate);

  const firstPayment = computeFirstPaymentDate(
    releaseDate,
    input.addonMonths,
    input.dueDay ?? 10,
  );

  const installments: AmortizationInstallment[] = [];

  for (let i = 0; i < input.terms; i += 1) {
    const due = new Date(firstPayment);
    due.setMonth(due.getMonth() + i);
    installments.push({
      installmentNo: i + 1,
      dueDate: formatDateLocal(due),
      amountDue: halfUp(input.monthlyAmortization),
    });
  }

  return installments;
}

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "91+";

export function computeAgingBucket(daysPastDue: number): AgingBucket {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "91+";
}

export function daysPastDue(dueDate: string, asOf = new Date()): number {
  const due = new Date(dueDate);
  const diffMs = asOf.getTime() - due.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function calculatePenaltyAmount(
  outstanding: number,
  penaltyRate: number,
): number {
  return halfUp(outstanding * penaltyRate);
}
