"use client";

import { Button, Card, Input, Label, PhoneInput } from "@/components/ui";
import type {
  BusinessBankAccount,
  BusinessInfo,
  BusinessOfficer,
  BusinessStockholder,
  CreditReference,
  SmeSpouseInfo,
  TradeParty,
} from "@/lib/borrowers/business-info";
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

function padRows<T extends object>(rows: T[] | undefined, min: number): T[] {
  const out = [...(rows ?? [])];
  while (out.length < min) out.push({} as T);
  return out;
}

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

/** Same shape as Field, but for single-person mobile numbers — country
 * picker matches the register/account/CSA mobile fields. */
function PhoneField({
  id,
  label,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <PhoneInput
        id={id}
        value={value}
        disabled={disabled}
        onChange={onChange ?? (() => {})}
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
  segment = "seafarer",
  entityType = null,
}: {
  profile: BorrowerProfile;
  onChange?: (profile: BorrowerProfile) => void;
  emailEditable?: boolean;
  /** View-only — disables all inputs (e.g. CIG reviewing CSA/borrower form). */
  readOnly?: boolean;
  /** Loan segment — SME hides seafarer manning/allottee and shows business_info. */
  segment?: "seafarer" | "sme";
  entityType?: "individual" | "corporate" | null;
}) {
  const onChange = (next: BorrowerProfile) => {
    if (readOnly || !onChangeProp) return;
    onChangeProp(next);
  };
  const isSme = segment === "sme";
  const isCorporate = isSme && entityType === "corporate";
  const isIndividualSme = isSme && entityType === "individual";
  const biz = profile.businessInfo ?? {};
  const setBiz = (patch: Partial<BusinessInfo>) =>
    onChange({
      ...profile,
      businessInfo: { ...biz, ...patch },
    });
  const setSpouse = (patch: Partial<SmeSpouseInfo>) =>
    setBiz({ spouse: { ...(biz.spouse ?? {}), ...patch } });
  const contact = (profile.profileData ?? {}) as ContactChannels & {
    loanDesired?: string;
    requestedTerms?: string;
    purposeOfLoan?: string;
    relativesLivingInProvince?: string;
    relativesLivingInProvinceAddress?: string;
    relativesLivingInProvinceContact?: string;
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
          {isSme ? (
            <Field
              id="salesAgent"
              label="Sales agent"
              value={biz.salesAgent ?? ""}
              onChange={(v) => setBiz({ salesAgent: v })}
            />
          ) : (
            <Field
              id="rank"
              label="Rank"
              value={profile.picWork.rank ?? ""}
              onChange={(v) =>
                onChange({
                  ...profile,
                  picWork: { ...profile.picWork, rank: v },
                })
              }
            />
          )}
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
              id="teams"
              label="Teams"
              value={contact.teams ?? ""}
              onChange={(v) => setProfileData({ teams: v })}
            />
          </div>
        </FieldRow>

        <FieldRow>
          <PhoneField
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

      {isSme ? (
        <Card>
          <h2 className={CARD_TITLE}>
            {isCorporate ? "II. Facts about the company" : "II. Business / employment"}
          </h2>
          <FieldRow>
            <Field
              id="biz_companyName"
              label={isCorporate ? "Name of company" : "Company or employer's name"}
              value={biz.companyName ?? ""}
              onChange={(v) => setBiz({ companyName: v })}
            />
            {isCorporate ? (
              <Field
                id="biz_acronym"
                label="Acronym"
                value={biz.acronym ?? ""}
                onChange={(v) => setBiz({ acronym: v })}
              />
            ) : (
              <Field
                id="biz_position"
                label="Position"
                value={biz.position ?? ""}
                onChange={(v) => setBiz({ position: v })}
              />
            )}
          </FieldRow>
          <Field
            id="biz_address"
            label={isCorporate ? "Office address" : "Company address"}
            value={
              isCorporate
                ? (biz.officeAddress ?? "")
                : (biz.companyAddress ?? "")
            }
            onChange={(v) =>
              setBiz(
                isCorporate ? { officeAddress: v } : { companyAddress: v },
              )
            }
          />
          <FieldRow>
            <Field
              id="biz_landline"
              label={isCorporate ? "Landline nos." : "Contact number"}
              value={
                isCorporate
                  ? (biz.landlineNos ?? "")
                  : (biz.companyContactNumber ?? "")
              }
              onChange={(v) =>
                setBiz(
                  isCorporate
                    ? { landlineNos: v }
                    : { companyContactNumber: v },
                )
              }
            />
            <Field
              id="biz_mobile"
              label={isCorporate ? "Mobile nos." : "Years of stay"}
              value={
                isCorporate ? (biz.mobileNos ?? "") : (biz.yearsOfStay ?? "")
              }
              onChange={(v) =>
                setBiz(isCorporate ? { mobileNos: v } : { yearsOfStay: v })
              }
            />
          </FieldRow>
          <FieldRow>
            <Field
              id="biz_nature"
              label={isCorporate ? "Nature of business" : "Years of operation"}
              value={
                isCorporate
                  ? (biz.natureOfBusiness ?? "")
                  : (biz.yearsOfOperation ?? "")
              }
              onChange={(v) =>
                setBiz(
                  isCorporate
                    ? { natureOfBusiness: v }
                    : { yearsOfOperation: v },
                )
              }
            />
            <Field
              id="biz_email"
              label="Business email"
              value={biz.companyEmail ?? ""}
              onChange={(v) => setBiz({ companyEmail: v })}
            />
          </FieldRow>
          <FieldRow>
            <Field
              id="biz_website"
              label="Website"
              value={biz.website ?? ""}
              onChange={(v) => setBiz({ website: v })}
            />
            {isCorporate ? (
              <Field
                id="biz_tin"
                label="TIN"
                value={biz.tin ?? ""}
                onChange={(v) => setBiz({ tin: v })}
              />
            ) : (
              <Field
                id="biz_prevEmployer"
                label="Previous employer"
                value={biz.previousEmployer ?? ""}
                onChange={(v) => setBiz({ previousEmployer: v })}
              />
            )}
          </FieldRow>
          {isCorporate ? (
            <>
              <FieldRow>
                <Field
                  id="biz_fax"
                  label="Fax no."
                  value={biz.faxNo ?? ""}
                  onChange={(v) => setBiz({ faxNo: v })}
                />
                <Field
                  id="biz_branches"
                  label="No. of branches"
                  value={biz.numberOfBranches ?? ""}
                  onChange={(v) => setBiz({ numberOfBranches: v })}
                />
              </FieldRow>
              <FieldRow>
                <Field
                  id="biz_established"
                  label="Date established"
                  value={biz.dateEstablished ?? ""}
                  onChange={(v) => setBiz({ dateEstablished: v })}
                />
                <Field
                  id="biz_employees"
                  label="No. of employees"
                  value={biz.numberOfEmployees ?? ""}
                  onChange={(v) => setBiz({ numberOfEmployees: v })}
                />
              </FieldRow>
            </>
          ) : (
            <>
              <Field
                id="biz_prevAddress"
                label="Previous company address"
                value={biz.previousCompanyAddress ?? ""}
                onChange={(v) => setBiz({ previousCompanyAddress: v })}
              />
              <FieldRow>
                <Field
                  id="biz_prevYears"
                  label="Previous yrs of stay"
                  value={biz.previousYearsOfStay ?? ""}
                  onChange={(v) => setBiz({ previousYearsOfStay: v })}
                />
                <Field
                  id="biz_prevContact"
                  label="Previous contact number"
                  value={biz.previousContactNumber ?? ""}
                  onChange={(v) => setBiz({ previousContactNumber: v })}
                />
              </FieldRow>
            </>
          )}
        </Card>
      ) : null}

      {!isSme ? (
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
      ) : null}

      {isIndividualSme ? (
        <Card>
          <h2 className={CARD_TITLE}>III. Spouse information</h2>
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <Field
              id="spouse_lastName"
              label="Last name"
              value={biz.spouse?.lastName ?? ""}
              onChange={(v) => setSpouse({ lastName: v })}
            />
            <Field
              id="spouse_firstName"
              label="First name"
              value={biz.spouse?.firstName ?? ""}
              onChange={(v) => setSpouse({ firstName: v })}
            />
            <Field
              id="spouse_middleName"
              label="Middle name"
              value={biz.spouse?.middleName ?? ""}
              onChange={(v) => setSpouse({ middleName: v })}
            />
          </div>
          <FieldRow>
            <Field
              id="spouse_dob"
              label="Date of birth"
              type="date"
              value={biz.spouse?.dateOfBirth ?? ""}
              onChange={(v) => setSpouse({ dateOfBirth: v })}
            />
            <PhoneField
              id="spouse_contact"
              label="Contact number"
              value={biz.spouse?.contactNumber ?? ""}
              onChange={(v) => setSpouse({ contactNumber: v })}
            />
          </FieldRow>
          <FieldRow>
            <Field
              id="spouse_presentAddress"
              label="Present address"
              value={biz.spouse?.presentAddress ?? ""}
              onChange={(v) => setSpouse({ presentAddress: v })}
            />
            <Field
              id="spouse_yrsPresent"
              label="Yrs of stay (present)"
              value={biz.spouse?.yearsOfStayPresent ?? ""}
              onChange={(v) => setSpouse({ yearsOfStayPresent: v })}
            />
          </FieldRow>
          <FieldRow>
            <Field
              id="spouse_provincialAddress"
              label="Provincial address"
              value={biz.spouse?.provincialAddress ?? ""}
              onChange={(v) => setSpouse({ provincialAddress: v })}
            />
            <Field
              id="spouse_yrsProvincial"
              label="Yrs of stay (provincial)"
              value={biz.spouse?.yearsOfStayProvincial ?? ""}
              onChange={(v) => setSpouse({ yearsOfStayProvincial: v })}
            />
          </FieldRow>
          <FieldRow>
            <Field
              id="spouse_company"
              label="Company or employer's name"
              value={biz.spouse?.companyOrEmployerName ?? ""}
              onChange={(v) => setSpouse({ companyOrEmployerName: v })}
            />
            <Field
              id="spouse_yrsCompany"
              label="Yrs of stay (company)"
              value={biz.spouse?.yearsOfStayCompany ?? ""}
              onChange={(v) => setSpouse({ yearsOfStayCompany: v })}
            />
          </FieldRow>
          <FieldRow>
            <Field
              id="spouse_position"
              label="Position"
              value={biz.spouse?.position ?? ""}
              onChange={(v) => setSpouse({ position: v })}
            />
            <Field
              id="spouse_companyAddress"
              label="Company address"
              value={biz.spouse?.companyAddress ?? ""}
              onChange={(v) => setSpouse({ companyAddress: v })}
            />
          </FieldRow>
        </Card>
      ) : null}

      {isIndividualSme ? (
        <Card>
          <h2 className={CARD_TITLE}>IV. Income declaration</h2>
          <p className="mb-3 text-sm text-ink-500">Own monthly income</p>
          <FieldRow>
            <Field
              id="biz_gross"
              label="Gross income"
              value={biz.businessGrossIncome ?? ""}
              onChange={(v) => setBiz({ businessGrossIncome: v })}
            />
            <Field
              id="biz_expenses"
              label="Less expenses"
              value={biz.businessLessExpenses ?? ""}
              onChange={(v) => setBiz({ businessLessExpenses: v })}
            />
          </FieldRow>
          <FieldRow>
            <Field
              id="biz_net"
              label="Net income"
              value={biz.businessNetIncome ?? ""}
              onChange={(v) => setBiz({ businessNetIncome: v })}
            />
            <Field
              id="biz_ownMonthly"
              label="Own monthly income (optional)"
              value={biz.ownMonthlyIncome ?? ""}
              onChange={(v) => setBiz({ ownMonthlyIncome: v })}
            />
          </FieldRow>
          <p className="mb-3 mt-4 text-sm text-ink-500">Spouse&apos;s monthly income</p>
          <FieldRow>
            <Field
              id="biz_spouseGross"
              label="Gross income"
              value={biz.spouseGrossIncome ?? biz.spouseMonthlyIncome ?? ""}
              onChange={(v) =>
                setBiz({ spouseGrossIncome: v, spouseMonthlyIncome: v })
              }
            />
            <Field
              id="biz_spouseExpenses"
              label="Less expenses"
              value={biz.spouseLessExpenses ?? ""}
              onChange={(v) => setBiz({ spouseLessExpenses: v })}
            />
          </FieldRow>
          <Field
            id="biz_spouseNet"
            label="Net income"
            value={biz.spouseNetIncome ?? biz.spouseMonthlyIncome ?? ""}
            onChange={(v) => setBiz({ spouseNetIncome: v })}
          />
          <p className="mb-3 mt-4 text-sm text-ink-500">Other income</p>
          <FieldRow>
            <Field
              id="biz_source"
              label="Source of income"
              value={biz.sourceOfIncome ?? ""}
              onChange={(v) => setBiz({ sourceOfIncome: v })}
            />
            <Field
              id="biz_otherIncome"
              label="Monthly income"
              value={biz.otherIncome ?? ""}
              onChange={(v) => setBiz({ otherIncome: v })}
            />
          </FieldRow>
          <Field
            id="biz_totalNet"
            label="Total net income"
            value={biz.totalNetIncome ?? ""}
            onChange={(v) => setBiz({ totalNetIncome: v })}
          />
        </Card>
      ) : null}

      {isCorporate ? (
        <Card>
          <h2 className={CARD_TITLE}>III. Company officers</h2>
          {padRows<BusinessOfficer>(biz.companyOfficers, 3).map((officer, i) => (
            <div key={`officer-${i}`} className="mb-3 grid gap-3 sm:grid-cols-3">
              <Field
                id={`officer_name_${i}`}
                label={i === 0 ? "Name" : `Name ${i + 1}`}
                value={officer.name ?? ""}
                onChange={(v) => {
                  const rows = padRows<BusinessOfficer>(biz.companyOfficers, 3);
                  rows[i] = { ...rows[i], name: v };
                  setBiz({ companyOfficers: rows });
                }}
              />
              <Field
                id={`officer_address_${i}`}
                label="Address"
                value={officer.address ?? ""}
                onChange={(v) => {
                  const rows = padRows<BusinessOfficer>(biz.companyOfficers, 3);
                  rows[i] = { ...rows[i], address: v };
                  setBiz({ companyOfficers: rows });
                }}
              />
              <Field
                id={`officer_position_${i}`}
                label="Position"
                value={officer.position ?? ""}
                onChange={(v) => {
                  const rows = padRows<BusinessOfficer>(biz.companyOfficers, 3);
                  rows[i] = { ...rows[i], position: v };
                  setBiz({ companyOfficers: rows });
                }}
              />
            </div>
          ))}
        </Card>
      ) : null}

      {!isSme ? (
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
      ) : null}

      {!isSme ? (
      <>
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
          <PhoneField
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
      </>
      ) : null}

      {isCorporate ? (
        <Card>
          <h2 className={CARD_TITLE}>IV. Major stockholders</h2>
          {padRows<BusinessStockholder>(biz.majorStockholders, 5)
            .slice(0, 5)
            .map((row, i) => (
              <div
                key={`stock-${i}`}
                className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              >
                <Field
                  id={`stock_name_${i}`}
                  label="Name"
                  value={row.name ?? ""}
                  onChange={(v) => {
                    const rows = padRows<BusinessStockholder>(
                      biz.majorStockholders,
                      5,
                    );
                    rows[i] = { ...rows[i], name: v };
                    setBiz({ majorStockholders: rows });
                  }}
                />
                <Field
                  id={`stock_address_${i}`}
                  label="Address"
                  value={row.address ?? ""}
                  onChange={(v) => {
                    const rows = padRows<BusinessStockholder>(
                      biz.majorStockholders,
                      5,
                    );
                    rows[i] = { ...rows[i], address: v };
                    setBiz({ majorStockholders: rows });
                  }}
                />
                <Field
                  id={`stock_position_${i}`}
                  label="Position"
                  value={row.position ?? ""}
                  onChange={(v) => {
                    const rows = padRows<BusinessStockholder>(
                      biz.majorStockholders,
                      5,
                    );
                    rows[i] = { ...rows[i], position: v };
                    setBiz({ majorStockholders: rows });
                  }}
                />
                <Field
                  id={`stock_equity_${i}`}
                  label="Equity"
                  value={row.equity ?? ""}
                  onChange={(v) => {
                    const rows = padRows<BusinessStockholder>(
                      biz.majorStockholders,
                      5,
                    );
                    rows[i] = { ...rows[i], equity: v };
                    setBiz({ majorStockholders: rows });
                  }}
                />
              </div>
            ))}
        </Card>
      ) : null}

      {isCorporate ? (
        <Card>
          <h2 className={CARD_TITLE}>V. Trade references</h2>
          <p className="mb-3 text-sm font-medium text-ink-600">
            Customers / clients
          </p>
          {padRows<TradeParty>(biz.tradeCustomers, 3).map((row, i) => (
            <div
              key={`cust-${i}`}
              className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Field
                id={`cust_name_${i}`}
                label="Customer / client"
                value={row.name ?? ""}
                onChange={(v) => {
                  const rows = padRows<TradeParty>(biz.tradeCustomers, 3);
                  rows[i] = { ...rows[i], name: v };
                  setBiz({ tradeCustomers: rows });
                }}
              />
              <Field
                id={`cust_address_${i}`}
                label="Address"
                value={row.address ?? ""}
                onChange={(v) => {
                  const rows = padRows<TradeParty>(biz.tradeCustomers, 3);
                  rows[i] = { ...rows[i], address: v };
                  setBiz({ tradeCustomers: rows });
                }}
              />
              <Field
                id={`cust_person_${i}`}
                label="Contact person"
                value={row.contactPerson ?? ""}
                onChange={(v) => {
                  const rows = padRows<TradeParty>(biz.tradeCustomers, 3);
                  rows[i] = { ...rows[i], contactPerson: v };
                  setBiz({ tradeCustomers: rows });
                }}
              />
              <Field
                id={`cust_no_${i}`}
                label="Contact no."
                value={row.contactNo ?? ""}
                onChange={(v) => {
                  const rows = padRows<TradeParty>(biz.tradeCustomers, 3);
                  rows[i] = { ...rows[i], contactNo: v };
                  setBiz({ tradeCustomers: rows });
                }}
              />
            </div>
          ))}
          <p className="mb-3 mt-4 text-sm font-medium text-ink-600">Suppliers</p>
          {padRows<TradeParty>(biz.tradeSuppliers, 3).map((row, i) => (
            <div
              key={`supp-${i}`}
              className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Field
                id={`supp_name_${i}`}
                label="Supplier"
                value={row.name ?? ""}
                onChange={(v) => {
                  const rows = padRows<TradeParty>(biz.tradeSuppliers, 3);
                  rows[i] = { ...rows[i], name: v };
                  setBiz({ tradeSuppliers: rows });
                }}
              />
              <Field
                id={`supp_address_${i}`}
                label="Address"
                value={row.address ?? ""}
                onChange={(v) => {
                  const rows = padRows<TradeParty>(biz.tradeSuppliers, 3);
                  rows[i] = { ...rows[i], address: v };
                  setBiz({ tradeSuppliers: rows });
                }}
              />
              <Field
                id={`supp_person_${i}`}
                label="Contact person"
                value={row.contactPerson ?? ""}
                onChange={(v) => {
                  const rows = padRows<TradeParty>(biz.tradeSuppliers, 3);
                  rows[i] = { ...rows[i], contactPerson: v };
                  setBiz({ tradeSuppliers: rows });
                }}
              />
              <Field
                id={`supp_no_${i}`}
                label="Contact no."
                value={row.contactNo ?? ""}
                onChange={(v) => {
                  const rows = padRows<TradeParty>(biz.tradeSuppliers, 3);
                  rows[i] = { ...rows[i], contactNo: v };
                  setBiz({ tradeSuppliers: rows });
                }}
              />
            </div>
          ))}
        </Card>
      ) : null}

      {isCorporate ? (
        <Card>
          <h2 className={CARD_TITLE}>VI. Credit references</h2>
          {padRows<CreditReference>(biz.creditReferences, 3).map((row, i) => (
            <div
              key={`credit-${i}`}
              className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            >
              <Field
                id={`credit_bank_${i}`}
                label="Creditor / bank"
                value={row.creditorBank ?? ""}
                onChange={(v) => {
                  const rows = padRows<CreditReference>(biz.creditReferences, 3);
                  rows[i] = { ...rows[i], creditorBank: v };
                  setBiz({ creditReferences: rows });
                }}
              />
              <Field
                id={`credit_type_${i}`}
                label="Type of loan"
                value={row.typeOfLoan ?? ""}
                onChange={(v) => {
                  const rows = padRows<CreditReference>(biz.creditReferences, 3);
                  rows[i] = { ...rows[i], typeOfLoan: v };
                  setBiz({ creditReferences: rows });
                }}
              />
              <Field
                id={`credit_bal_${i}`}
                label="Outstanding balance"
                value={row.outstandingBalance ?? ""}
                onChange={(v) => {
                  const rows = padRows<CreditReference>(biz.creditReferences, 3);
                  rows[i] = { ...rows[i], outstandingBalance: v };
                  setBiz({ creditReferences: rows });
                }}
              />
              <Field
                id={`credit_pay_${i}`}
                label="Monthly payment"
                value={row.monthlyPayment ?? ""}
                onChange={(v) => {
                  const rows = padRows<CreditReference>(biz.creditReferences, 3);
                  rows[i] = { ...rows[i], monthlyPayment: v };
                  setBiz({ creditReferences: rows });
                }}
              />
              <Field
                id={`credit_no_${i}`}
                label="Contact no."
                value={row.contactNo ?? ""}
                onChange={(v) => {
                  const rows = padRows<CreditReference>(biz.creditReferences, 3);
                  rows[i] = { ...rows[i], contactNo: v };
                  setBiz({ creditReferences: rows });
                }}
              />
            </div>
          ))}
        </Card>
      ) : null}

      {isCorporate ? (
        <Card>
          <h2 className={CARD_TITLE}>VII. Bank accounts</h2>
          {padRows<BusinessBankAccount>(biz.bankAccounts, 3).map((row, i) => (
            <div
              key={`bank-${i}`}
              className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            >
              <Field
                id={`bank_name_${i}`}
                label="Bank name"
                value={row.bankName ?? ""}
                onChange={(v) => {
                  const rows = padRows<BusinessBankAccount>(biz.bankAccounts, 3);
                  rows[i] = { ...rows[i], bankName: v };
                  setBiz({ bankAccounts: rows });
                }}
              />
              <Field
                id={`bank_branch_${i}`}
                label="Branch"
                value={row.branch ?? ""}
                onChange={(v) => {
                  const rows = padRows<BusinessBankAccount>(biz.bankAccounts, 3);
                  rows[i] = { ...rows[i], branch: v };
                  setBiz({ bankAccounts: rows });
                }}
              />
              <Field
                id={`bank_acct_${i}`}
                label="Account no."
                value={row.accountNo ?? ""}
                onChange={(v) => {
                  const rows = padRows<BusinessBankAccount>(biz.bankAccounts, 3);
                  rows[i] = { ...rows[i], accountNo: v };
                  setBiz({ bankAccounts: rows });
                }}
              />
              <Field
                id={`bank_type_${i}`}
                label="Account type"
                value={row.accountType ?? ""}
                onChange={(v) => {
                  const rows = padRows<BusinessBankAccount>(biz.bankAccounts, 3);
                  rows[i] = { ...rows[i], accountType: v };
                  setBiz({ bankAccounts: rows });
                }}
              />
              <Field
                id={`bank_no_${i}`}
                label="Contact no."
                value={row.contactNo ?? ""}
                onChange={(v) => {
                  const rows = padRows<BusinessBankAccount>(biz.bankAccounts, 3);
                  rows[i] = { ...rows[i], contactNo: v };
                  setBiz({ bankAccounts: rows });
                }}
              />
            </div>
          ))}
          <Field
            id="bank_auth"
            label="Bank name and account number (ADB verification)"
            value={biz.bankAuthorizationAccount ?? ""}
            onChange={(v) => setBiz({ bankAuthorizationAccount: v })}
          />
        </Card>
      ) : null}

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-navy-900">
            {isIndividualSme
              ? "Dependents"
              : isCorporate
                ? "Dependents (optional)"
                : "VI. Dependents / siblings"}
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
            {isIndividualSme ? "V. Reference" : "VII. Reference"}
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
                  {
                    name: "",
                    relationship: "",
                    phone: "",
                    occupation: "",
                    address: "",
                  },
                ],
              })
            }
          >
            Add reference
          </Button>
        </div>
        {isSme ? (
          <>
            <div className="mb-2 hidden gap-3 text-xs font-semibold uppercase tracking-wide text-ink-400 sm:grid sm:grid-cols-[repeat(4,1fr)_auto]">
              <span>Name</span>
              <span>Address</span>
              <span>Relation</span>
              <span>Contact no.</span>
              <span className="w-[72px]" aria-hidden />
            </div>
            {profile.references.map((ref, i) => (
              <div
                key={i}
                className="mb-3 grid gap-3 border-b border-line-soft pb-3 sm:grid-cols-[repeat(4,1fr)_auto]"
              >
                {(["name", "address", "relationship", "phone"] as const).map(
                  (f) => (
                    <Input
                      key={f}
                      value={ref[f] ?? ""}
                      onChange={(e) => {
                        const refs = [...profile.references];
                        refs[i] = { ...ref, [f]: e.target.value };
                        onChange({
                          ...profile,
                          references: refs as Reference[],
                        });
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
                      references: profile.references.filter(
                        (_, idx) => idx !== i,
                      ),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </>
        ) : (
          <>
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
                        onChange({
                          ...profile,
                          references: refs as Reference[],
                        });
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
                      references: profile.references.filter(
                        (_, idx) => idx !== i,
                      ),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </>
        )}
        {isIndividualSme ? (
          <div className="mt-4 border-t border-line-soft pt-4">
            <p className="mb-3 text-sm font-medium text-ink-600">
              Relatives living in province
            </p>
            <FieldRow>
              <Field
                id="relatives_name"
                label="Name"
                value={contact.relativesLivingInProvince ?? ""}
                onChange={(v) =>
                  setProfileData({ relativesLivingInProvince: v })
                }
              />
              <PhoneField
                id="relatives_contact"
                label="Contact number"
                value={contact.relativesLivingInProvinceContact ?? ""}
                onChange={(v) =>
                  setProfileData({ relativesLivingInProvinceContact: v })
                }
              />
            </FieldRow>
            <Field
              id="relatives_address"
              label="Address"
              value={contact.relativesLivingInProvinceAddress ?? ""}
              onChange={(v) =>
                setProfileData({ relativesLivingInProvinceAddress: v })
              }
            />
          </div>
        ) : null}
      </Card>
    </fieldset>
  );
}
