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
import { parseBorrowerNameParts } from "@/lib/csa/leads";

type LoanSegment = "seafarer" | "sme";
type EntityType = "individual" | "corporate";

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
              onChange={(e) => setSegment(e.target.value as LoanSegment)}
            >
              <option value="seafarer">Seafarer</option>
              <option value="sme">SME</option>
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
                <option value="individual">Individual</option>
                <option value="corporate">Corporate</option>
              </Select>
            </div>
          ) : (
            <div aria-hidden className="hidden sm:block" />
          )}
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
