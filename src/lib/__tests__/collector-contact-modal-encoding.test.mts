import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { it } from "node:test";

it("keeps the collector contact modal valid UTF-8 source", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "collector", "ContactLogModal.tsx"),
    "utf8",
  );

  assert.ok(!source.includes("\uFFFD"), "source must not contain replacement characters");
});
