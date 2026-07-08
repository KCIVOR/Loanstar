export type InputMode = "NET_SARADO" | "NET_LESS_SECURITY" | "PRINCIPAL";

export type OtherDeductions = {
  otherLoan?: number;
  offset?: number;
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
