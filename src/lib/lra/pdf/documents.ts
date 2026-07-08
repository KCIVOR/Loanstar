import { createHash } from "crypto";

import type { BlriData } from "../blri-data";
import { createSimplePdf, formatMoney } from "./simple-pdf";

export function blriToPdfLines(data: BlriData): string[] {
  const lines = [
    "BORROWER'S LOAN RELEASE INSTRUCTION (BLRI)",
    `Loan Account No.: ${data.loanAccountNo}`,
    `Borrower: ${data.borrowerName}`,
    "",
    `Principal: ${formatMoney(data.principal)}`,
    `Total Interest: ${formatMoney(data.totalInterest)}`,
    `Total Loan: ${formatMoney(data.totalLoan)}`,
    `Monthly Amortization: ${formatMoney(data.monthlyAmortization)}`,
    `Terms: ${data.terms} months`,
    `First Payment Date: ${data.firstPaymentDate}`,
    "",
    "Particulars:",
  ];

  for (const item of data.particulars) {
    lines.push(
      `  ${item.label} (${item.accountCode}): ${formatMoney(item.amount)}`,
    );
  }

  lines.push("", "PDC Schedule:");
  for (const row of data.pdcSchedule) {
    lines.push(
      `  ${row.checkDate} | ${row.checkNumber ?? "________"} | ${formatMoney(row.amount)} | ${row.bankName}`,
    );
  }

  return lines;
}

export function promissoryNoteLines(data: BlriData): string[] {
  return [
    "PROMISSORY NOTE",
    `Borrower: ${data.borrowerName}`,
    `Loan Account No.: ${data.loanAccountNo}`,
    `Principal Amount: ${formatMoney(data.principal)}`,
    `Total Amount Payable: ${formatMoney(data.totalLoan)}`,
    `Monthly Amortization: ${formatMoney(data.monthlyAmortization)} for ${data.terms} months`,
    "",
    "I promise to pay the above amounts according to the schedule in the BLRI.",
  ];
}

export function disclosureStatementLines(data: BlriData): string[] {
  return [
    "DISCLOSURE STATEMENT",
    `Borrower: ${data.borrowerName}`,
    `Net Loan Proceeds / Principal: ${formatMoney(data.principal)}`,
    `Finance Charges (Interest): ${formatMoney(data.totalInterest)}`,
    `Total of Payments: ${formatMoney(data.totalLoan)}`,
    "",
    "Deductions:",
    ...data.particulars.map(
      (p) => `  ${p.label}: ${formatMoney(p.amount)}`,
    ),
  ];
}

export function voucherLines(
  title: string,
  data: BlriData,
  debitCode: string,
  creditCode: string,
  netAmount: number,
): string[] {
  return [
    title,
    `Payee: ${data.borrowerName}`,
    `Loan Account No.: ${data.loanAccountNo}`,
    "",
    `Debit  ${debitCode} Loans Receivable: ${formatMoney(data.principal)}`,
    ...data.particulars.map(
      (p) => `Credit ${p.accountCode} ${p.label}: ${formatMoney(p.amount)}`,
    ),
    `Credit ${creditCode}: ${formatMoney(netAmount)}`,
  ];
}

export function renderDocumentPdf(
  slug: string,
  blri: BlriData,
  netReleased: number,
): Uint8Array {
  let lines: string[];

  switch (slug) {
    case "blri":
      lines = blriToPdfLines(blri);
      break;
    case "promissory_note":
      lines = promissoryNoteLines(blri);
      break;
    case "disclosure_statement":
      lines = disclosureStatementLines(blri);
      break;
    case "check_voucher":
      lines = voucherLines(
        "CHECK VOUCHER",
        blri,
        "1100001",
        "1100115",
        netReleased,
      );
      break;
    case "cash_voucher":
      lines = voucherLines(
        "CASH VOUCHER",
        blri,
        "1100001",
        "1100110",
        netReleased,
      );
      break;
    case "ar_check_voucher":
      lines = [
        "AR CHECK VOUCHER",
        `Borrower: ${blri.borrowerName}`,
        `Amount: ${formatMoney(netReleased)}`,
        "Account 1100115 — Bank",
      ];
      break;
    case "ar_cash_voucher":
      lines = [
        "AR CASH VOUCHER",
        `Borrower: ${blri.borrowerName}`,
        `Amount: ${formatMoney(netReleased)}`,
        "Account 1100110 — CASH",
      ];
      break;
    default:
      lines = [`Document: ${slug}`, `Borrower: ${blri.borrowerName}`];
  }

  return createSimplePdf(lines);
}

export function hashPdfContent(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}
