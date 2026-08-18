import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "..");

function source(...parts: string[]) {
  return readFileSync(join(src, ...parts), "utf8");
}

describe("payment uploader attribution", () => {
  it("shows the actual recorder on internal payment histories", () => {
    const collector = source("app", "collector", "history", "page.tsx");
    const remedialApi = source(
      "app",
      "api",
      "remedial",
      "accounts",
      "[id]",
      "route.ts",
    );
    const remedial = source(
      "app",
      "remedial",
      "accounts",
      "[id]",
      "page.tsx",
    );

    assert.match(collector, /uploadedByName/);
    assert.match(collector, /Recorded by \{pay\.uploadedByName\}/);
    assert.match(remedialApi, /uploadedByName/);
    assert.match(remedial, /Recorded by \{pay\.uploadedByName\}/);
  });

  it("shows the actual recorder on the AR masterlist payment history", () => {
    const arApi = source("app", "api", "ar", "masterlist", "[id]", "route.ts");
    const arPage = source("app", "ar", "masterlist", "[id]", "page.tsx");

    assert.match(arApi, /uploadedByName/);
    assert.match(arPage, /Recorded by \{payment\.uploadedByName\}/);
  });

  it("shows generic staff attribution without exposing names to borrowers", () => {
    const borrowerApi = source(
      "app",
      "api",
      "borrower",
      "applications",
      "[id]",
      "loan",
      "route.ts",
    );
    const borrowerPanel = source(
      "components",
      "borrower",
      "LoanActivePanel.tsx",
    );

    assert.match(borrowerApi, /uploadedByStaff/);
    assert.doesNotMatch(borrowerApi, /uploadedByName/);
    assert.match(borrowerPanel, /p\.uploadedByStaff/);
    assert.match(borrowerPanel, /Recorded by Loanstar staff/);
  });
});
