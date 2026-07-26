import type { SupabaseClient } from "@supabase/supabase-js";

import { mapBorrowerRow, type BorrowerRow } from "@/lib/borrowers/types";
import { getActiveComputation } from "@/lib/csa/computation";
import { renderAndStore, type RenderedDocumentResult } from "@/lib/documents/render-store";

import { COMPANY_NAME, formatDate, formatMoney, joinAddress } from "./shared";

/**
 * Generate the printable Loan Application Form for an application and store it
 * as a rendered_documents row (module = intake). The "loan requested" figures
 * come from the active computation when present (blank otherwise — the form is
 * still printable before terms are computed). replaceUnsigned keeps one live
 * printout per application.
 *
 * NOTE: borrower self-service CAPTURE is a separate workstream; this only makes
 * a printable/officialized version of the data already on file.
 */
export async function generateApplicationForm(
  supabase: SupabaseClient,
  params: { applicationId: string; actorId: string },
): Promise<RenderedDocumentResult> {
  const { applicationId, actorId } = params;

  const { data: app, error } = await supabase
    .from("loan_applications")
    .select("application_no, created_at, borrowers (*)")
    .eq("id", applicationId)
    .single();
  if (error || !app) throw new Error("Application not found");

  const borrowerRaw = app.borrowers;
  const borrower = mapBorrowerRow(
    (Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw) as BorrowerRow,
  );

  const computation = await getActiveComputation(supabase, applicationId);

  const money = (value: number | null | undefined) =>
    value == null ? "" : formatMoney(value);

  const context = {
    companyName: COMPANY_NAME,
    applicationNo: (app.application_no as string) ?? "",
    applicationDate: formatDate((app.created_at as string) ?? null),
    borrowerName: [borrower.firstName, borrower.lastName].filter(Boolean).join(" "),
    coBorrowerName: "",
    borrowerNo: borrower.borrowerNo,
    address: joinAddress(borrower.presentAddress),
    manningAgency: borrower.manningAgency?.name ?? "",
    principalShip: borrower.picWork?.vessel ?? "",
    loanType: computation?.loanTypeName ?? "",
    loanAmount: computation ? formatMoney(computation.principal) : "",
    terms: computation ? String(computation.terms) : "",
    interestRate: computation ? `${(computation.interestRate * 100).toFixed(2)}%` : "",

    // Personal information
    firstName: borrower.firstName ?? "",
    middleName: borrower.middleName ?? "",
    lastName: borrower.lastName ?? "",
    presentAddress: joinAddress(borrower.presentAddress),
    presentLengthOfStay: borrower.presentAddress?.lengthOfStay ?? "",
    presentOwnership: borrower.presentAddress?.ownership ?? "",
    presentMortgage: borrower.presentAddress?.mortgage ?? "",
    permanentAddress: joinAddress(borrower.permanentAddress),
    permanentLengthOfStay: borrower.permanentAddress?.lengthOfStay ?? "",
    permanentOwnership: borrower.permanentAddress?.ownership ?? "",
    permanentMortgage: borrower.permanentAddress?.mortgage ?? "",
    dateOfBirth: formatDate(borrower.dateOfBirth),
    civilStatus: borrower.civilStatus ?? "",
    placeOfBirth: borrower.placeOfBirth ?? "",
    mobileTelNumbers: [borrower.mobilePhone, borrower.landline].filter(Boolean).join(" / "),
    email: borrower.email ?? "",
    viber: (borrower.profileData?.viber as string) ?? "",
    skype: (borrower.profileData?.skype as string) ?? "",
    othersContact: (borrower.profileData?.othersContact as string) ?? "",
    roaming: (borrower.profileData?.roaming as string) ?? "",
    facebook: (borrower.profileData?.facebook as string) ?? "",
    education: (borrower.profileData?.education as string) ?? "",

    // Manning agency (detail)
    rank: borrower.picWork?.rank ?? "",
    crewingManager: borrower.manningAgency?.crewingManager ?? "",
    crewingManagerContact: borrower.manningAgency?.crewingManagerContact ?? "",
    manningYearsOfStay: borrower.manningAgency?.yearsOfStay ?? "",
    departureDate: borrower.manningAgency?.departureDate ?? "",
    prevManningAgency: borrower.manningAgency?.previousAgency ?? "",
    previousSignOffDate: borrower.manningAgency?.previousSignOffDate ?? "",
    reasonForTransfer: borrower.manningAgency?.reasonForTransfer ?? "",
    contractDuration: borrower.picWork?.contractDuration ?? "",

    // Financial
    monthlyIncomeUsd: money(borrower.financial?.monthlyIncomeUsd),
    monthlyIncomePhp: money(borrower.financial?.monthlyIncomePhp),
    householdExpensesPhp: money(borrower.financial?.householdExpensesPhp),
    otherLoansPhp: money(borrower.financial?.otherLoansPhp),

    // Allottee / person in charge
    allotteeName: borrower.allottee?.name ?? "",
    allotteeRelation: borrower.allottee?.relationship ?? "",
    allotteeEmail: borrower.allottee?.email ?? "",
    allotteeAddress: joinAddress(borrower.allottee?.address),
    allotteeAllotmentPercent: borrower.allottee?.allotmentPercent ?? "",
    allotteeContact: borrower.allottee?.phone ?? "",
    allotteeFacebook: borrower.allottee?.facebook ?? "",
    allotteeCompanyName: borrower.allottee?.companyName ?? "",
    allotteeCompanyAddress: borrower.allottee?.companyAddress ?? "",
    allotteeYearsStayed: borrower.allottee?.yearsStayed ?? "",
    allotteeCompanyPhone: borrower.allottee?.companyPhone ?? "",

    // Repeating tables
    dependents: (borrower.dependents ?? []).map((d) => ({
      name: d.name ?? "",
      age: d.age ?? "",
      contactNo: d.contactNo ?? "",
      occupation: d.occupation ?? "",
    })),
    references: (borrower.references ?? []).map((r) => ({
      name: r.name ?? "",
      relationship: r.relationship ?? "",
      phone: r.phone ?? "",
      occupation: r.occupation ?? "",
    })),
  };

  return renderAndStore(supabase, {
    slug: "application_form",
    module: "intake",
    applicationId,
    context,
    actorId,
    replaceUnsigned: true,
  });
}
