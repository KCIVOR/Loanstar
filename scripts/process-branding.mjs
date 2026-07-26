import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import sharp from "sharp";

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    out[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return out;
}

/** Force near-black (and near-transparent dark) pixels fully transparent. */
async function cleanPng(inputPath, outputPath, threshold = 40) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(data);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    // Fully clear near-black, or any very dark low-alpha fringe
    if (
      (r <= threshold && g <= threshold && b <= threshold) ||
      (a < 40 && r < 80 && g < 80 && b < 80)
    ) {
      pixels[i] = 0;
      pixels[i + 1] = 0;
      pixels[i + 2] = 0;
      pixels[i + 3] = 0;
    }
  }

  await sharp(pixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toFile(outputPath);
}

async function main() {
  const outDir = path.join("docs", "branding-processed");
  fs.mkdirSync(outDir, { recursive: true });

  const faviconOut = path.join(outDir, "favicon.png");
  const logoOut = path.join(outDir, "logo.png");

  await cleanPng(
    path.join("docs", "cropped-Loan-Star-Lending-Group-Icon-Logo-180x180.png"),
    faviconOut,
  );
  await cleanPng(path.join("docs", "Loan-Star-Logo-20242-2.png"), logoOut);

  const env = loadEnv(path.join(process.cwd(), ".env.local"));
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  for (const remote of [
    { file: faviconOut, name: "favicon.png" },
    { file: logoOut, name: "logo.png" },
  ]) {
    const body = fs.readFileSync(remote.file);
    const { error } = await supabase.storage.from("branding").upload(remote.name, body, {
      contentType: "image/png",
      upsert: true,
      cacheControl: "60",
    });
    if (error) throw error;
    console.log("uploaded", remote.name);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
