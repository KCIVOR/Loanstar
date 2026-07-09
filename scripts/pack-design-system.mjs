import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "docs", "deep-harbor", "catalog.src.html");
const dest = path.join(root, "docs", "LoanStar Deep Harbor Design System.html");

if (!fs.existsSync(src)) {
  throw new Error("Missing docs/deep-harbor/catalog.src.html — run npm run ds:unpack first");
}

const body = fs.readFileSync(src, "utf8");
// If source is a full HTML document, write through; else wrap
const out = /<!DOCTYPE html>/i.test(body)
  ? body
  : `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8"/>\n<meta name="viewport" content="width=device-width, initial-scale=1"/>\n<title>LoanStar Deep Harbor Design System</title>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

fs.writeFileSync(dest, out, "utf8");
console.log("Packed", dest, `(${out.length} bytes)`);
