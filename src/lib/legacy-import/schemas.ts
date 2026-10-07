import { z } from "zod";

export const MAX_ROWS_PER_REQUEST = 2000;

export const segmentSchema = z.enum(["seafarer", "sme", "individual"]);

export const columnMappingSchema = z.object({
  index: z.number().int().min(0).max(1000),
  header: z.string().max(300),
  target: z.string().max(100).nullable(),
});

export const mappingSchema = z.array(columnMappingSchema).max(1000);

const cellSchema = z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]);

export const validateRequestSchema = z.object({
  segment: segmentSchema,
  mapping: mappingSchema,
  rows: z
    .array(z.object({ rowNumber: z.number().int().min(1), cells: z.array(cellSchema).max(1000) }))
    .max(MAX_ROWS_PER_REQUEST),
});

export const presetSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  segment: segmentSchema,
  header_row: z.number().int().min(1).max(1000),
  mapping: mappingSchema,
});

export const activeImportRequestSchema = validateRequestSchema.extend({
  file_name: z.string().trim().min(1).max(300),
  installments: z.array(z.array(cellSchema).max(30)).max(25001),
}).refine(value => value.rows.length > 0 && value.rows.length <= 25, "Import 1 to 25 accounts per request");

export const runSchema = z.object({
  file_name: z.string().trim().min(1).max(300),
  segment: segmentSchema,
  mapping_id: z.string().uuid().nullable(),
  mapping: mappingSchema,
  total_rows: z.number().int().min(0),
  valid_rows: z.number().int().min(0),
  warning_rows: z.number().int().min(0),
  error_rows: z.number().int().min(0),
});
