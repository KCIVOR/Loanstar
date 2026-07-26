"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Alert, Breadcrumbs, Button, PageHeader, Spinner } from "@/components/ui";
import { ApplicantProfileFields } from "@/components/borrowers/ApplicantProfileFields";
import type { BorrowerProfile } from "@/lib/borrowers/types";

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
          profileData: profile.profileData,
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
      <Breadcrumbs
        className="mb-3"
        items={[
          { label: "Dashboard", href: "/borrower" },
          { label: "Application profile" },
        ]}
      />
      <PageHeader
        title="Application profile"
        description="SF Application Form details for your loan file. Login settings (name, avatar, notification prefs) are under Account in the header."
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
        <ApplicantProfileFields profile={profile} onChange={setProfile} />
        <Button type="submit" loading={saving}>
          Save profile
        </Button>
      </form>
    </div>
  );
}
