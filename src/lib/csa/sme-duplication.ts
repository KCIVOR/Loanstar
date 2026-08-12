import type { SupabaseClient } from "@supabase/supabase-js";

export type SmeDuplicationMatch = {
  source: "borrower" | "lead";
  id: string;
  companyName: string | null;
  ownerName: string | null;
  applicationId?: string | null;
  applicationNo?: string | null;
  leadId?: string | null;
};

/** Normalize for comparison — trim, collapse whitespace, case-fold. */
export function normalizeCompanyName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizePersonName(
  first?: string | null,
  last?: string | null,
): string {
  return normalizeCompanyName(`${first ?? ""} ${last ?? ""}`);
}

/**
 * Find possible duplicate SME files by company name and/or owner name.
 * Same pattern as NCL: staff review matches, then record pass/fail manually.
 * Does not auto-fail — returns candidates only.
 */
export async function findSmeDuplicationMatches(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<{
  companyName: string | null;
  ownerName: string | null;
  matches: SmeDuplicationMatch[];
}> {
  const { data: app, error: appError } = await supabase
    .from("loan_applications")
    .select(
      `
      id,
      application_no,
      borrower_id,
      borrowers (
        id,
        first_name,
        last_name,
        business_info
      )
    `,
    )
    .eq("id", applicationId)
    .single();

  if (appError || !app) {
    throw new Error(appError?.message ?? "Application not found");
  }

  const borrowerRaw = app.borrowers;
  const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;
  const businessInfo = (borrower?.business_info ?? {}) as {
    companyName?: string;
  };
  const companyName = businessInfo.companyName?.trim() || null;
  const ownerName =
    [borrower?.first_name, borrower?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || null;

  const companyKey = normalizeCompanyName(companyName);
  const ownerKey = normalizePersonName(
    borrower?.first_name as string | null,
    borrower?.last_name as string | null,
  );

  const matches: SmeDuplicationMatch[] = [];
  const seen = new Set<string>();

  function push(match: SmeDuplicationMatch) {
    const key = `${match.source}:${match.id}:${match.applicationId ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push(match);
  }

  if (companyKey) {
    const { data: borrowers } = await supabase
      .from("borrowers")
      .select(
        `
        id,
        first_name,
        last_name,
        business_info,
        loan_applications ( id, application_no, segment )
      `,
      )
      .neq("id", app.borrower_id as string);

    for (const row of borrowers ?? []) {
      const info = (row.business_info ?? {}) as { companyName?: string };
      if (normalizeCompanyName(info.companyName) !== companyKey) continue;
      const apps = Array.isArray(row.loan_applications)
        ? row.loan_applications
        : row.loan_applications
          ? [row.loan_applications]
          : [];
      if (apps.length === 0) {
        push({
          source: "borrower",
          id: row.id as string,
          companyName: info.companyName ?? null,
          ownerName:
            [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
        });
        continue;
      }
      for (const la of apps) {
        if ((la as { id: string }).id === applicationId) continue;
        push({
          source: "borrower",
          id: row.id as string,
          companyName: info.companyName ?? null,
          ownerName:
            [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
          applicationId: (la as { id: string }).id,
          applicationNo:
            ((la as { application_no?: string }).application_no as string) ??
            null,
        });
      }
    }

    const { data: leads } = await supabase
      .from("leads")
      .select("id, business_name, borrower_name, status")
      .not("business_name", "is", null);

    for (const lead of leads ?? []) {
      if (normalizeCompanyName(lead.business_name as string) !== companyKey) {
        continue;
      }
      push({
        source: "lead",
        id: lead.id as string,
        companyName: (lead.business_name as string) ?? null,
        ownerName: (lead.borrower_name as string) ?? null,
        leadId: lead.id as string,
      });
    }
  }

  // Owner-name matches (same person, possibly different company).
  if (ownerKey.length >= 3) {
    const { data: sameOwners } = await supabase
      .from("borrowers")
      .select(
        `
        id,
        first_name,
        last_name,
        business_info,
        loan_applications ( id, application_no )
      `,
      )
      .neq("id", app.borrower_id as string)
      .ilike("first_name", (borrower?.first_name as string) ?? "")
      .ilike("last_name", (borrower?.last_name as string) ?? "");

    for (const row of sameOwners ?? []) {
      if (
        normalizePersonName(
          row.first_name as string,
          row.last_name as string,
        ) !== ownerKey
      ) {
        continue;
      }
      const info = (row.business_info ?? {}) as { companyName?: string };
      const apps = Array.isArray(row.loan_applications)
        ? row.loan_applications
        : row.loan_applications
          ? [row.loan_applications]
          : [];
      for (const la of apps.length ? apps : [null]) {
        if (la && (la as { id: string }).id === applicationId) continue;
        push({
          source: "borrower",
          id: row.id as string,
          companyName: info.companyName ?? null,
          ownerName:
            [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
          applicationId: la ? (la as { id: string }).id : null,
          applicationNo: la
            ? ((la as { application_no?: string }).application_no as string) ??
              null
            : null,
        });
      }
    }
  }

  return { companyName, ownerName, matches };
}

/** CSA screening slug for a segment (NCL vs SME duplication). */
export function csaScreeningCheckSlug(
  segment: string | null | undefined,
): "ncl" | "sme_duplication" {
  return segment === "sme" ? "sme_duplication" : "ncl";
}
