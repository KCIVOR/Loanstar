import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
const baseline = JSON.parse(fs.readFileSync(new URL("./fixtures/auth-handler-baseline.json", import.meta.url), "utf8")) as {
  baselineCommit: string;
  pages: Record<"login" | "register", string[]>;
};
const printer = ts.createPrinter({ removeComments: true });
function astFragments(source: string, names: string[], effect = false) {
  const file = ts.createSourceFile(
    "page.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const values: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      names.includes(node.name.text)
    )
      values.push(printer.printNode(ts.EmitHint.Unspecified, node, file));
    if (
      effect &&
      ts.isCallExpression(node) &&
      node.expression.getText(file) === "useEffect"
    )
      values.push(printer.printNode(ts.EmitHint.Unspecified, node, file));
    ts.forEachChild(node, visit);
  };
  visit(file);
  return values;
}
for (const [page, names] of [
  [
    "login",
    [
      "safeRedirectPath",
      "authErrorMessage",
      "resolveLandingPath",
      "signIn",
      "handleSubmit",
    ],
  ],
  ["register", ["handleSubmit"]],
] as const)
  test(`${page} retains original handler AST`, () => {
    const moved = fs.readFileSync(
      `src/components/website/${page === "login" ? "LoginForm" : "RegisterForm"}.tsx`,
      "utf8",
    );
    assert.deepEqual(
      astFragments(moved, [...names], page === "login"),
      baseline.pages[page],
    );
  });
test("preview never mounts effect-bearing auth containers", () => {
  const preview = fs.readFileSync(
    "src/components/website/AuthPreview.tsx",
    "utf8",
  );
  assert.match(preview, /LoginPresentation/);
  assert.match(preview, /RegisterPresentation/);
  assert.doesNotMatch(preview, /from ['"].*(LoginForm|RegisterForm|supabase)/);
  for (const name of ["LoginPresentation", "RegisterPresentation"]) {
    const source = fs.readFileSync(
      `src/components/website/${name}.tsx`,
      "utf8",
    );
    assert.match(source, /disabled=\{mode === "preview"\}/);
    assert.doesNotMatch(source, /useEffect|signInWithPassword|fetch\(/);
  }
});
