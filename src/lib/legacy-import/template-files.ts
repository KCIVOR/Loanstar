export type AccountTemplateSegment = "seafarer" | "sme" | "individual";

const fileNames: Record<AccountTemplateSegment, string> = {
  seafarer: "legacy-masterlist-import-seafarer.xlsx",
  sme: "legacy-masterlist-import-sme.xlsx",
  individual: "legacy-masterlist-import-individual.xlsx",
};

export function templateDownloadPath(segment: AccountTemplateSegment) {
  return `/legacy-import-templates/${fileNames[segment]}`;
}

export const templateSegments: AccountTemplateSegment[] = ["seafarer", "sme", "individual"];

export function templateFileName(segment: AccountTemplateSegment) {
  return fileNames[segment];
}
