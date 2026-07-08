"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Spinner,
} from "@/components/admin/ui";
import type {
  Address,
  AllotteeInfo,
  BorrowerProfile,
  Dependent,
  FinancialInfo,
  ManningAgency,
  PicWorkInfo,
  Reference,
} from "@/lib/borrowers/types";

function AddressFields({
  prefix,
  value,
  onChange,
}: {
  prefix: string;
  value: Address;
  onChange: (v: Address) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(
        [
          ["street", "Street"],
          ["barangay", "Barangay"],
          ["city", "City"],
          ["province", "Province"],
          ["zipCode", "Zip code"],
          ["country", "Country"],
        ] as const
      ).map(([field, label]) => (
        <div key={field}>
          <Label htmlFor={`${prefix}_${field}`}>{label}</Label>
          <Input
            id={`${prefix}_${field}`}
            value={value[field] ?? ""}
            onChange={(e) => onChange({ ...value, [field]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

export default function BorrowerProfilePage() {
  const [profile, setProfile] = useState<BorrowerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/borrower/profile");
      if (!res.ok) throw new Error("Failed to load profile");
      const data = (await res.json()) as { profile: BorrowerProfile };
      setProfile(data.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/borrower/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: profile.firstName,
          middleName: profile.middleName,
          lastName: profile.lastName,
          suffix: profile.suffix,
          dateOfBirth: profile.dateOfBirth,
          placeOfBirth: profile.placeOfBirth,
          citizenship: profile.citizenship,
          civilStatus: profile.civilStatus,
          gender: profile.gender,
          mobilePhone: profile.mobilePhone,
          landline: profile.landline,
          presentAddress: profile.presentAddress,
          permanentAddress: profile.permanentAddress,
          manningAgency: profile.manningAgency,
          financial: profile.financial,
          allottee: profile.allottee,
          picWork: profile.picWork,
          dependents: profile.dependents,
          references: profile.references,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to save profile");
      }
      setMessage("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !profile) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Profile"
        description="Complete your SF Application Form details"
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {message ? (
        <div className="mb-4">
          <Alert variant="success">{message}</Alert>
        </div>
      ) : null}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        <Card>
          <h2 className="mb-4 font-medium text-neutral-900">Personal information</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["firstName", "First name", true],
                ["middleName", "Middle name", false],
                ["lastName", "Last name", true],
                ["suffix", "Suffix", false],
              ] as const
            ).map(([field, label, required]) => (
              <div key={field}>
                <Label htmlFor={field}>{label}</Label>
                <Input
                  id={field}
                  required={required}
                  value={profile[field] ?? ""}
                  onChange={(e) =>
                    setProfile({ ...profile, [field]: e.target.value })
                  }
                />
              </div>
            ))}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={profile.email} disabled />
            </div>
            {(
              [
                ["dateOfBirth", "date", "Date of birth"],
                ["placeOfBirth", "text", "Place of birth"],
                ["citizenship", "text", "Citizenship"],
                ["civilStatus", "text", "Civil status"],
                ["gender", "text", "Gender"],
                ["mobilePhone", "tel", "Mobile phone"],
                ["landline", "tel", "Landline"],
              ] as const
            ).map(([field, type, label]) => (
              <div key={field}>
                <Label htmlFor={field}>{label}</Label>
                <Input
                  id={field}
                  type={type}
                  value={profile[field] ?? ""}
                  onChange={(e) =>
                    setProfile({ ...profile, [field]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-medium text-neutral-900">Present address</h2>
          <AddressFields
            prefix="present"
            value={profile.presentAddress}
            onChange={(v) => setProfile({ ...profile, presentAddress: v })}
          />
        </Card>

        <Card>
          <h2 className="mb-4 font-medium text-neutral-900">Permanent address</h2>
          <AddressFields
            prefix="permanent"
            value={profile.permanentAddress}
            onChange={(v) => setProfile({ ...profile, permanentAddress: v })}
          />
        </Card>

        <Card>
          <h2 className="mb-4 font-medium text-neutral-900">Manning agency</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["name", "Agency name"],
                ["contactPerson", "Contact person"],
                ["phone", "Phone"],
                ["email", "Email"],
                ["address", "Address"],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <Label htmlFor={`ma_${field}`}>{label}</Label>
                <Input
                  id={`ma_${field}`}
                  value={profile.manningAgency[field] ?? ""}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      manningAgency: {
                        ...profile.manningAgency,
                        [field]: e.target.value,
                      } as ManningAgency,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-medium text-neutral-900">Financial</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["monthlyIncome", "Monthly income"],
                ["otherIncome", "Other income"],
                ["bankName", "Bank name"],
                ["accountNumber", "Account number"],
                ["accountType", "Account type"],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <Label htmlFor={`fin_${field}`}>{label}</Label>
                <Input
                  id={`fin_${field}`}
                  value={String(profile.financial[field] ?? "")}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      financial: {
                        ...profile.financial,
                        [field]:
                          field.includes("Income")
                            ? Number(e.target.value) || undefined
                            : e.target.value,
                      } as FinancialInfo,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-medium text-neutral-900">Allottee</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["name", "Name"],
                ["relationship", "Relationship"],
                ["phone", "Phone"],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <Label htmlFor={`all_${field}`}>{label}</Label>
                <Input
                  id={`all_${field}`}
                  value={profile.allottee[field] ?? ""}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      allottee: {
                        ...profile.allottee,
                        [field]: e.target.value,
                      } as AllotteeInfo,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-medium text-neutral-900">PIC work info</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["rank", "Rank"],
                ["vessel", "Vessel"],
                ["contractDuration", "Contract duration"],
                ["embarkationDate", "Embarkation date"],
                ["disembarkationDate", "Disembarkation date"],
              ] as const
            ).map(([field, label]) => (
              <div key={field}>
                <Label htmlFor={`pic_${field}`}>{label}</Label>
                <Input
                  id={`pic_${field}`}
                  value={profile.picWork[field] ?? ""}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      picWork: {
                        ...profile.picWork,
                        [field]: e.target.value,
                      } as PicWorkInfo,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium text-neutral-900">Dependents</h2>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setProfile({
                  ...profile,
                  dependents: [
                    ...profile.dependents,
                    { name: "", relationship: "", dateOfBirth: "" },
                  ],
                })
              }
            >
              Add dependent
            </Button>
          </div>
          {profile.dependents.map((dep, i) => (
            <div
              key={i}
              className="mb-3 grid gap-3 border-b border-neutral-100 pb-3 sm:grid-cols-3"
            >
              {(["name", "relationship", "dateOfBirth"] as const).map(
                (field) => (
                  <Input
                    key={field}
                    placeholder={field === "dateOfBirth" ? "Date of birth" : field}
                    value={dep[field] ?? ""}
                    onChange={(e) => {
                      const deps = [...profile.dependents];
                      deps[i] = { ...dep, [field]: e.target.value };
                      setProfile({ ...profile, dependents: deps as Dependent[] });
                    }}
                  />
                ),
              )}
            </div>
          ))}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium text-neutral-900">References</h2>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setProfile({
                  ...profile,
                  references: [
                    ...profile.references,
                    { name: "", relationship: "", phone: "", address: "" },
                  ],
                })
              }
            >
              Add reference
            </Button>
          </div>
          {profile.references.map((ref, i) => (
            <div
              key={i}
              className="mb-3 grid gap-3 border-b border-neutral-100 pb-3 sm:grid-cols-2"
            >
              {(["name", "relationship", "phone", "address"] as const).map(
                (field) => (
                  <Input
                    key={field}
                    placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                    value={ref[field] ?? ""}
                    onChange={(e) => {
                      const refs = [...profile.references];
                      refs[i] = { ...ref, [field]: e.target.value };
                      setProfile({ ...profile, references: refs as Reference[] });
                    }}
                  />
                ),
              )}
            </div>
          ))}
        </Card>

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </div>
  );
}
