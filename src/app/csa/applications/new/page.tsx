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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collateralEligible = segment === "sme" || segment === "individual";

  function handleSegmentChange(next: LoanSegment) {
    setSegment(next);
    if (next === "seafarer") setCollateralType("none");
  }

  function fillIntake(nextSegment: LoanSegment, nextEntityType: EntityType) {
    const rand = Math.floor(Math.random() * 100000);
    const names = { first: "Juan", last: "Dela Cruz" };
    setSegment(nextSegment);
    setEntityType(nextEntityType);
    setCollateralType("none");
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
                  setCollateralType(e.target.value as CollateralType)
                }
                required
              >
                <option value="none">Clean (no collateral)</option>
                <option value="car_refinancing">Car Refinancing</option>
                <option value="real_estate">Real Estate</option>
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
          { label: "Fill: Individual", onClick: () => fillIntake("individual", "individual") },
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
