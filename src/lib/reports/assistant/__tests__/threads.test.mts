import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_STORED_MESSAGES,
  appendThreadMessages,
  parseStoredMessages,
  titleFromQuestion,
} from "../threads";

describe("titleFromQuestion", () => {
  it("uses the trimmed question as the title", () => {
    assert.equal(titleFromQuestion("  What is PAR > 30?  "), "What is PAR > 30?");
  });

  it("truncates long questions", () => {
    const title = titleFromQuestion("a".repeat(80));
    assert.equal(title.length, 60);
    assert.equal(title.endsWith("…"), true);
  });

  it("falls back for empty text", () => {
    assert.equal(titleFromQuestion("   "), "New chat");
  });
});

describe("parseStoredMessages", () => {
  it("keeps only user and assistant strings", () => {
    const parsed = parseStoredMessages([
      { role: "user", content: "Hi" },
      { role: "system", content: "nope" },
      { role: "assistant", content: "Hello" },
      { role: "user", content: "   " },
      null,
    ]);
    assert.deepEqual(parsed, [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
    ]);
  });

  it("returns empty for non-arrays", () => {
    assert.deepEqual(parseStoredMessages(null), []);
    assert.deepEqual(parseStoredMessages({}), []);
  });
});

describe("appendThreadMessages", () => {
  it("caps stored history at MAX_STORED_MESSAGES", () => {
    const existing = Array.from({ length: MAX_STORED_MESSAGES }, (_, i) => ({
      role: "user" as const,
      content: `m${i}`,
    }));
    const next = appendThreadMessages(existing, [
      { role: "user", content: "new" },
      { role: "assistant", content: "ok" },
    ]);
    assert.equal(next.length, MAX_STORED_MESSAGES);
    assert.equal(next.at(-1)?.content, "ok");
    assert.equal(next[0]?.content, "m2");
  });
});
