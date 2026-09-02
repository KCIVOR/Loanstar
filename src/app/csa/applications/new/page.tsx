"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  PhoneInput,
  Select,
} from "@/components/ui";
import { AutofillOverlay } from "@/components/dev/AutofillOverlay";
import { parseBorrowerNameParts } from "@/lib/csa/leads";

type LoanSegment = "seafarer" | "sme" | "individual";
type EntityType = "individual" | "corporate";
type CollateralType = "none" | "car_refinancing" | "real_estate";
type PaymentSchedule =
  | "mpl"
  | "salary"
  | "monthly"
  | "weekly"
  | "bi_monthly"
  | "quarterly"
  | "two_monthly"
  | "daily";

function CsaNewApplicationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadId = searchParams.get("leadId");
  const leadName = searchParams.get("name") ?? "";

  const prefill = useMemo(
    () => parseBorrowerNameParts(leadName),
    [leadName],
  );

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState(prefill.firstName);
  const [lastName, setLastName] = useState(prefill.lastName);
  const [middleName, setMiddleName] = useState("");
  const [mobilePhone, setMobilePhone] = useState("");
  const [segment, setSegment] = useState<LoanSegment>("seafarer");
  const [entityType, setEntityType] = useState<EntityType>("individual");
  const [collateralType, setCollateralType] = useState<CollateralType>("none");
  /** SME or Individual — the loan's unified schedule/product choice, decided
   * here at intake rather than as a separate choice later at compute time.
   * Both segments have access to the full 8-value list (confirmed
   * 2026-08-29 — see docs/payment-schedule-unification-plan.md). Defaults
   * to Regular monthly. */
  const [paymentSchedule, setPaymentSchedule] = useState<PaymentSchedule>("monthly");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingWarning, setExistingWarning] = useState<string | null>(null);

  const collateralEligible = segment === "sme" || segment === "individual";
  const paymentScheduleEligible = segment === "sme" || segment === "individual";
  /** Auto/Real Estate collateral locks the schedule to Regular (Monthly) —
   * confirmed against the real Excel calculator and the paper application
   * form (2026-08-30): collateral and schedule are never independent
   * choices there, a collateral loan is always monthly cadence. */
  const paymentScheduleLocked = collateralType !== "none";

  function handleSegmentChange(next: LoanSegment) {
    setSegment(next);
    if (next === "seafarer") setCollateralType("none");
    if (next !== "sme" && next !== "individual") setPaymentSchedule("monthly");
  }

  function handleCollateralTypeChange(next: CollateralType) {
    setCollateralType(next);
    if (next !== "none") setPaymentSchedule("monthly");
  }

  async function handleEmailBlur() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setExistingWarning(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/csa/borrowers/existing?email=${encodeURIComponent(trimmed)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        exists: boolean;
        servicing: { applicationNo: string | null; status: string }[];
        origination: { applicationNo: string | null; status: string }[];
      };
      if (!data.exists || (data.servicing.length === 0 && data.origination.length === 0)) {
        setExistingWarning(null);
        return;
      }
      const parts: string[] = [];
      if (data.servicing.length > 0) {
        parts.push(`${data.servicing.length} active loan account(s)`);
      }
      if (data.origination.length > 0) {
        parts.push(`${data.origination.length} application(s) in process`);
      }
      setExistingWarning(
        `This email already has ${parts.join(" and ")}. Creating another file is allowed. ` +
          `The borrower profile is shared — saving the form on the new file overwrites the same name and business info.`,
      );
    } catch {
      // non-blocking; warning is optional
    }
  }

  function fillIntake(
    nextSegment: LoanSegment,
    nextEntityType: EntityType,
    nextPaymentSchedule: PaymentSchedule = "monthly",
  ) {
    const rand = Math.floor(Math.random() * 100000);
    const names = { first: "Juan", last: "Dela Cruz" };
    setSegment(nextSegment);
    setEntityType(nextEntityType);
    setCollateralType("none");
    setPaymentSchedule(nextPaymentSchedule);
    setEmail(`autofill.${rand}@example.local`);
    setFirstName(names.first);
    setLastName(names.last);
    setMiddleName("Santos");
    setMobilePhone(`09${String(100000000 + Math.floor(Math.random() * 899999999))}`);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        email,
        firstName,
        lastName,
        middleName: middleName || undefined,
        mobilePhone: mobilePhone || undefined,
        segment,
        entityType: segment === "sme" ? entityType : undefined,
        collateralType: collateralEligible ? collateralType : undefined,
        paymentSchedule: paymentScheduleEligible ? paymentSchedule : undefined,
      };

      const res = await fetch(
        leadId
          ? `/api/csa/leads/${leadId}/convert`
          : "/api/csa/applications",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as {
        applicationId?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to create application");
      router.push(`/csa/applications/${data.applicationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: "CSA queue", href: "/csa" },
          { label: leadId ? "Convert lead" : "New application" },
        ]}
      />
      <PageHeader
        title={leadId ? "Start application from lead" : "Create application"}
        description={
          leadId
            ? "Convert this agent lead into a loan application. The lead will link to the new file."
            : "Create on behalf of a borrower. Account linking can happen later when the borrower registers."
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <Card>
        <h2 className="mb-4 font-display text-lg font-semibold text-navy-900">
          Borrower details
        </h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="segment" required>
              Loan segment
            </Label>
            <Select
              id="segment"
              value={segment}
              onChange={(e) => handleSegmentChange(e.target.value as LoanSegment)}
            >
              <option value="seafarer">Seafarer</option>
              <option value="sme">SME</option>
              <option value="individual">Individual</option>
            </Select>
          </div>
          {segment === "sme" ? (
            <div>
              <Label htmlFor="entityType" required>
                Entity type
              </Label>
              <Select
                id="entityType"
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as EntityType)}
                required
              >
                <option value="individual">Individual (Sole Proprietorship)</option>
                <option value="corporate">Corporate (Partnership/Corporation)</option>
              </Select>
            </div>
          ) : (
            <div aria-hidden className="hidden sm:block" />
          )}
          {collateralEligible ? (
            <div className="sm:col-span-2">
              <Label htmlFor="collateralType" required>
                Collateral
              </Label>
              <Select
                id="collateralType"
                value={collateralType}
                onChange={(e) =>
                  handleCollateralTypeChange(e.target.value as CollateralType)
                }
                required
              >
                <option value="none">Clean (no collateral)</option>
                <option value="car_refinancing">Car Refinancing</option>
                <option value="real_estate">Real Estate</option>
              </Select>
            </div>
          ) : null}
          {paymentScheduleEligible ? (
            <div className="sm:col-span-2">
              <Label htmlFor="paymentSchedule">
                Loan schedule
                {paymentScheduleLocked ? (
                  <span className="text-ink-400 ml-1 text-xs">
                    (locked to Regular Monthly — Auto/Real Estate loans don't use other schedules)
                  </span>
                ) : null}
              </Label>
              <Select
                id="paymentSchedule"
                value={paymentSchedule}
                disabled={paymentScheduleLocked}
                onChange={(e) => setPaymentSchedule(e.target.value as PaymentSchedule)}
              >
                <option value="monthly">Regular (Monthly)</option>
                {!paymentScheduleLocked ? (
                  <>
                    <option value="mpl">MPL (Multi-Purpose Loan)</option>
                    <option value="salary">Salary (semi-monthly)</option>
                    <option value="weekly">Invoice Financing (Weekly)</option>
                    <option value="bi_monthly">Bi-monthly (every 15 days)</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="two_monthly">Two-monthly</option>
                    <option value="daily">Daily</option>
                  </>
                ) : null}
              </Select>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Label htmlFor="email" required>
              Email
            </Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => void handleEmailBlur()}
            />
          </div>
          <div>
            <Label htmlFor="firstName" required>
              First name
            </Label>
            <Input
              id="firstName"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="lastName" required>
              Last name
            </Label>
            <Input
              id="lastName"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="middleName">Middle name</Label>
            <Input
              id="middleName"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="mobilePhone">Mobile phone</Label>
            <PhoneInput
              id="mobilePhone"
              value={mobilePhone}
              onChange={setMobilePhone}
            />
          </div>
          <div className="sm:col-span-2">
            {existingWarning ? (
              <div className="mb-3">
                <Alert variant="warning">{existingWarning}</Alert>
              </div>
            ) : null}
            <Button type="submit" loading={saving}>
              {leadId ? "Convert lead & create application" : "Create application"}
            </Button>
          </div>
        </form>
      </Card>
      <AutofillOverlay
        actions={[
          { label: "Fill: Seafarer", onClick: () => fillIntake("seafarer", "individual") },
          { label: "Fill: SME (Individual)", onClick: () => fillIntake("sme", "individual") },
          { label: "Fill: SME (Corporate)", onClick: () => fillIntake("sme", "corporate") },
          {
            label: "Fill: Individual (MPL)",
            onClick: () => fillIntake("individual", "individual", "mpl"),
          },
          {
            label: "Fill: Individual (Salary)",
            onClick: () => fillIntake("individual", "individual", "salary"),
          },
          {
            label: "Fill: SME (MPL)",
            onClick: () => fillIntake("sme", "individual", "mpl"),
          },
        ]}
      />
    </div>
  );
}

export default function CsaNewApplicationPage() {
  return (
    <Suspense fallback={null}>
      <CsaNewApplicationForm />
    </Suspense>
  );
}
