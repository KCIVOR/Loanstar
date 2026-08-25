export type InputMode = "NET_SARADO" | "NET_LESS_SECURITY" | "PRINCIPAL";

export type LoanDeductionEntry = {
  accountNo: string | null;
  amount: number;
};

export type OffsetDeductionEntry = LoanDeductionEntry & {
  months: number | null;
};

export type OtherDeductions = {
  // Legacy singular fields — kept for backward-compat reads of computations
  // stored before multi-loan support. New writes should leave these at
  // their defaults and populate otherLoans/offsets instead.
  otherLoan?: number;
  otherLoanAccountNo?: string | null;
  offset?: number;
  offsetAccountNo?: string | null;
  offsetMonths?: number | null;

  otherLoans?: LoanDeductionEntry[];
  offsets?: OffsetDeductionEntry[];

  advancePayment?: number;
  previousLoanBalance?: number;
  accountOpening?: number;
};

export type SfComputeInput = {
  inputMode: InputMode;
  /** Mode-dependent target amount (net sarado, net less security, or principal). */
  amount: number;
  terms: number;
  addonMonths?: number;
  pfRate: number;
  interestRate: number;
  securityFeeRate: number;
  otherDeductions?: OtherDeductions;
};

export type PfComponents = {
  pfTotal: number;
  processingFee: number;
  docStamp: number;
  notaryFee: number;
  adminCost: number;
  pfBundle: number;
};

export type SfComputeResult = PfComponents & {
  inputMode: InputMode;
  inputAmount: number;
  terms: number;
  addonMonths: number;
  pfRate: number;
  interestRate: number;
  securityFeeRate: number;
  otherDeductions: Required<OtherDeductions>;
  otherDeductionsTotal: number;
  principal: number;
  securityFee: number;
  totalDeductions: number;
  netReleased: number;
  totalInterest: number;
  totalLoan: number;
  monthlyAmortization: number;
};
