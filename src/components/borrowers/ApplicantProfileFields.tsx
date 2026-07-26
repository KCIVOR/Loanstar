"use client";

import { Button, Card, Input, Label } from "@/components/ui";
import type {
  AllotteeInfo,
  BorrowerProfile,
  ContactChannels,
  Dependent,
  FinancialInfo,
  ManningAgency,
  Reference,
} from "@/lib/borrowers/types";

const CARD_TITLE = "mb-4 font-display text-lg font-semibold text-navy-900";

/** A left|right field pair on one row, mirroring the two-column layout of
 * docs/documents/seafarer_application_form.jpeg. */
function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
    </div>
  );
}

function computeAge(dateOfBirth: string | null): string {
  if (!dateOfBirth) return "";
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return String(age);
}

/**
 * Digital fields matching the Credit Application Form section-by-section and
 * field-by-field (docs/documents/seafarer_application_form.jpeg) — shared by
 * the borrower portal and the CSA intake page so both write the same shape
 * to `borrowers`. "Loan Desired"/"Terms"/"Purpose of Loan" here are the
 * borrower's informal request text as printed on the paper form, distinct
 * from the actual computed/approved figures on the Computation panel.
 */
export function ApplicantProfileFields({
  profile,
  onChange: onChangeProp,
  emailEditable = false,
  readOnly = false,
}: {
  profile: BorrowerProfile;
  onChange?: (profile: BorrowerProfile) => void;
  emailEditable?: boolean;
  /** View-only — disables all inputs (e.g. CIG reviewing CSA/borrower form). */
  readOnly?: boolean;
}) {
  const onChange = (next: BorrowerProfile) => {
    if (readOnly || !onChangeProp) return;
    onChangeProp(next);
  };
  const contact = (profile.profileData ?? {}) as ContactChannels & {
    loanDesired?: string;
    requestedTerms?: string;
    purposeOfLoan?: string;
  };
  const setProfileData = (patch: Record<string, unknown>) =>
    onChange({
      ...profile,
      profileData: { ...profile.profileData, ...patch },
    });

  return (
    <fieldset
      disabled={readOnly}
      className="m-0 min-w-0 space-y-6 border-0 p-0"
    >
      <Card>
        <FieldRow>
          <Field
            id="loanDesired"
            label="Loan desired"
            value={contact.loanDesired ?? ""}
            onChange={(v) => setProfileData({ loanDesired: v })}
          />
          <Field
            id="rank"
            label="Rank"
            value={profile.picWork.rank ?? ""}
            onChange={(v) =>
              onChange({ ...profile, picWork: { ...profile.picWork, rank: v } })
            }
          />
        </FieldRow>
        <FieldRow>
          <Field
            id="requestedTerms"
            label="Terms"
            value={contact.requestedTerms ?? ""}
            onChange={(v) => setProfileData({ requestedTerms: v })}
          />
          <Field
            id="purposeOfLoan"
            label="Purpose of loan"
            value={contact.purposeOfLoan ?? ""}
            onChange={(v) => setProfileData({ purposeOfLoan: v })}
          />
        </FieldRow>
      </Card>

      <Card>
        <h2 className={CARD_TITLE}>I. Personal information</h2>
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Field
            id="firstName"
            label="First name *"
            value={profile.firstName}
            onChange={(v) => onChange({ ...profile, firstName: v })}
          />
          <Field
            id="middleName"
            label="Middle name"
            value={profile.middleName ?? ""}
            onChange={(v) => onChange({ ...profile, middleName: v })}
          />
          <Field
            id="lastName"
            label="Surname *"
            value={profile.lastName}
            onChange={(v) => onChange({ ...profile, lastName: v })}
          />
        </div>

        <Field
          id="presentAddress"
          label="Present address"
          value={profile.presentAddress.street ?? ""}
          onChange={(v) =>
            onChange({
              ...profile,
              presentAddress: { ...profile.presentAddress, street: v },
            })
          }
        />
        <FieldRow>
          <Field
            id="presentLengthOfStay"
            label="Length of stay"
            value={profile.presentAddress.lengthOfStay ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                presentAddress: { ...profile.presentAddress, lengthOfStay: v },
              })
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="presentOwnership"
              label="Ownership"
              value={profile.presentAddress.ownership ?? ""}
              onChange={(v) =>
                onChange({
                  ...profile,
                  presentAddress: { ...profile.presentAddress, ownership: v },
                })
              }
            />
            <Field
              id="presentMortgage"
              label="Mortgage"
              value={profile.presentAddress.mortgage ?? ""}
              onChange={(v) =>
                onChange({
                  ...profile,
                  presentAddress: { ...profile.presentAddress, mortgage: v },
                })
              }
            />
          </div>
        </FieldRow>

        <Field
          id="permanentAddress"
          label="Permanent address"
          value={profile.permanentAddress.street ?? ""}
          onChange={(v) =>
            onChange({
              ...profile,
              permanentAddress: { ...profile.permanentAddress, street: v },
            })
          }
        />
        <FieldRow>
          <Field
            id="permanentLengthOfStay"
            label="Length of stay"
            value={profile.permanentAddress.lengthOfStay ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                permanentAddress: {
                  ...profile.permanentAddress,
                  lengthOfStay: v,
                },
              })
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="permanentOwnership"
              label="Ownership"
              value={profile.permanentAddress.ownership ?? ""}
              onChange={(v) =>
                onChange({
                  ...profile,
                  permanentAddress: {
                    ...profile.permanentAddress,
                    ownership: v,
                  },
                })
              }
            />
            <Field
              id="permanentMortgage"
              label="Mortgage"
              value={profile.permanentAddress.mortgage ?? ""}
              onChange={(v) =>
                onChange({
                  ...profile,
                  permanentAddress: {
                    ...profile.permanentAddress,
                    mortgage: v,
                  },
                })
              }
            />
          </div>
        </FieldRow>

        <FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="dateOfBirth"
              label="Date of birth"
              type="date"
              value={profile.dateOfBirth ?? ""}
              onChange={(v) => onChange({ ...profile, dateOfBirth: v })}
            />
            <Field id="age" label="Age" value={computeAge(profile.dateOfBirth)} disabled />
          </div>
          <Field
            id="civilStatus"
            label="Civil status"
            value={profile.civilStatus ?? ""}
            onChange={(v) => onChange({ ...profile, civilStatus: v })}
          />
        </FieldRow>

        <FieldRow>
          <Field
            id="placeOfBirth"
            label="Place of birth"
            value={profile.placeOfBirth ?? ""}
            onChange={(v) => onChange({ ...profile, placeOfBirth: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="viber"
              label="Viber"
              value={contact.viber ?? ""}
              onChange={(v) => setProfileData({ viber: v })}
            />
            <Field
              id="skype"
              label="Skype"
              value={contact.skype ?? ""}
              onChange={(v) => setProfileData({ skype: v })}
            />
          </div>
        </FieldRow>

        <FieldRow>
          <Field
            id="mobilePhone"
            label="Mobile / Tel. numbers"
            value={profile.mobilePhone ?? ""}
            onChange={(v) => onChange({ ...profile, mobilePhone: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="othersContact"
              label="Others"
              value={contact.othersContact ?? ""}
              onChange={(v) => setProfileData({ othersContact: v })}
            />
            <Field
              id="roaming"
              label="Roaming"
              value={contact.roaming ?? ""}
              onChange={(v) => setProfileData({ roaming: v })}
            />
          </div>
        </FieldRow>

        <FieldRow>
          <Field
            id="email"
            label="Email address"
            value={profile.email}
            disabled={!emailEditable}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="fb"
              label="FB"
              value={contact.facebook ?? ""}
              onChange={(v) => setProfileData({ facebook: v })}
            />
            <Field
              id="education"
              label="Education"
              value={contact.education ?? ""}
              onChange={(v) => setProfileData({ education: v })}
            />
          </div>
        </FieldRow>
      </Card>

      <Card>
        <h2 className={CARD_TITLE}>II. Manning agency</h2>
        <FieldRow>
          <Field
            id="ma_name"
            label="Manning agency"
            value={profile.manningAgency.name ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                manningAgency: { ...profile.manningAgency, name: v } as ManningAgency,
              })
            }
          />
          <Field
            id="ma_crewingManager"
            label="Crewing manager"
            value={profile.manningAgency.crewingManager ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                manningAgency: {
                  ...profile.manningAgency,
                  crewingManager: v,
                } as ManningAgency,
              })
            }
          />
        </FieldRow>
        <FieldRow>
          <Field
            id="pic_vessel"
            label="Name of vessel"
            value={profile.picWork.vessel ?? ""}
            onChange={(v) =>
              onChange({ ...profile, picWork: { ...profile.picWork, vessel: v } })
            }
          />
          <Field
            id="ma_crewingManagerContact"
            label="Contact number"
            value={profile.manningAgency.crewingManagerContact ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                manningAgency: {
                  ...profile.manningAgency,
                  crewingManagerContact: v,
                } as ManningAgency,
              })
            }
          />
        </FieldRow>
        <FieldRow>
          <Field
            id="ma_yearsOfStay"
            label="Years of stay"
            value={profile.manningAgency.yearsOfStay ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                manningAgency: { ...profile.manningAgency, yearsOfStay: v } as ManningAgency,
              })
            }
          />
          <Field
            id="pic_contractDuration"
            label="Contract duration"
            value={profile.picWork.contractDuration ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                picWork: { ...profile.picWork, contractDuration: v },
              })
            }
          />
        </FieldRow>
        <FieldRow>
          <Field
            id="ma_departureDate"
            label="Departure date"
            value={profile.manningAgency.departureDate ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                manningAgency: { ...profile.manningAgency, departureDate: v } as ManningAgency,
              })
            }
          />
          <Field
            id="ma_previousAgency"
            label="Prev. manning agency"
            value={profile.manningAgency.previousAgency ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                manningAgency: {
                  ...profile.manningAgency,
                  previousAgency: v,
                } as ManningAgency,
              })
            }
          />
        </FieldRow>
        <FieldRow>
          <Field
            id="ma_previousSignOffDate"
            label="Previous sign-off date"
            value={profile.manningAgency.previousSignOffDate ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                manningAgency: {
                  ...profile.manningAgency,
                  previousSignOffDate: v,
                } as ManningAgency,
              })
            }
          />
          <Field
            id="ma_reasonForTransfer"
            label="Reason of transfer / years"
            value={profile.manningAgency.reasonForTransfer ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                manningAgency: {
                  ...profile.manningAgency,
                  reasonForTransfer: v,
                } as ManningAgency,
              })
            }
          />
        </FieldRow>
      </Card>

      <Card>
        <h2 className={CARD_TITLE}>III. Financial information</h2>
        <FieldRow>
          <Field
            id="fin_usd"
            label="Mo. income in Dollar ($)"
            value={String(profile.financial.monthlyIncomeUsd ?? "")}
            onChange={(v) =>
              onChange({
                ...profile,
                financial: {
                  ...profile.financial,
                  monthlyIncomeUsd: Number(v) || undefined,
                } as FinancialInfo,
              })
            }
          />
          <Field
            id="fin_php"
            label="Mo. income in Peso (PHP)"
            value={String(profile.financial.monthlyIncomePhp ?? "")}
            onChange={(v) =>
              onChange({
                ...profile,
                financial: {
                  ...profile.financial,
                  monthlyIncomePhp: Number(v) || undefined,
                } as FinancialInfo,
              })
            }
          />
        </FieldRow>
        <FieldRow>
          <Field
            id="fin_household"
            label="Household expenses (PHP)"
            value={String(profile.financial.householdExpensesPhp ?? "")}
            onChange={(v) =>
              onChange({
                ...profile,
                financial: {
                  ...profile.financial,
                  householdExpensesPhp: Number(v) || undefined,
                } as FinancialInfo,
              })
            }
          />
          <Field
            id="fin_otherLoans"
            label="Others loans (PHP)"
            value={String(profile.financial.otherLoansPhp ?? "")}
            onChange={(v) =>
              onChange({
                ...profile,
                financial: {
                  ...profile.financial,
                  otherLoansPhp: Number(v) || undefined,
                } as FinancialInfo,
              })
            }
          />
        </FieldRow>
      </Card>

      <Card>
        <h2 className={CARD_TITLE}>
          IV. Allottee / person in charge to pay while on board
        </h2>
        <FieldRow>
          <Field
            id="all_name"
            label="Name"
            value={profile.allottee.name ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                allottee: { ...profile.allottee, name: v } as AllotteeInfo,
              })
            }
          />
          <Field
            id="all_allotmentPercent"
            label="Allotment % / day"
            value={profile.allottee.allotmentPercent ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                allottee: { ...profile.allottee, allotmentPercent: v } as AllotteeInfo,
              })
            }
          />
        </FieldRow>
        <FieldRow>
          <Field
            id="all_relationship"
            label="Relation"
            value={profile.allottee.relationship ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                allottee: { ...profile.allottee, relationship: v } as AllotteeInfo,
              })
            }
          />
          <Field
            id="all_phone"
            label="Contact nos."
            value={profile.allottee.phone ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                allottee: { ...profile.allottee, phone: v } as AllotteeInfo,
              })
            }
          />
        </FieldRow>
        <FieldRow>
          <Field
            id="all_email"
            label="Email"
            value={profile.allottee.email ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                allottee: { ...profile.allottee, email: v } as AllotteeInfo,
              })
            }
          />
          <Field
            id="all_facebook"
            label="Facebook"
            value={profile.allottee.facebook ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                allottee: { ...profile.allottee, facebook: v } as AllotteeInfo,
              })
            }
          />
        </FieldRow>
        <Field
          id="all_address"
          label="Complete address"
          value={profile.allottee.address?.street ?? ""}
          onChange={(v) =>
            onChange({
              ...profile,
              allottee: {
                ...profile.allottee,
                address: { ...profile.allottee.address, street: v },
              },
            })
          }
        />
      </Card>

      <Card>
        <h2 className={CARD_TITLE}>
          V. Work information of allottee / person in-charge
        </h2>
        <FieldRow>
          <Field
            id="all_companyName"
            label="Company name"
            value={profile.allottee.companyName ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                allottee: { ...profile.allottee, companyName: v } as AllotteeInfo,
              })
            }
          />
          <Field
            id="all_yearsStayed"
            label="Years stayed"
            value={profile.allottee.yearsStayed ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                allottee: { ...profile.allottee, yearsStayed: v } as AllotteeInfo,
              })
            }
          />
        </FieldRow>
        <FieldRow>
          <Field
            id="all_companyAddress"
            label="Company address"
            value={profile.allottee.companyAddress ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                allottee: { ...profile.allottee, companyAddress: v } as AllotteeInfo,
              })
            }
          />
          <Field
            id="all_companyPhone"
            label="Phone no."
            value={profile.allottee.companyPhone ?? ""}
            onChange={(v) =>
              onChange({
                ...profile,
                allottee: { ...profile.allottee, companyPhone: v } as AllotteeInfo,
              })
            }
          />
        </FieldRow>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-navy-900">
            VI. Dependents / siblings
          </h2>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({
                ...profile,
                dependents: [
                  ...profile.dependents,
                  { name: "", age: "", contactNo: "", occupation: "" },
                ],
              })
            }
          >
            Add dependent
          </Button>
        </div>
        <div className="mb-2 hidden gap-3 text-xs font-semibold uppercase tracking-wide text-ink-400 sm:grid sm:grid-cols-[repeat(4,1fr)_auto]">
          <span>Name</span>
          <span>Age</span>
          <span>Tel / CP number</span>
          <span>Occupation / school</span>
          <span className="w-[72px]" aria-hidden />
        </div>
        {profile.dependents.map((dep, i) => (
          <div
            key={i}
            className="mb-3 grid gap-3 border-b border-line-soft pb-3 sm:grid-cols-[repeat(4,1fr)_auto]"
          >
            {(["name", "age", "contactNo", "occupation"] as const).map((f) => (
              <Input
                key={f}
                value={dep[f] ?? ""}
                onChange={(e) => {
                  const deps = [...profile.dependents];
                  deps[i] = { ...dep, [f]: e.target.value };
                  onChange({ ...profile, dependents: deps as Dependent[] });
                }}
              />
            ))}
            <Button
              type="button"
              variant="danger-soft"
              size="sm"
              className="w-[72px] self-center justify-self-end"
              aria-label={`Remove dependent ${i + 1}`}
              onClick={() =>
                onChange({
                  ...profile,
                  dependents: profile.dependents.filter((_, idx) => idx !== i),
                })
              }
            >
              Remove
            </Button>
          </div>
        ))}
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-navy-900">
            VII. Reference
          </h2>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({
                ...profile,
                references: [
                  ...profile.references,
                  { name: "", relationship: "", phone: "", occupation: "" },
                ],
              })
            }
          >
            Add reference
          </Button>
        </div>
        <div className="mb-2 hidden gap-3 text-xs font-semibold uppercase tracking-wide text-ink-400 sm:grid sm:grid-cols-[repeat(4,1fr)_auto]">
          <span>Name of reference</span>
          <span>Relation</span>
          <span>Contact no.</span>
          <span>Occupation</span>
          <span className="w-[72px]" aria-hidden />
        </div>
        {profile.references.map((ref, i) => (
          <div
            key={i}
            className="mb-3 grid gap-3 border-b border-line-soft pb-3 sm:grid-cols-[repeat(4,1fr)_auto]"
          >
            {(["name", "relationship", "phone", "occupation"] as const).map(
              (f) => (
                <Input
                  key={f}
                  value={ref[f] ?? ""}
                  onChange={(e) => {
                    const refs = [...profile.references];
                    refs[i] = { ...ref, [f]: e.target.value };
                    onChange({ ...profile, references: refs as Reference[] });
                  }}
                />
              ),
            )}
            <Button
              type="button"
              variant="danger-soft"
              size="sm"
              className="w-[72px] self-center justify-self-end"
              aria-label={`Remove reference ${i + 1}`}
              onClick={() =>
                onChange({
                  ...profile,
                  references: profile.references.filter((_, idx) => idx !== i),
                })
              }
            >
              Remove
            </Button>
          </div>
        ))}
      </Card>
    </fieldset>
  );
}
