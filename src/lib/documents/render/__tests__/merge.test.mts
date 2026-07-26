import test from "node:test";
import assert from "node:assert/strict";

import { mergeTemplate } from "../merge";

test("substitutes scalar tokens, including dotted paths", () => {
  const out = mergeTemplate("<p>Hi {{ borrower.firstName }} {{last}}</p>", {
    borrower: { firstName: "Jonathan" },
    last: "Del Poso",
  });
  assert.equal(out, "<p>Hi Jonathan Del Poso</p>");
});

test("HTML-escapes substituted values (no markup injection)", () => {
  const out = mergeTemplate("<p>{{name}}</p>", {
    name: "<script>alert(1)</script>",
  });
  assert.equal(out, "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
});

test("unknown tokens resolve to empty string, never leak", () => {
  const out = mergeTemplate("<p>[{{missing}}]</p>", {});
  assert.equal(out, "<p>[]</p>");
});

test("data-repeat clones a row per array item with item scope", () => {
  const out = mergeTemplate(
    "<table><tbody><tr data-repeat=\"rows\"><td>{{checkNumber}}</td><td>{{amount}}</td></tr></tbody></table>",
    {
      rows: [
        { checkNumber: "102901", amount: "17,428.20" },
        { checkNumber: "102902", amount: "17,428.20" },
      ],
    },
  );
  assert.ok(out.includes("<td>102901</td>"));
  assert.ok(out.includes("<td>102902</td>"));
  assert.ok(!out.includes("data-repeat"));
  assert.equal((out.match(/<tr>/g) ?? []).length, 2);
});

test("data-repeat over an empty/missing collection removes the row", () => {
  const out = mergeTemplate(
    '<table><tbody><tr data-repeat="rows"><td>{{x}}</td></tr></tbody></table>',
    { rows: [] },
  );
  assert.ok(!out.includes("<tr>"));
  assert.ok(!out.includes("data-repeat"));
});

test("repeat rows can also read root-scope fields", () => {
  const out = mergeTemplate(
    '<div data-repeat="items"><span>{{bank}} {{label}}</span></div>',
    { bank: "CHINABANK", items: [{ label: "A" }, { label: "B" }] },
  );
  assert.ok(out.includes("<span>CHINABANK A</span>"));
  assert.ok(out.includes("<span>CHINABANK B</span>"));
});

test("data-if removes element when value is falsy/empty", () => {
  const shown = mergeTemplate('<p data-if="isCheck">check</p>', { isCheck: true });
  const hidden = mergeTemplate('<p data-if="isCheck">check</p>', { isCheck: false });
  assert.equal(shown, "<p>check</p>");
  assert.equal(hidden, "");
});

test("data-unless removes element when value is truthy", () => {
  const shown = mergeTemplate('<p data-unless="isCheck">cash</p>', { isCheck: false });
  const hidden = mergeTemplate('<p data-unless="isCheck">cash</p>', { isCheck: true });
  assert.equal(shown, "<p>cash</p>");
  assert.equal(hidden, "");
});

test("resolves tokens inside attributes", () => {
  const out = mergeTemplate('<img src="{{logoUrl}}" alt="logo">', {
    logoUrl: "data:image/png;base64,AAAA",
  });
  assert.ok(out.includes('src="data:image/png;base64,AAAA"'));
});
