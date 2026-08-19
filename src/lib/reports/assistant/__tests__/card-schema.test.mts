import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ANSWER_BLOCK_KINDS,
  ANSWER_CARD_JSON_SCHEMA,
  isAnswerBlockKind,
  MAX_BLOCKS,
} from "../card/schema";

type JsonSchemaNode = {
  type?: string;
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  required?: readonly string[];
  additionalProperties?: boolean;
  enum?: readonly string[];
  description?: string;
};

function walk(node: JsonSchemaNode, visit: (n: JsonSchemaNode, path: string) => void, path = "$") {
  visit(node, path);
  if (node.properties) {
    for (const [key, child] of Object.entries(node.properties)) {
      walk(child, visit, `${path}.${key}`);
    }
  }
  if (node.items) walk(node.items, visit, `${path}[]`);
}

const root = ANSWER_CARD_JSON_SCHEMA.schema as unknown as JsonSchemaNode;

describe("ANSWER_CARD_JSON_SCHEMA", () => {
  it("is strict, which OpenAI needs to guarantee the shape", () => {
    assert.equal(ANSWER_CARD_JSON_SCHEMA.strict, true);
  });

  it("closes every object and requires every property", () => {
    walk(root, (node, path) => {
      if (node.type !== "object") return;
      assert.equal(node.additionalProperties, false, `${path} must be closed`);
      const declared = Object.keys(node.properties ?? {}).sort();
      assert.deepEqual(
        [...(node.required ?? [])].sort(),
        declared,
        `${path} must require every declared property`,
      );
    });
  });

  it("gives the model nowhere to put a figure except a row limit", () => {
    // The whole anti-hallucination guarantee rests on this: pesos, percentages
    // and counts come from evidence, so the shape must not accept one.
    const numeric: string[] = [];
    walk(root, (node, path) => {
      if (node.type === "number" || node.type === "integer") numeric.push(path);
    });
    assert.deepEqual(numeric, ["$.blocks[].limit"]);
  });

  it("constrains block kinds to the ones the renderer implements", () => {
    const kind = root.properties?.blocks?.items?.properties?.kind;
    assert.deepEqual(kind?.enum, [...ANSWER_BLOCK_KINDS]);
  });

  it("keeps the block cap in the description so the model sees it", () => {
    assert.match(String(root.properties?.blocks?.description), new RegExp(String(MAX_BLOCKS)));
  });
});

describe("isAnswerBlockKind", () => {
  it("accepts known kinds and rejects anything else", () => {
    for (const kind of ANSWER_BLOCK_KINDS) assert.equal(isAnswerBlockKind(kind), true);
    assert.equal(isAnswerBlockKind("paragraph"), false);
    assert.equal(isAnswerBlockKind(null), false);
    assert.equal(isAnswerBlockKind(3), false);
  });
});
