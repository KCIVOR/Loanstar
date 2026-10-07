import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("keeps ExcelJS external to the Next server bundle", async () => {
  const nextConfig = await readFile(join(process.cwd(), "next.config.ts"), "utf8");

  assert.match(nextConfig, /serverExternalPackages:\s*\[[\s\S]*["']exceljs["']/);
});
