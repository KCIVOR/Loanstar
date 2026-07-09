import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundled = path.join(root, "docs", "LoanStar Deep Harbor Design System.html");
const outDir = path.join(root, "docs", "deep-harbor");
const catalogPath = path.join(outDir, "catalog.src.html");

const html = fs.readFileSync(bundled, "utf8");
const templateMatch = html.match(
  /<script[^>]*type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/
);
if (!templateMatch) throw new Error("No __bundler/template found");

let template = templateMatch[1]
  .replace(/\\u002F/g, "/")
  .replace(/\\\//g, "/")
  .replace(/\\n/g, "\n")
  .replace(/\\t/g, "\t")
  .replace(/\\"/g, '"');

// Drop external UUID script tags that only work inside the bundler runtime
template = template.replace(
  /<script src="[0-9a-f-]{36}"><\/script>\s*/gi,
  ""
);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(catalogPath, template, "utf8");
console.log("Wrote", catalogPath);
