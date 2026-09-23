import rawEntries from "../../../../docs/document-fidelity/source-registry.json";

export type SourceVariantDimension = boolean | number | string;

export type SourceVariant = {
  id: string;
  family: string;
  requiredVariantDimensions: Readonly<Record<string, SourceVariantDimension>>;
  templateSlug: string;
  sourcePath: string;
  pageTarget?: number;
};

export type SourceVariantLookup = {
  family: string;
  dimensions: Readonly<Record<string, SourceVariantDimension>>;
};

function assertSafeSourcePath(sourcePath: string): void {
  if (/(?:^|[/\\])Backup(?:[/\\]|$)/i.test(sourcePath)) {
    throw new Error(`Source registry entry must not select a Backup path: ${sourcePath}`);
  }
}

function normalizeDimensions(
  dimensions: object,
): Record<string, SourceVariantDimension> {
  const normalized: Record<string, SourceVariantDimension> = {};

  for (const [key, value] of Object.entries(dimensions)) {
    if (typeof value !== "boolean" && typeof value !== "number" && typeof value !== "string") {
      throw new Error(`Unsupported source variant dimension: ${key}`);
    }

    normalized[key] = value;
  }

  return Object.freeze(normalized);
}

const sourceVariants: readonly SourceVariant[] = Object.freeze(rawEntries.map((entry): SourceVariant => {
  assertSafeSourcePath(entry.sourcePath);

  const sourceVariant: SourceVariant = {
    id: entry.id,
    family: entry.family,
    requiredVariantDimensions: normalizeDimensions(entry.requiredVariantDimensions),
    templateSlug: entry.templateSlug,
    sourcePath: entry.sourcePath,
  };

  if ("pageTarget" in entry) {
    sourceVariant.pageTarget = entry.pageTarget;
  }

  return Object.freeze(sourceVariant);
}));

function dimensionsMatchExactly(
  required: Readonly<Record<string, SourceVariantDimension>>,
  actual: Readonly<Record<string, SourceVariantDimension>>,
): boolean {
  const requiredKeys = Object.keys(required);
  const actualKeys = Object.keys(actual);

  return requiredKeys.length === actualKeys.length
    && requiredKeys.every((key) => actual[key] === required[key]);
}

export function listSourceVariants(): readonly SourceVariant[] {
  return sourceVariants;
}

export function findSourceVariant(lookup: SourceVariantLookup): SourceVariant | null {
  return sourceVariants.find(
    (entry) => entry.family === lookup.family
      && dimensionsMatchExactly(entry.requiredVariantDimensions, lookup.dimensions),
  ) ?? null;
}
