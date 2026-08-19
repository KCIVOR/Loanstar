import type { AnswerCard, TurnEvidence } from "./card";

/**
 * `content` is always the plain-text form and stays the source of truth for
 * titles and search. `card`/`evidence` are additive: messages written before
 * structured answers existed have neither and still render as markdown.
 */
export type StoredChatMessage = {
  role: "user" | "assistant";
  content: string;
  card?: AnswerCard;
  evidence?: TurnEvidence;
};

export const MAX_STORED_MESSAGES = 100;
export const TITLE_MAX = 60;

export function titleFromQuestion(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "New chat";
  if (compact.length <= TITLE_MAX) return compact;
  return `${compact.slice(0, TITLE_MAX - 1)}…`;
}

/** Structured halves travel together — a card without its evidence would render
 *  keys that resolve to nothing. */
function parseCard(
  item: Record<string, unknown>,
): Pick<StoredChatMessage, "card" | "evidence"> {
  const card = item.card;
  const evidence = item.evidence;
  if (!card || typeof card !== "object" || Array.isArray(card)) return {};
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return {};
  if (!Array.isArray((card as { blocks?: unknown }).blocks)) return {};
  return { card: card as AnswerCard, evidence: evidence as TurnEvidence };
}

export function parseStoredMessages(value: unknown): StoredChatMessage[] {
  if (!Array.isArray(value)) return [];
  const out: StoredChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const role = row.role;
    const content = row.content;
    if (
      (role === "user" || role === "assistant") &&
      typeof content === "string" &&
      content.trim()
    ) {
      out.push({ role, content: content.slice(0, 8000), ...parseCard(row) });
    }
  }
  return out;
}

export function appendThreadMessages(
  existing: StoredChatMessage[],
  added: StoredChatMessage[],
): StoredChatMessage[] {
  return [...existing, ...added].slice(-MAX_STORED_MESSAGES);
}
