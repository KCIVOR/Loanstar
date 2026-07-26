import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    out[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return out;
}

async function main() {
  const env = loadEnv(path.join(process.cwd(), ".env.local"));
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const uploads = [
    {
      local: path.join("docs", "Loan-Star-Logo-20242-2.png"),
      remote: "logo.png",
    },
    {
      local: path.join(
        "docs",
        "cropped-Loan-Star-Lending-Group-Icon-Logo-180x180.png",
      ),
      remote: "favicon.png",
    },
  ];

  for (const u of uploads) {
    const body = fs.readFileSync(u.local);
    const { error } = await supabase.storage
      .from("branding")
      .upload(u.remote, body, {
        contentType: "image/png",
        upsert: true,
        cacheControl: "3600",
      });
    if (error) throw error;
    const { data: pub } = supabase.storage.from("branding").getPublicUrl(u.remote);
    console.log("uploaded", u.remote, "->", pub.publicUrl);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
