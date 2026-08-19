import type { TurnEvidence } from "./evidence";
import {
  DEFAULT_TABLE_ROWS,
  isAnswerBlockKind,
  MAX_BLOCKS,
  MAX_BULLETS,
  MAX_KPIS,
  MAX_TABLE_ROWS,
  type AnswerBlock,
  type AnswerCard,
} from "./schema";

export type ValidatedCard = {
  card: AnswerCard | null;
  /** Blocks thrown away for citing something that was never looked up. */
  dropped: number;
};

function cleanText(value: unknown, max = 400): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanList(value: unknown, max: number, itemMax = 300): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = cleanText(item, itemMax);
    if (text) out.push(text);
    if (out.length === max) break;
  }
  return out;
}

/**
 * Narrows one raw block into a grounded one, or returns null to drop it.
 *
 * Every key is checked against the evidence actually gathered this turn. A
 * block naming `money.collected` when nothing looked up collections is a
 * hallucinated citation, and rendering it would either crash the table or
 * invent an empty one — so it goes.
 */
function narrowBlock(raw: unknown, evidence: TurnEvidence): AnswerBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const block = raw as Record<string, unknown>;
  const kind = block.kind;
  if (!isAnswerBlockKind(kind)) return null;

  if (kind === "kpi") {
    const metricIds = cleanList(block.metricIds, MAX_KPIS, 80).filter(
      (id) => evidence.metrics[id] !== undefined,
    );
    return metricIds.length > 0 ? { kind, metricIds } : null;
  }

  if (kind === "chart") {
    const trendId = cleanText(block.trendId, 80);
    const trend = evidence.trends[trendId];
    if (!trend) return null;
    // A flat line of nulls is worse than no chart at all.
    if (!trend.points.some((point) => point.value !== null)) return null;
    return { kind, trendId };
  }

  if (kind === "table") {
    const tableId = cleanText(block.tableId, 80);
    const table = evidence.tables[tableId];
    if (!table || table.rows.length === 0) return null;
    const asked = typeof block.limit === "number" ? Math.floor(block.limit) : 0;
    const limit = Math.min(
      MAX_TABLE_ROWS,
      table.rows.length,
      asked > 0 ? asked : DEFAULT_TABLE_ROWS,
    );
    return { kind, tableId, limit };
  }

  if (kind === "bullets") {
    const items = cleanList(block.items, MAX_BULLETS);
    return items.length > 0 ? { kind, items } : null;
  }

  const text = cleanText(block.text);
  return text ? { kind: "note", text } : null;
}

/** Keeps the first of each repeated visual so one answer cannot stack two
 *  copies of the same table or chart. */
function dedupe(blocks: AnswerBlock[]): AnswerBlock[] {
  const seen = new Set<string>();
  const out: AnswerBlock[] = [];
  for (const block of blocks) {
    const key =
      block.kind === "chart"
        ? `chart:${block.trendId}`
        : block.kind === "table"
          ? `table:${block.tableId}`
          : block.kind === "kpi"
            ? "kpi"
            : `${block.kind}:${out.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(block);
  }
  return out;
}

/**
 * Turns raw model JSON into a card safe to render, or null when there is
 * nothing grounded left to show — in which case the caller falls back to the
 * plain-text reply rather than rendering an empty shell.
 */
export function validateAnswerCard(raw: unknown, evidence: TurnEvidence): ValidatedCard {
  if (!raw || typeof raw !== "object") return { card: null, dropped: 0 };
  const parsed = raw as Record<string, unknown>;

  const headline = cleanText(parsed.headline, 300);
  const bottomLine = cleanText(parsed.bottomLine, 300);
  const rawBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];

  const narrowed: AnswerBlock[] = [];
  let dropped = 0;
  for (const block of rawBlocks) {
    const kept = narrowBlock(block, evidence);
    if (kept) narrowed.push(kept);
    else dropped += 1;
  }

  const blocks = dedupe(narrowed).slice(0, MAX_BLOCKS);
  dropped += narrowed.length - blocks.length;

  // A headline with no substance behind it is just the plain reply in disguise.
  if (!headline || blocks.length === 0) return { card: null, dropped };

  return { card: { headline, blocks, bottomLine }, dropped };
}

/**
 * Plain-text version of a card, stored as the message `content`. It keeps
 * search, thread titles and any future export working, and gives older clients
 * something to show.
 */
export function cardToText(card: AnswerCard, evidence: TurnEvidence): string {
  const lines: string[] = [card.headline];
  for (const block of card.blocks) {
    if (block.kind === "bullets") {
      for (const item of block.items) lines.push(`- ${item}`);
    }
    if (block.kind === "note") lines.push(block.text);
    if (block.kind === "table") {
      const table = evidence.tables[block.tableId];
      if (table) lines.push(`- ${table.label}: ${table.total} row(s)`);
    }
  }
  if (card.bottomLine) lines.push(card.bottomLine);
  return lines.join("\n");
}
