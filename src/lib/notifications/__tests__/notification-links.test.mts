import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { getRequiredPageModules } from "../../permissions/navigation";

const src = fileURLToPath(new URL("../../../", import.meta.url));
const app = join(src, "app");

/** Pull `link:` string / template literals out of a source file. */
function linksIn(text: string): string[] {
  const out: string[] = [];
  const re = /link:\s*(?:\([^)]*\)\s*=>\s*)?(["`])(\/[^"`]*)\1/g;
  for (const m of text.matchAll(re)) out.push(m[2]);
  return out;
}

/** True when some page.tsx under src/app matches the path ("${…}" = any dynamic segment). */
function routeExists(path: string): boolean {
  const segs = path.split("?")[0].split("/").filter(Boolean);
  const walk = (dir: string, i: number): boolean => {
    if (i === segs.length) return existsSync(join(dir, "page.tsx"));
    const seg = segs[i];
    const dynamic = seg.includes("${");
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (!statSync(full).isDirectory()) continue;
      if (name.startsWith("(") && walk(full, i)) return true; // route groups
      const isParam = name.startsWith("[") && name.endsWith("]");
      if ((dynamic ? isParam : name === seg || isParam) && walk(full, i + 1)) return true;
    }
    return false;
  };
  return walk(app, 0);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === "__tests__" || name === "node_modules") return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

const files = [...sourceFiles(join(src, "app", "api")), ...sourceFiles(join(src, "lib"))];
const found = files.flatMap((f) =>
  linksIn(readFileSync(f, "utf8")).map((link) => ({ file: f.slice(src.length), link })),
);

test("finds the notification links (sanity)", () => {
  assert.ok(found.length >= 40, `only ${found.length} links found — regex drifted?`);
});

for (const { file, link } of found) {
  test(`${file}: ${link} resolves to a page`, () => {
    assert.ok(routeExists(link), `no src/app page for ${link}`);
  });
}

/** Mirrors live role_module_permissions.can_view (validated 2026-10-01). */
const ROLE_VIEW: Record<string, string[]> = {
  cig: ["computation", "intake", "verification"],
  csa: ["computation", "intake", "negotiation"],
  committee: ["committee", "negotiation", "reports"],
  lra: ["release_lra"],
  ar: ["accounting_ar", "reports"],
  collection_head: ["briefings"],
};

test("catalog role audiences can open their link", async () => {
  const { WORKFLOW_EVENTS } = await import("../workflow-catalog");
  for (const [key, def] of Object.entries(WORKFLOW_EVENTS)) {
    const link = def.link("00000000-0000-0000-0000-000000000000");
    const needed = getRequiredPageModules(link) ?? [];
    const roles =
      "roles" in def.audience ? def.audience.roles
      : "endorserOrCsa" in def.audience ? ["csa"]
      : [];
    const effective = "borrower" in def.audience ? ["borrower_portal"] : null;
    for (const role of roles) {
      assert.ok(needed.some((m) => ROLE_VIEW[role]?.includes(m)), `${key}: role ${role} can't view ${link}`);
    }
    if (effective) assert.ok(needed.some((m) => effective.includes(m)), `${key}: borrower can't view ${link}`);
  }
});
