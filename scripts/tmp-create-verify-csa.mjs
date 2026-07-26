// One-off: create a temporary CSA user for Phase-1 browser verification.
// Deleted again by delete-verify-csa.mjs after the check.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const envPath = new URL("../../../../../../Desktop/Loanstar System/loanstar/.env.local", import.meta.url);
let env;
try {
  env = readFileSync("C:/Users/Rovick/Desktop/Loanstar System/loanstar/.env.local", "utf8");
} catch {
  env = readFileSync(envPath, "utf8");
}
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("Missing Supabase env values");

const admin = createClient(url, key);

const EMAIL = "claude-verify-csa@loanstar.local";
const PASSWORD = process.argv[2];
if (!PASSWORD) throw new Error("Usage: node create-verify-csa.mjs <password>");

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { full_name: "Claude Verify CSA" },
});
if (createError) throw createError;

const userId = created.user.id;
const { data: role, error: roleError } = await admin
  .from("roles")
  .select("id")
  .eq("slug", "csa")
  .single();
if (roleError) throw roleError;

const { error: assignError } = await admin.from("user_roles").insert({
  user_id: userId,
  role_id: role.id,
  assigned_by: userId,
});
if (assignError) throw assignError;

console.log("created", userId);
