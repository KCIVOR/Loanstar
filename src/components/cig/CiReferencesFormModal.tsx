"use client";

import { useState } from "react";

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  Modal,
  PhoneInput,
  Radio,
  Textarea,
} from "@/components/ui";
import type { AllotteeInfo, BorrowerProfile, Reference } from "@/lib/borrowers/types";
import {
  assessCiReferencesRequired,
  type PicAddress,
  type PicDemeanorTag,
  type PicPaymentPreference,
  type PicSibling,
  type PicVerification,
  type ReferenceVerification,
  type VerificationChecklist,
} from "@/lib/cig/verification";

/**
 * CI & References Form — recreates CI AND REFERENCES FORM 1.xlsx, Sheet1,
 * field-for-field and in source order (see loanstar/docs/cig-references-form-plan.md).
 * Script questions (the literal sentences read to the PIC/reference on the
 * call) are rendered verbatim via `ScriptLine`, not paraphrased into labels.
 */

export type CiFormDraft = {
  pic: PicVerification;
  references: ReferenceVerification[];
  checklist: VerificationChecklist;
  paymentPreference: PicPaymentPreference;
  demeanor: PicDemeanorTag[];
  rating: number | null;
  ratingReason: string | null;
  verifiedBy: string | null;
  verifiedDate: string | null;
};

const EMPTY_CHECKLIST: VerificationChecklist = {
  validateBorrowerInfo: false,
  validatePicInfo: false,
  presidePicObligationSpill: false,
  verifiedCharacterReferences: false,
};

const EMPTY_PAYMENT_PREFERENCE: PicPaymentPreference = { method: null };

function normalizeOwnership(raw?: string): "owned" | "rented" | null {
  const v = raw?.trim().toLowerCase();
  if (v === "owned") return "owned";
  if (v === "rented") return "rented";
  return null;
}

function addressFromDeclared(address: AllotteeInfo["address"]): PicAddress | null {
  if (!address) return null;
  return {
    street: address.street,
    barangay: address.barangay,
    city: address.city,
    province: address.province,
    zipCode: address.zipCode,
    ownership: normalizeOwnership(address.ownership),
    yearsOfStay: address.lengthOfStay,
  };
}

function picFromDeclared(allottee: AllotteeInfo | undefined): PicVerification {
  return {
    name: allottee?.name ?? null,
    birthday: null,
    presentAddress: addressFromDeclared(allottee?.address),
    provincialAddress: null,
    contactNumber: allottee?.phone ?? null,
    relationToClient: allottee?.relationship ?? null,
    otherNumber: null,
    sinceWhen: null,
    socialContact: allottee?.facebook ?? null,
    email: allottee?.email ?? null,
    companyName: allottee?.companyName ?? null,
    companyYearsOfStay: allottee?.yearsStayed ?? null,
    companyPhone: allottee?.companyPhone ?? null,
    siblings: [],
    willAvailLoanAware: null,
    otherFinancing: null,
    housingLoan: null,
    carLoan: null,
    otherVerificationCalls: null,
  };
}

function referenceFromDeclared(ref: Reference | undefined): ReferenceVerification {
  return {
    name: ref?.name ?? null,
    age: null,
    work: ref?.occupation ?? null,
    relationToClient: ref?.relationship ?? null,
    howLongKnowClient: null,
    contactNumber: ref?.phone ?? null,
    otherContactNumber: null,
    facebookAccount: null,
    firstTimeAsReference: null,
    otherVerificationCalls: null,
    remarks: null,
  };
}

function buildInitialDraft(
  borrower: BorrowerProfile | null,
  saved: {
    picVerification: PicVerification | null;
    referenceVerifications: ReferenceVerification[] | null;
    verificationChecklist: VerificationChecklist | null;
    picPaymentPreference: PicPaymentPreference | null;
    picDemeanor: PicDemeanorTag[] | null;
    picRating: number | null;
    picRatingReason: string | null;
    cifVerifiedBy: string | null;
    cifVerifiedDate: string | null;
  },
): CiFormDraft {
  const pic = saved.picVerification ?? picFromDeclared(borrower?.allottee);
  // References are a free add/remove list (like Siblings), not a fixed Ref
  // 1/Ref 2 pair. `saved` (once anything has been saved) is respected
  // exactly, including an empty array if CIG removed everything. Only on the
  // very first open — nothing saved yet — do we seed from declared intake
  // data, padded to at least 2 rows since Sheet1 expects two references.
  const declaredRefs = borrower?.references ?? [];
  const references: ReferenceVerification[] =
    saved.referenceVerifications ??
    Array.from({ length: Math.max(2, declaredRefs.length) }, (_, i) =>
      referenceFromDeclared(declaredRefs[i]),
    );
  return {
    pic,
    references,
    checklist: saved.verificationChecklist ?? EMPTY_CHECKLIST,
    paymentPreference: saved.picPaymentPreference ?? EMPTY_PAYMENT_PREFERENCE,
    demeanor: saved.picDemeanor ?? [],
    rating: saved.picRating ?? null,
    ratingReason: saved.picRatingReason ?? null,
    verifiedBy: saved.cifVerifiedBy ?? null,
    verifiedDate: saved.cifVerifiedDate ?? null,
  };
}

function ScriptLine({ children }: { children: React.ReactNode }) {
  return (
    <Alert variant="info" className="mb-3 italic">
      &ldquo;{children}&rdquo;
    </Alert>
  );
}

function Field({
  label,
  value,
  onChange,
  optTag,
  type = "text",
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  optTag?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label required={required}>
        {label}
        {optTag ? <span className="ml-1 font-normal text-ink-400">{optTag}</span> : null}
      </Label>
      <Input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Same shape as Field, but for a single person's own mobile number —
 * country picker matches the register/account/CSA mobile fields. */
function PhoneField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <PhoneInput value={value} onChange={onChange} />
    </div>
  );
}

function YesNo({
  name,
  value,
  onChange,
  labels = ["Yes", "No"],
}: {
  name: string;
  value: boolean | null | undefined;
  onChange: (v: boolean) => void;
  labels?: [string, string];
}) {
  return (
    <div className="flex gap-4">
      <Radio
        name={name}
        value="yes"
        checked={value === true}
        onChange={() => onChange(true)}
        label={labels[0]}
      />
      <Radio
        name={name}
        value="no"
        checked={value === false}
        onChange={() => onChange(false)}
        label={labels[1]}
      />
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {/* Plain "PHP" text, not the ₱ glyph — some fonts render U+20B1 as a
          fallback/tofu glyph instead of the peso sign, which reads as broken. */}
      <div className="affix">
        <span className="add">PHP</span>
        <Input
          type="number"
          step="0.01"
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
          mono
        />
      </div>
    </div>
  );
}

function AddressFields({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: PicAddress | null | undefined;
  onChange: (addr: PicAddress) => void;
}) {
  const addr: PicAddress = value ?? {};
  const set = (patch: Partial<PicAddress>) => onChange({ ...addr, ...patch });
  const radioName = `${legend.replace(/\s+/g, "-").toLowerCase()}-ownership`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={`${legend} — Street/Barangay`} value={addr.street ?? ""} onChange={(v) => set({ street: v })} />
      <Field label="Barangay" value={addr.barangay ?? ""} onChange={(v) => set({ barangay: v })} />
      <Field label="City" value={addr.city ?? ""} onChange={(v) => set({ city: v })} />
      <Field label="Province" value={addr.province ?? ""} onChange={(v) => set({ province: v })} />
      <Field label="Zip Code" value={addr.zipCode ?? ""} onChange={(v) => set({ zipCode: v })} />
      <div>
        <Label>Years of Stay</Label>
        <Input value={addr.yearsOfStay ?? ""} onChange={(e) => set({ yearsOfStay: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <Label>Ownership</Label>
        <div className="flex gap-4">
          <Radio name={radioName} value="owned" checked={addr.ownership === "owned"} onChange={() => set({ ownership: "owned" })} label="Owned" />
          <Radio name={radioName} value="rented" checked={addr.ownership === "rented"} onChange={() => set({ ownership: "rented" })} label="Rented" />
        </div>
      </div>
    </div>
  );
}

const PAYMENT_METHODS: Array<{ value: NonNullable<PicPaymentPreference["method"]>; label: string }> = [
  { value: "BDO", label: "BDO" },
  { value: "PBB", label: "PBB" },
  { value: "EASTWEST", label: "EASTWEST" },
  { value: "UCPB", label: "UCPB" },
  { value: "PERSONAL_CHECK", label: "PERSONAL CHECK" },
  { value: "BANK", label: "BANK" },
  { value: "OTHERS", label: "OTHERS" },
];

const DEMEANOR_TAGS: Array<{ value: PicDemeanorTag; label: string }> = [
  { value: "cooperative", label: "Cooperative" },
  { value: "arrogant", label: "Arrogant" },
  { value: "hard_to_understand", label: "Hard to Understand" },
  { value: "inconsistent", label: "Inconsistent" },
];

function ReferenceBlock({
  index,
  value,
  onChange,
  onRemove,
}: {
  index: number;
  value: ReferenceVerification;
  onChange: (v: ReferenceVerification) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<ReferenceVerification>) => onChange({ ...value, ...patch });
  return (
    <Card className="mb-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-navy-900">
          Reference {index + 1}
        </h3>
        <Button
          type="button"
          variant="danger-soft"
          size="sm"
          aria-label={`Remove reference ${index + 1}`}
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field required label="Name :" value={value.name ?? ""} onChange={(v) => set({ name: v })} />
        <Field label="Age :" value={value.age ?? ""} onChange={(v) => set({ age: v })} />
        <Field label="Work :" value={value.work ?? ""} onChange={(v) => set({ work: v })} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field required label="Relation to the Client" value={value.relationToClient ?? ""} onChange={(v) => set({ relationToClient: v })} />
        <Field label="How long do you know the client :" value={value.howLongKnowClient ?? ""} onChange={(v) => set({ howLongKnowClient: v })} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <PhoneField required label="Contact Number :" value={value.contactNumber ?? ""} onChange={(v) => set({ contactNumber: v })} />
        <Field label="Other Contact Number :" value={value.otherContactNumber ?? ""} onChange={(v) => set({ otherContactNumber: v })} />
      </div>
      <div className="mt-3">
        <Field label="Facebook Account :" optTag="(Optional)" value={value.facebookAccount ?? ""} onChange={(v) => set({ facebookAccount: v })} />
      </div>

      <h4 className="mb-2 mt-4 font-display text-sm font-semibold uppercase tracking-wide text-navy-800">
        Spill of Information :
      </h4>
      <ScriptLine>* Is this the first time that the Borrower used you as a Character Reference?</ScriptLine>
      <YesNo
        name={`ref${index}-first-time`}
        value={value.firstTimeAsReference}
        onChange={(v) => set({ firstTimeAsReference: v })}
      />

      <div className="mt-4">
        <ScriptLine>* Aside from us, is there any person called you for verification?</ScriptLine>
        <div className="grid items-end gap-3 sm:grid-cols-2">
          <div>
            <Label>YES — What was the name of the Company / Financing?</Label>
            <Input
              value={value.otherVerificationCalls?.company ?? ""}
              onChange={(e) =>
                set({
                  otherVerificationCalls: {
                    ...value.otherVerificationCalls,
                    status: "yes",
                    company: e.target.value,
                  },
                })
              }
            />
          </div>
          <div>
            <Label>NO — have you recalled that somebody called up for verification for the last 3 months?</Label>
            <div className="flex gap-4 pt-2">
              <Radio
                name={`ref${index}-recall`}
                value="yes"
                checked={value.otherVerificationCalls?.recalledLast3Months === true}
                onChange={() =>
                  set({
                    otherVerificationCalls: {
                      ...value.otherVerificationCalls,
                      status: "no",
                      recalledLast3Months: true,
                    },
                  })
                }
                label="Yes"
              />
              <Radio
                name={`ref${index}-recall`}
                value="no"
                checked={value.otherVerificationCalls?.recalledLast3Months === false}
                onChange={() =>
                  set({
                    otherVerificationCalls: {
                      ...value.otherVerificationCalls,
                      status: "no",
                      recalledLast3Months: false,
                    },
                  })
                }
                label="No"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Label>Remarks</Label>
        <Textarea value={value.remarks ?? ""} onChange={(e) => set({ remarks: e.target.value })} />
      </div>

      <div className="mt-4">
        <Label>Closing Spill :</Label>
        <p className="text-sm italic text-ink-500">
          &ldquo;Sir/Maam as reference we will call you if the borrowers relative is not
          available / we will ask your help if needed&rdquo;
        </p>
      </div>
    </Card>
  );
}

export function CiReferencesFormModal({
  open,
  onClose,
  borrower,
  saved,
  onSave,
  saving,
  readOnly = false,
  verifierName,
}: {
  open: boolean;
  onClose: () => void;
  borrower: BorrowerProfile | null;
  saved: {
    picVerification: PicVerification | null;
    referenceVerifications: ReferenceVerification[] | null;
    verificationChecklist: VerificationChecklist | null;
    picPaymentPreference: PicPaymentPreference | null;
    picDemeanor: PicDemeanorTag[] | null;
    picRating: number | null;
    picRatingReason: string | null;
    cifVerifiedBy: string | null;
    cifVerifiedDate: string | null;
  };
  onSave: (draft: CiFormDraft) => Promise<void>;
  saving: boolean;
  /** View-only after CI report is submitted. */
  readOnly?: boolean;
  /** Logged-in staff display name — shown/persisted as "Verified by" while editing. */
  verifierName: string;
}) {
  // Lazy-initialized from whatever was last saved (or, first time, prefilled
  // from CSA's declared intake data). The parent only mounts this component
  // while `open` is true (see the CIG page), so each open is a fresh mount —
  // no effect needed to "re-sync" the draft on reopen.
  const [draft, setDraft] = useState<CiFormDraft>(() => buildInitialDraft(borrower, saved));
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);

  const pic = draft.pic;
  const setPic = (patch: Partial<PicVerification>) =>
    setDraft((d) => ({ ...d, pic: { ...d.pic, ...patch } }));

  const setReference = (index: number, value: ReferenceVerification) =>
    setDraft((d) => {
      const references = [...d.references];
      references[index] = value;
      return { ...d, references };
    });
  const addReference = () =>
    setDraft((d) => ({ ...d, references: [...d.references, {} as ReferenceVerification] }));
  const removeReference = (index: number) =>
    setDraft((d) => ({
      ...d,
      references: d.references.filter((_, idx) => idx !== index),
    }));

  const addSibling = () =>
    setPic({ siblings: [...(pic.siblings ?? []), {} as PicSibling] });
  const updateSibling = (i: number, patch: Partial<PicSibling>) =>
    setPic({
      siblings: (pic.siblings ?? []).map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    });
  const removeSibling = (i: number) =>
    setPic({ siblings: (pic.siblings ?? []).filter((_, idx) => idx !== i) });

  const toggleChecklist = (key: keyof VerificationChecklist) =>
    setDraft((d) => ({ ...d, checklist: { ...d.checklist, [key]: !d.checklist[key] } }));

  const toggleDemeanor = (tag: PicDemeanorTag) =>
    setDraft((d) => ({
      ...d,
      demeanor: d.demeanor.includes(tag)
        ? d.demeanor.filter((t) => t !== tag)
        : [...d.demeanor, tag],
    }));

  async function handleSaveDraft() {
    setSubmitErrors([]);
    await onSave({ ...draft, verifiedBy: verifierName });
  }

  async function handleSubmitForm() {
    const assessed = assessCiReferencesRequired({
      pic: draft.pic,
      references: draft.references,
      checklist: draft.checklist,
      picRating: draft.rating,
    });
    if (!assessed.complete) {
      setSubmitErrors(assessed.missing);
      return;
    }
    setSubmitErrors([]);
    await onSave({ ...draft, verifiedBy: verifierName });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="CI & References Form"
      className="!max-w-4xl"
      footer={
        readOnly ? (
          <p className="text-xs text-ink-400">View only — edits are locked.</p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-400">
              <b>Save as draft</b> anytime. <b>Submit form</b> checks required
              fields and unlocks Crewing manager — it does not send the CI report
              to Committee.
            </p>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                loading={saving}
                onClick={() => void handleSaveDraft()}
              >
                Save as draft
              </Button>
              <Button
                type="button"
                loading={saving}
                onClick={() => void handleSubmitForm()}
              >
                Submit form
              </Button>
            </div>
          </div>
        )
      }
    >
      <fieldset
        disabled={readOnly}
        className="m-0 min-w-0 max-h-[65vh] space-y-6 overflow-y-auto border-0 p-0 pr-1"
      >
        <Alert variant="info">
          {readOnly
            ? "Submitted CI & References Form — view only."
            : "Fields with a red asterisk are required to submit this form and unlock Crewing. Other fields are optional or conditional on the call. Fields prefilled from intake stay editable."}
        </Alert>

        {submitErrors.length > 0 ? (
          <Alert variant="danger">
            <b>Cannot submit yet — fix these required items:</b>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {submitErrors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Alert>
        ) : null}

        <section>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            I. Allottee / Person-in-Charge Information
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field required label="Name :" value={pic.name ?? ""} onChange={(v) => setPic({ name: v })} />
            <Field label="Birthday :" type="date" value={pic.birthday ?? ""} onChange={(v) => setPic({ birthday: v })} />
          </div>

          <div className="mt-4">
            <AddressFields legend="Present Address" value={pic.presentAddress} onChange={(addr) => setPic({ presentAddress: addr })} />
          </div>
          <div className="mt-4">
            <AddressFields legend="Provincial Address" value={pic.provincialAddress} onChange={(addr) => setPic({ provincialAddress: addr })} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <PhoneField required label="Contact Number" value={pic.contactNumber ?? ""} onChange={(v) => setPic({ contactNumber: v })} />
            <Field required label="Relation to the Client" value={pic.relationToClient ?? ""} onChange={(v) => setPic({ relationToClient: v })} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Other Number" value={pic.otherNumber ?? ""} onChange={(v) => setPic({ otherNumber: v })} />
            <Field label="Since When" value={pic.sinceWhen ?? ""} onChange={(v) => setPic({ sinceWhen: v })} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Facebook/Skype/Viber" value={pic.socialContact ?? ""} onChange={(v) => setPic({ socialContact: v })} />
            <Field label="Email Address" value={pic.email ?? ""} onChange={(v) => setPic({ email: v })} />
          </div>

          <h4 className="mb-2 mt-4 font-display text-sm font-semibold uppercase tracking-wide text-navy-800">
            Work Information
          </h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name of Company" value={pic.companyName ?? ""} onChange={(v) => setPic({ companyName: v })} />
            <Field label="Years of Stay" value={pic.companyYearsOfStay ?? ""} onChange={(v) => setPic({ companyYearsOfStay: v })} />
            <Field label="Company Phone Number" value={pic.companyPhone ?? ""} onChange={(v) => setPic({ companyPhone: v })} />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-navy-800">
              Siblings
            </h4>
            <Button type="button" variant="secondary" size="sm" onClick={addSibling}>
              Add sibling
            </Button>
          </div>
          <div className="mt-3 space-y-3">
            {(pic.siblings ?? []).map((s, i) => (
              <div key={i} className="grid gap-3 border-b border-line-soft pb-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <Input placeholder="Name" value={s.name ?? ""} onChange={(e) => updateSibling(i, { name: e.target.value })} />
                <Input placeholder="Age" value={s.age ?? ""} onChange={(e) => updateSibling(i, { age: e.target.value })} />
                <Input placeholder="Occupation" value={s.occupation ?? ""} onChange={(e) => updateSibling(i, { occupation: e.target.value })} />
                <Button
                  type="button"
                  variant="danger-soft"
                  size="sm"
                  className="self-center"
                  aria-label={`Remove sibling ${i + 1}`}
                  onClick={() => removeSibling(i)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>

          <h4 className="mb-2 mt-5 font-display text-sm font-semibold uppercase tracking-wide text-navy-800">
            Other Informations
          </h4>
          <ScriptLine>Are you inform that he will avail the loan ?</ScriptLine>
          <YesNo name="pic-avail-loan" value={pic.willAvailLoanAware} onChange={(v) => setPic({ willAvailLoanAware: v })} />

          <div className="mt-4">
            <ScriptLine>
              Aside from LOAN STAR is there any other FINANCING / BANK that he applied for? For the last 4years?
            </ScriptLine>
            <YesNo
              name="pic-other-financing"
              value={pic.otherFinancing?.hasOther}
              onChange={(v) =>
                setPic({ otherFinancing: { ...pic.otherFinancing, hasOther: v } })
              }
            />
            {/* The company/financing-name label is long and wraps to two lines at
                this width — kept on its own full-width row so it never fights
                shorter neighbors for vertical alignment (When?/Start-End and
                the money fields each get their own evenly-split row below). */}
            <div className="mt-3">
              <Field
                label="What company ? Was it FINANCING / BANK ?"
                value={pic.otherFinancing?.company ?? ""}
                onChange={(v) => setPic({ otherFinancing: { ...pic.otherFinancing, hasOther: pic.otherFinancing?.hasOther ?? null, company: v } })}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field
                label="When?"
                value={pic.otherFinancing?.when ?? ""}
                onChange={(v) => setPic({ otherFinancing: { ...pic.otherFinancing, hasOther: pic.otherFinancing?.hasOther ?? null, when: v } })}
              />
              <Field
                label="Start / End :"
                value={pic.otherFinancing?.startEnd ?? ""}
                onChange={(v) => setPic({ otherFinancing: { ...pic.otherFinancing, hasOther: pic.otherFinancing?.hasOther ?? null, startEnd: v } })}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <MoneyField
                label="Loan Amount :"
                value={pic.otherFinancing?.loanAmount}
                onChange={(v) => setPic({ otherFinancing: { ...pic.otherFinancing, hasOther: pic.otherFinancing?.hasOther ?? null, loanAmount: v } })}
              />
              <MoneyField
                label="Monthly:"
                value={pic.otherFinancing?.monthly}
                onChange={(v) => setPic({ otherFinancing: { ...pic.otherFinancing, hasOther: pic.otherFinancing?.hasOther ?? null, monthly: v } })}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Housing Loan?</Label>
              <YesNo name="pic-housing-loan" value={pic.housingLoan?.has} onChange={(v) => setPic({ housingLoan: { ...pic.housingLoan, has: v } })} />
              <div className="mt-3 grid gap-3">
                <MoneyField label="Loan Amount :" value={pic.housingLoan?.loanAmount} onChange={(v) => setPic({ housingLoan: { ...pic.housingLoan, has: pic.housingLoan?.has ?? null, loanAmount: v } })} />
                <MoneyField label="Monthly Amort:" value={pic.housingLoan?.monthlyAmort} onChange={(v) => setPic({ housingLoan: { ...pic.housingLoan, has: pic.housingLoan?.has ?? null, monthlyAmort: v } })} />
              </div>
            </div>
            <div>
              <Label>Car Loan?</Label>
              <YesNo name="pic-car-loan" value={pic.carLoan?.has} onChange={(v) => setPic({ carLoan: { ...pic.carLoan, has: v } })} />
              <div className="mt-3 grid gap-3">
                <MoneyField label="Loan Amount :" value={pic.carLoan?.loanAmount} onChange={(v) => setPic({ carLoan: { ...pic.carLoan, has: pic.carLoan?.has ?? null, loanAmount: v } })} />
                <MoneyField label="Monthly Amort:" value={pic.carLoan?.monthlyAmort} onChange={(v) => setPic({ carLoan: { ...pic.carLoan, has: pic.carLoan?.has ?? null, monthlyAmort: v } })} />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <ScriptLine>Aside from us is there any person called for verification ?</ScriptLine>
            <div className="grid items-end gap-3 sm:grid-cols-2">
              <div>
                <Label>YES — What company ? Was it a lending ?</Label>
                <Input
                  value={pic.otherVerificationCalls?.company ?? ""}
                  onChange={(e) =>
                    setPic({
                      otherVerificationCalls: { ...pic.otherVerificationCalls, status: "yes", company: e.target.value },
                    })
                  }
                />
              </div>
              <div>
                <Label>None — Have you recall that somebody called up for verification for the last 3 months</Label>
                <div className="flex gap-4 pt-2">
                  <Radio
                    name="pic-recall"
                    value="yes"
                    checked={pic.otherVerificationCalls?.recalledLast3Months === true}
                    onChange={() => setPic({ otherVerificationCalls: { ...pic.otherVerificationCalls, status: "none", recalledLast3Months: true } })}
                    label="Yes"
                  />
                  <Radio
                    name="pic-recall"
                    value="no"
                    checked={pic.otherVerificationCalls?.recalledLast3Months === false}
                    onChange={() => setPic({ otherVerificationCalls: { ...pic.otherVerificationCalls, status: "none", recalledLast3Months: false } })}
                    label="No"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-navy-900">
              II. References Information
            </h3>
            <Button type="button" variant="secondary" size="sm" onClick={addReference}>
              Add reference
            </Button>
          </div>
          {draft.references.map((ref, i) => (
            <ReferenceBlock
              key={i}
              index={i}
              value={ref}
              onChange={(v) => setReference(i, v)}
              onRemove={() => removeReference(i)}
            />
          ))}
        </section>

        <section>
          <h3 className="mb-3 font-display text-base font-semibold text-navy-900">
            Other Remarks
          </h3>
          <Label required>Please check if you verified the following :</Label>
          <div className="mb-4 flex flex-col gap-2">
            <Checkbox label="Validate Borrower's Information" checked={draft.checklist.validateBorrowerInfo} onChange={() => toggleChecklist("validateBorrowerInfo")} />
            <Checkbox label="Validate PIC Information" checked={draft.checklist.validatePicInfo} onChange={() => toggleChecklist("validatePicInfo")} />
            <Checkbox label="Preside PIC Obligation / Spill" checked={draft.checklist.presidePicObligationSpill} onChange={() => toggleChecklist("presidePicObligationSpill")} />
            <Checkbox label="Verified Character References" checked={draft.checklist.verifiedCharacterReferences} onChange={() => toggleChecklist("verifiedCharacterReferences")} />
          </div>

          <Label>PIC preffered payment?</Label>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PAYMENT_METHODS.map((m) => (
              <Radio
                key={m.value}
                name="pic-payment-method"
                value={m.value}
                checked={draft.paymentPreference.method === m.value}
                onChange={() =>
                  setDraft((d) => ({
                    ...d,
                    paymentPreference: {
                      ...d.paymentPreference,
                      method: m.value,
                      ...(m.value !== "BANK" ? { bankSpecify: "" } : {}),
                      ...(m.value !== "OTHERS" ? { othersSpecify: "" } : {}),
                    },
                  }))
                }
                label={m.label}
              />
            ))}
          </div>
          {draft.paymentPreference.method === "BANK" ||
          draft.paymentPreference.method === "OTHERS" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {draft.paymentPreference.method === "BANK" ? (
                <Field
                  label="BANK   :"
                  value={draft.paymentPreference.bankSpecify ?? ""}
                  onChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      paymentPreference: { ...d.paymentPreference, bankSpecify: v },
                    }))
                  }
                />
              ) : null}
              {draft.paymentPreference.method === "OTHERS" ? (
                <Field
                  label="SPECIFY :"
                  value={draft.paymentPreference.othersSpecify ?? ""}
                  onChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      paymentPreference: { ...d.paymentPreference, othersSpecify: v },
                    }))
                  }
                />
              ) : null}
            </div>
          ) : null}
          <div className="mt-3">
            <Label>REMARKS:</Label>
            <Textarea value={draft.paymentPreference.remarks ?? ""} onChange={(e) => setDraft((d) => ({ ...d, paymentPreference: { ...d.paymentPreference, remarks: e.target.value } }))} />
          </div>

          <ScriptLine>How the Person In charge dealt with the verification?</ScriptLine>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DEMEANOR_TAGS.map((t) => (
              <Checkbox
                key={t.value}
                label={t.label}
                checked={draft.demeanor.includes(t.value)}
                onChange={() => toggleDemeanor(t.value)}
              />
            ))}
          </div>

          <ScriptLine>
            How will you rate PIC from 5 (highest) 1(lowest) <b>*</b>
          </ScriptLine>
          <div className="mb-3 flex gap-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <Radio
                key={n}
                name="pic-rating"
                value={String(n)}
                checked={draft.rating === n}
                onChange={() => setDraft((d) => ({ ...d, rating: n }))}
                label={String(n)}
              />
            ))}
          </div>
          <div className="mb-4">
            <Label>Why?</Label>
            <Input value={draft.ratingReason ?? ""} onChange={(e) => setDraft((d) => ({ ...d, ratingReason: e.target.value }))} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Verified by:"
              value={readOnly ? (draft.verifiedBy ?? "") : verifierName}
              onChange={() => {}}
              disabled
            />
            <Field label="Date :" type="date" value={draft.verifiedDate ?? ""} onChange={(v) => setDraft((d) => ({ ...d, verifiedDate: v }))} />
          </div>
        </section>
      </fieldset>
    </Modal>
  );
}

export function ciFormCompletionBadge(saved: {
  picVerification: PicVerification | null;
  referenceVerifications: ReferenceVerification[] | null;
  verificationChecklist: VerificationChecklist | null;
  picRating: number | null;
}): { label: string; variant: "neutral" | "warning" | "success" } {
  if (!saved.picVerification && !saved.referenceVerifications) {
    return { label: "Not started", variant: "neutral" };
  }
  const { complete } = assessCiReferencesRequired({
    pic: saved.picVerification,
    references: saved.referenceVerifications,
    checklist: saved.verificationChecklist,
    picRating: saved.picRating,
  });
  if (complete) {
    return { label: "Form complete", variant: "success" };
  }
  return { label: "Draft saved", variant: "warning" };
}
