import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_PAGE_SIZE = 1000;

export type PagedQuery = {
  table: string;
  columns: string;
  /** Stable sort column. Required — see the note below. */
  order: string;
  /** Optional narrowing applied before paging, e.g. `(q) => q.is("resolved_at", null)` */
  filter?: (query: PostgrestFilter) => PostgrestFilter;
};

/** The subset of the PostgREST builder we pass through, kept loose because
 *  supabase-js does not export a usable public type for a partially built
 *  filter chain. */
type PostgrestFilter = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

/**
 * PostgREST caps a response at 1,000 rows by default, and a plain `.select()`
 * hits that ceiling silently — returning a confident partial answer, which is
 * the worst way for a reporting query to fail.
 *
 * The stable `order` column is not optional. Without a deterministic sort,
 * Postgres may return rows in a different order for each page, which both
 * duplicates and drops rows.
 */
export async function fetchAllRows<T>(
  supabase: SupabaseClient,
  { table, columns, order, filter }: PagedQuery,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    let query = supabase.from(table).select(columns) as PostgrestFilter;
    if (filter) query = filter(query);
    const { data, error } = await query
      .order(order, { ascending: true })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < SUPABASE_PAGE_SIZE) return out;
  }
}
