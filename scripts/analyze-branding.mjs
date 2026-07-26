import sharp from "sharp";
import fs from "fs";
import path from "path";

async function analyze(file) {
  const img = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const hist = new Map();
  let transparent = 0;
  let opaque = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3];
    if (a === 0) {
      transparent++;
      continue;
    }
    opaque++;
    const key = `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]},a${a}`;
    hist.set(key, (hist.get(key) || 0) + 1);
  }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log(file, {
    w: img.info.width,
    h: img.info.height,
    transparent,
    opaque,
    top,
  });
}

await analyze("docs/Loan-Star-Logo-20242-2.png");
await analyze("docs/branding-processed/logo.png");
await analyze("docs/cropped-Loan-Star-Lending-Group-Icon-Logo-180x180.png");
await analyze("docs/branding-processed/favicon.png");
