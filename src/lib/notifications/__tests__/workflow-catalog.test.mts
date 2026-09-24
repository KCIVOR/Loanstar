import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  formatApplicationLabel,
  WORKFLOW_EVENTS,
  type WorkflowEventKey,
} from "../workflow-catalog";
import { uniqueRecipientsExcluding } from "../workflow-recipients";

const KNOWN_ROLES = new Set([
  "csa",
  "cig",
  "committee",
  "lra",
  "ar",
  "collector",
  "remedial",
  "collection_head",
]);

const srcRoot = fileURLToPath(new URL("../../../", import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const sources = walk(srcRoot)
  .filter((f) => !f.endsWith("workflow-catalog.ts"))
  .map((f) => ({ path: f, text: readFileSync(f, "utf8") }));

const keys = Object.keys(WORKFLOW_EVENTS) as WorkflowEventKey[];

test("every catalog entry is well formed", () => {
  for (const key of keys) {
    const def = WORKFLOW_EVENTS[key];
    assert.ok(def.title.length > 3, `${key} title`);
    const body = def.body("AN300459 · Maria Ramos", "extra");
    assert.ok(body.length > 10, `${key} body`);
    const link = def.link("app-1");
    assert.ok(link.startsWith("/"), `${key} link`);
    if ("roles" in def.audience) {
      assert.ok(def.audience.roles.length > 0, `${key} roles`);
      for (const role of def.audience.roles) {
        assert.ok(KNOWN_ROLES.has(role), `${key} unknown role ${role}`);
      }
    }
  }
});

test("staff-facing bodies name the application", () => {
  for (const key of keys) {
    const def = WORKFLOW_EVENTS[key];
    if ("borrower" in def.audience) continue;
    assert.match(def.body("AN300459 · Maria Ramos"), /AN300459/, key);
  }
});

test("every catalog event is triggered from application code", () => {
  for (const key of keys) {
    const used = sources.some((s) => s.text.includes(`"${key}"`));
    assert.ok(used, `${key} is never dispatched`);
  }
});

test("every dispatched key exists in the catalog", () => {
  const known = new Set<string>(keys);
  for (const s of sources) {
    for (const m of s.text.matchAll(/notifyWorkflowEvent\(\s*"([a-z_]+)"/g)) {
      assert.ok(known.has(m[1]), `${s.path} dispatches unknown key ${m[1]}`);
    }
  }
});

test("label formatting degrades gracefully", () => {
  assert.equal(formatApplicationLabel("AN1", "Ana Cruz"), "AN1 · Ana Cruz");
  assert.equal(formatApplicationLabel("AN1", ""), "AN1");
  assert.equal(formatApplicationLabel(null, null), "An application");
});

test("recipients are deduped and never include the actor", () => {
  assert.deepEqual(
    uniqueRecipientsExcluding(["a", "b", "a", null, undefined, "csa"], "csa"),
    ["a", "b"],
  );
});
