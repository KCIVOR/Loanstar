type ChartRow = Record<string, string | number | null>;

export function rankedBarCellKey(row: ChartRow, yKey: string, index: number, rowIdKey?: string): string {
  const rowId = rowIdKey ? row[rowIdKey] : null;
  return rowId === null || rowId === undefined
    ? `${String(row[yKey])}:${index}`
    : String(rowId);
}
