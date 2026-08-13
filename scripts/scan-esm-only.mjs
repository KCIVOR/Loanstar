import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

// Every package reachable from jsdom's own resolved dependency tree (npm ls --all
// under the jsdom subtree), flagging any with "type": "module" and no dual/cjs
// entry — the exact shape that breaks Turbopack's externalRequire at runtime.
const out = execSync("npm ls jsdom --all --json", { encoding: "utf8" });
const tree = JSON.parse(out);

const seen = new Set();
const esmOnly = [];

function walk(node, name) {
  if (!node || typeof node !== "object") return;
  const key = `${name}`;
  if (seen.has(key)) return;
  seen.add(key);

  const pkgPath = join("node_modules", name, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const isESM = pkg.type === "module";
    const hasCjsExport =
      pkg.main !== undefined ||
      (pkg.exports &&
        JSON.stringify(pkg.exports).includes('"require"'));
    if (isESM && !hasCjsExport) {
      esmOnly.push({ name, version: pkg.version });
    }
  }

  for (const [depName, depNode] of Object.entries(node.dependencies ?? {})) {
    walk(depNode, depName);
  }
}

walk(tree, "jsdom");

if (esmOnly.length === 0) {
  console.log("CLEAN: no ESM-only packages found in jsdom's dependency tree.");
} else {
  console.log("FOUND ESM-only packages:");
  for (const p of esmOnly) console.log(`  ${p.name}@${p.version}`);
  process.exitCode = 1;
}
