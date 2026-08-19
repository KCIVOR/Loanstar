"use client";

import { useState } from "react";

import { ApplicantProfileFields } from "@/components/borrowers/ApplicantProfileFields";
import { Alert, Button, Modal } from "@/components/ui";
import type { BorrowerProfile } from "@/lib/borrowers/types";

/** Fields the CIG PATCH route accepts — mirrors CSA's borrower save payload. */
function borrowerPatchPayload(profile: BorrowerProfile) {
  return {
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
    businessInfo: profile.businessInfo,
    dependents: profile.dependents,
    references: profile.references,
    profileData: profile.profileData,
  };
}

/**
 * Edit Application Form — full borrower personal-info / references editor for
 * CIG. Structural pattern mirrors CiReferencesFormModal (local draft from
 * props, save closes on success, cancel discards). Field UI is the shared
 * ApplicantProfileFields used by CSA and the borrower portal.
 */
export function EditApplicationFormModal({
  open,
  onClose,
  borrower,
  applicationId,
  onSaved,
  segment = "seafarer",
  entityType = null,
}: {
  open: boolean;
  onClose: () => void;
  borrower: BorrowerProfile;
  applicationId: string;
  onSaved: () => Promise<void> | void;
  segment?: "seafarer" | "sme" | "individual";
  entityType?: "individual" | "corporate" | null;
}) {
  // Parent mounts this only while `open` is true, so each open is a fresh
  // mount — draft initializes from the current borrower record.
  const [draft, setDraft] = useState<BorrowerProfile>(() => ({ ...borrower }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/cig/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrower: borrowerPatchPayload(draft),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Application Form"
      className="!max-w-4xl"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            loading={saving}
            onClick={() => void handleSave()}
          >
            Save changes
          </Button>
        </div>
      }
    >
      <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
        <Alert variant="info">
          Correct personal info and character references from the submitted
          application form. Changes are audited and do not affect loan
          computation or uploaded documents.
        </Alert>
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <ApplicantProfileFields
          profile={draft}
          onChange={setDraft}
          segment={segment}
          entityType={entityType}
        />
      </div>
    </Modal>
  );
}
