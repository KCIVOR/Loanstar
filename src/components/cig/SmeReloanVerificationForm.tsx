"use client";

import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import {
  computeReloanTotalNetIncome,
  sumReloanBusinessExpenses,
  sumReloanHouseholdExpenses,
  type SmeReloanVerification,
} from "@/lib/cig/field-visit";

type Props = {
  value: SmeReloanVerification | null;
  onChange: (next: SmeReloanVerification) => void;
  onSave: (next: SmeReloanVerification) => void;
  saving?: boolean;
  readOnly?: boolean;
};

export function SmeReloanVerificationForm({
  value,
  onChange,
  onSave,
  saving,
  readOnly,
}: Props) {
  const form: SmeReloanVerification = value ?? {};
  const householdTotal = sumReloanHouseholdExpenses(
    form.residence?.householdExpenses,
  );
  const businessTotal = sumReloanBusinessExpenses(
    form.business?.businessExpenses,
  );
  const totalNetIncome = computeReloanTotalNetIncome(
    form.baseOnFs?.netIncomePerMonth,
    householdTotal,
  );

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="font-display text-base font-semibold text-navy-900">
          Re-verification of field investigation
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label required>Date visited</Label>
            <Input
              type="date"
              disabled={readOnly}
              value={form.header?.dateVisited ?? ""}
              onChange={(e) =>
                onChange({
                  ...form,
                  header: { ...form.header, dateVisited: e.target.value },
                })
              }
            />
          </div>
          <div>
            <Label required>Visited by</Label>
            <Input
              disabled={readOnly}
              value={form.header?.visitedBy ?? ""}
              onChange={(e) =>
                onChange({
                  ...form,
                  header: { ...form.header, visitedBy: e.target.value },
                })
              }
            />
          </div>
          <div>
            <Label>Client name</Label>
            <Input
              disabled={readOnly}
              value={form.header?.clientName ?? ""}
              onChange={(e) =>
                onChange({
                  ...form,
                  header: { ...form.header, clientName: e.target.value },
                })
              }
            />
          </div>
          <div>
            <Label>Company name</Label>
            <Input
              disabled={readOnly}
              value={form.header?.companyName ?? ""}
              onChange={(e) =>
                onChange({
                  ...form,
                  header: { ...form.header, companyName: e.target.value },
                })
              }
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-base font-semibold text-navy-900">
          Residence verification
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Type of residence</Label>
            <Input
              disabled={readOnly}
              value={form.residence?.typeOfResidence ?? ""}
              onChange={(e) =>
                onChange({
                  ...form,
                  residence: {
                    ...form.residence,
                    typeOfResidence: e.target.value,
                  },
                })
              }
            />
          </div>
          <div>
            <Label>Monthly rental</Label>
            <Input
              type="number"
              step="0.01"
              disabled={readOnly}
              value={form.residence?.monthlyRental ?? ""}
              onChange={(e) =>
                onChange({
                  ...form,
                  residence: {
                    ...form.residence,
                    monthlyRental: e.target.value
                      ? Number(e.target.value)
                      : null,
                  },
                })
              }
            />
          </div>
        </div>
        {(
          [
            ["electricity", "Electricity"],
            ["water", "Water"],
            ["internet", "Internet"],
            ["subdivisionDues", "Subdivision dues"],
            ["school", "School"],
            ["helpersSalary", "Helpers salary"],
            ["monthlyAmortization", "Monthly amortization"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <Label>{label}</Label>
            <Input
              type="number"
              step="0.01"
              disabled={readOnly}
              value={form.residence?.householdExpenses?.[key] ?? ""}
              onChange={(e) =>
                onChange({
                  ...form,
                  residence: {
                    ...form.residence,
                    householdExpenses: {
                      ...form.residence?.householdExpenses,
                      [key]: e.target.value ? Number(e.target.value) : null,
                    },
                  },
                })
              }
            />
          </div>
        ))}
        <p className="text-sm text-ink-600">
          Total household expenses:{" "}
          <span className="mono font-medium">₱{householdTotal.toFixed(2)}</span>
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-base font-semibold text-navy-900">
          Business verification
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Condition of the business</Label>
            <Select
              disabled={readOnly}
              value={form.business?.condition ?? ""}
              onChange={(e) =>
                onChange({
                  ...form,
                  business: {
                    ...form.business,
                    condition: (e.target.value || null) as
                      | "poor"
                      | "good"
                      | "excellent"
                      | null,
                  },
                })
              }
            >
              <option value="">Select</option>
              <option value="poor">Poor</option>
              <option value="good">Good</option>
              <option value="excellent">Excellent</option>
            </Select>
          </div>
          <div>
            <Label>Permits registration</Label>
            <Select
              disabled={readOnly}
              value={form.business?.permits ?? ""}
              onChange={(e) =>
                onChange({
                  ...form,
                  business: {
                    ...form.business,
                    permits: (e.target.value || null) as
                      | "updated"
                      | "not_updated"
                      | null,
                  },
                })
              }
            >
              <option value="">Select</option>
              <option value="updated">Updated</option>
              <option value="not_updated">Not updated</option>
            </Select>
          </div>
        </div>
        {(
          [
            ["employeeSalary", "Salary of employee"],
            ["water", "Water"],
            ["electricity", "Electricity"],
            ["internet", "Internet"],
            ["rental", "Rental"],
            ["operationalExpenses", "Operational expenses"],
            ["extraLine", "Extra line (not in total)"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <Label>{label}</Label>
            <Input
              type="number"
              step="0.01"
              disabled={readOnly}
              value={form.business?.businessExpenses?.[key] ?? ""}
              onChange={(e) =>
                onChange({
                  ...form,
                  business: {
                    ...form.business,
                    businessExpenses: {
                      ...form.business?.businessExpenses,
                      [key]: e.target.value ? Number(e.target.value) : null,
                    },
                  },
                })
              }
            />
          </div>
        ))}
        <p className="text-sm text-ink-600">
          Total business expenses (excludes extra line):{" "}
          <span className="mono font-medium">₱{businessTotal.toFixed(2)}</span>
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-base font-semibold text-navy-900">
          Base on FS / risk / sign-off
        </h3>
        <div>
          <Label>Net income per month</Label>
          <Input
            type="number"
            step="0.01"
            disabled={readOnly}
            value={form.baseOnFs?.netIncomePerMonth ?? ""}
            onChange={(e) =>
              onChange({
                ...form,
                baseOnFs: {
                  ...form.baseOnFs,
                  netIncomePerMonth: e.target.value
                    ? Number(e.target.value)
                    : null,
                },
              })
            }
          />
        </div>
        <p className="text-sm text-ink-600">
          Total net income (M50 = −M49 − household):{" "}
          <span className="mono font-medium">
            ₱{totalNetIncome.toFixed(2)}
          </span>
        </p>
        <div>
          <Label required>Risk</Label>
          <Select
            disabled={readOnly}
            value={form.risk ?? ""}
            onChange={(e) =>
              onChange({
                ...form,
                risk: (e.target.value || null) as
                  | "low"
                  | "medium"
                  | "high"
                  | null,
              })
            }
          >
            <option value="">Select</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </div>
        <div>
          <Label required>Recommendation</Label>
          <Textarea
            disabled={readOnly}
            rows={4}
            value={form.recommendation ?? ""}
            onChange={(e) =>
              onChange({ ...form, recommendation: e.target.value })
            }
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label required>Verified by (Field Investigator)</Label>
            <Input
              disabled={readOnly}
              value={form.verifiedBy ?? ""}
              onChange={(e) =>
                onChange({ ...form, verifiedBy: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Noted by (Marketing Officer)</Label>
            <Input
              disabled={readOnly}
              value={form.notedBy ?? ""}
              onChange={(e) => onChange({ ...form, notedBy: e.target.value })}
            />
          </div>
        </div>
        <p className="text-xs text-ink-400">
          Sign-off names only — CIG owns this screen (provisional; roles not
          created in this phase).
        </p>
      </section>

      {!readOnly ? (
        <Button
          type="button"
          loading={saving}
          onClick={() => onSave(form)}
        >
          Save re-loan verification
        </Button>
      ) : null}
    </div>
  );
}
