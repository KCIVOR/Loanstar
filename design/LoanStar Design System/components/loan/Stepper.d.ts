export interface StepperProps {
  steps: string[];
  currentIndex: number;
  onStepClick?: (index: number) => void;
}

export interface AmortizationRow {
  num: string;
  dueDate: string;
  principal: string;
  interest: string;
  payment: string;
  status: "paid" | "due" | "upcoming";
}

export interface AmortizationTableProps {
  rows: AmortizationRow[];
}
