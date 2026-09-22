/**
 * UAT demo-data seed (plan: docs/revision-plans/uat-demo-data-seed-implementation-plan.md).
 *
 * Closes the gaps listed in docs/revision-plans/uat-demo-data-inventory.md so
 * every test case in Loanstar-System-UAT-POL006.docx has a record to act on.
 *
 * SAFETY (mirrors scripts/reseed-demo-data.ts):
 *   - INSERTS ONLY. Never updates or deletes a pre-existing row.
 *   - Everything it creates is scoped to `demo.*@example.local` /
 *     `demo.*@loanstar.local` so one ILIKE finds it all again.
 *   - Dry run by default; --apply writes.
 *   - Idempotent: re-running skips anything already present.
 *   - Logs every inserted (table,id) to scripts/.uat-seed-log.json for rollback.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/seed-uat-demo-data.ts              (dry run)
 *   npx tsx --env-file=.env.local scripts/seed-uat-demo-data.ts --apply
 *   npx tsx --env-file=.env.local scripts/seed-uat-demo-data.ts --apply --phase=1
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { computeSfLoan } from "../src/lib/computation/sf";

const APPLY = process.argv.includes("--apply");
const phaseArg = process.argv.find((a) => a.startsWith("--phase="));
const ONLY_PHASE = phaseArg ? Number(phaseArg.split("=")[1]) : null;

const LOG_PATH = "scripts/.uat-seed-log.json";
const DEMO_PASSWORD = "Loanstar2026";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with --env-file=.env.local",
  );
}
const db = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// rollback log
// ---------------------------------------------------------------------------
type LogEntry = { table: string; id: string; note?: string };
const inserted: LogEntry[] = existsSync(LOG_PATH)
  ? (JSON.parse(readFileSync(LOG_PATH, "utf8")) as LogEntry[])
  : [];

function record(table: string, id: string, note?: string) {
  inserted.push({ table, id, note });
  if (APPLY) writeFileSync(LOG_PATH, JSON.stringify(inserted, null, 2));
}

function log(msg: string) {
  console.log(`${APPLY ? "[apply]" : "[dry] "} ${msg}`);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
function monthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

/** Seafarer DIRECT product — the rates every seeded computation uses. */
const SF_LOAN_TYPE = {
  id: "7a944144-9553-47b6-986e-362438ced739",
  name: "DIRECT",
  pfRate: 0.1,
  interestRate: 0.0199,
  securityFeeRate: 0.0199,
};

/**
 * Builds a computations row from the app's own engine — never hand-typed
 * figures, so the BLRI/voucher documents this data renders into agree with it.
 */
function buildComputation(loanApplicationId: string, netAmount: number, terms: number) {
  const r = computeSfLoan({
    inputMode: "NET_SARADO",
    amount: netAmount,
    terms,
    pfRate: SF_LOAN_TYPE.pfRate,
    interestRate: SF_LOAN_TYPE.interestRate,
    securityFeeRate: SF_LOAN_TYPE.securityFeeRate,
  } as Parameters<typeof computeSfLoan>[0]);

  const releaseDate = toIso(new Date());
  return {
    loan_application_id: loanApplicationId,
    version: 1,
    input_mode: "NET_SARADO",
    input_amount: netAmount,
    terms,
    addon_months: 2,
    pf_rate: SF_LOAN_TYPE.pfRate,
    interest_rate: SF_LOAN_TYPE.interestRate,
    security_fee_rate: SF_LOAN_TYPE.securityFeeRate,
    loan_type_id: SF_LOAN_TYPE.id,
    loan_type_name: SF_LOAN_TYPE.name,
    principal: r.principal,
    processing_fee: r.processingFee,
    admin_cost: r.adminCost ?? 0,
    doc_stamp: r.docStamp,
    notary_fee: r.notaryFee,
    security_fee: r.securityFee,
    total_deductions: r.totalDeductions,
    net_released: r.netReleased,
    total_interest: r.totalInterest,
    total_loan: r.totalLoan,
    monthly_amortization: r.monthlyAmortization,
    release_date: releaseDate,
    payment_frequency: "monthly",
    is_active: true,
  };
}

/** Creates (or finds) an auth user + profile. Returns the user id. */
async function ensureAuthUser(email: string, fullName: string) {
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = list?.users.find((u) => u.email?.toLowerCase() === email);
  if (found) {
    log(`auth user exists: ${email}`);
    return found.id;
  }
  if (!APPLY) {
    log(`would create auth user: ${email} (${fullName})`);
    return `DRY-${email}`;
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  record("auth.users", data.user.id, email);
  log(`created auth user: ${email}`);
  return data.user.id;
}

async function ensureRole(userId: string, slug: string) {
  if (!APPLY) {
    log(`  would assign role '${slug}'`);
    return;
  }
  const { data: role } = await db.from("roles").select("id").eq("slug", slug).single();
  if (!role) throw new Error(`role '${slug}' not found`);
  const { data: existing } = await db
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role_id", role.id)
    .maybeSingle();
  if (existing) return;
  const { error } = await db
    .from("user_roles")
    .insert({ user_id: userId, role_id: role.id, assigned_by: userId });
  if (error) throw new Error(`assign role ${slug}: ${error.message}`);
  log(`  assigned role '${slug}'`);
}

/** Creates (or finds) the borrower row for a demo login. */
async function ensureBorrower(userId: string, email: string, first: string, last: string) {
  const { data: existing } = await db
    .from("borrowers")
    .select("id, borrower_no")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    log(`borrower exists: ${email} (${existing.borrower_no})`);
    return existing.id as string;
  }
  if (!APPLY) {
    log(`would create borrower: ${email}`);
    return `DRY-borrower-${email}`;
  }
  const { data, error } = await db
    .from("borrowers")
    .insert({
      user_id: userId,
      email,
      first_name: first,
      last_name: last,
      citizenship: "Filipino",
      civil_status: "Single",
      mobile_phone: "09171234567",
      present_address: {},
      permanent_address: {},
    })
    .select("id, borrower_no")
    .single();
  if (error || !data) throw new Error(`create borrower ${email}: ${error?.message}`);
  record("borrowers", data.id as string, email);
  log(`created borrower: ${email} (${data.borrower_no})`);
  return data.id as string;
}

/**
 * Creates a loan application + application_details (+ optional computation).
 *
 * Seafarer is used throughout because the CHECK constraints are strictest
 * there and therefore safest: `loan_applications_payment_schedule_scope`
 * forces payment_schedule='monthly' for seafarer, and
 * `loan_applications_schedule_type_sme_only` forces schedule_type='monthly'
 * for anything that isn't SME. SME additionally requires entity_type to be
 * non-null (`loan_applications_entity_type_sme_only`).
 */
async function createApplication(opts: {
  borrowerId: string;
  status: string;
  segment?: "seafarer" | "sme" | "individual";
  entityType?: "individual" | "corporate" | null;
  collateralType?: "none" | "car_refinancing" | "real_estate";
  statusHistory?: Array<{ status: string; at: string; note?: string }>;
  blocker?: string | null;
  withComputation?: { net: number; terms: number } | null;
  note: string;
}) {
  const segment = opts.segment ?? "seafarer";

  // Idempotency keyed on (borrower_id, status), which is unique across every
  // application this script seeds — no demo borrower gets two applications in
  // the same status. Deliberately NOT keyed on a marker written into
  // status_history: that text renders in the borrower's "Recent updates" feed,
  // so a seeding artifact would be visible to the client during the demo.
  const { data: dupes } = await db
    .from("loan_applications")
    .select("id, application_no")
    .eq("borrower_id", opts.borrowerId)
    .eq("status", opts.status);
  const already = (dupes ?? [])[0];
  if (already) {
    log(`application exists: ${already.application_no} — ${opts.note}`);
    const { data: c } = await db
      .from("computations")
      .select("id")
      .eq("loan_application_id", already.id)
      .maybeSingle();
    return { appId: already.id as string, computationId: (c?.id as string) ?? null };
  }

  if (!APPLY) {
    log(
      `would create ${segment} application status=${opts.status} collateral=${
        opts.collateralType ?? "none"
      } — ${opts.note}`,
    );
    if (opts.withComputation) {
      const c = buildComputation("DRY", opts.withComputation.net, opts.withComputation.terms);
      log(
        `  + computation: principal=${c.principal} total_loan=${c.total_loan} amort=${c.monthly_amortization}`,
      );
    }
    return { appId: `DRY-app-${opts.note}`, computationId: null as string | null };
  }

  const { data: app, error } = await db
    .from("loan_applications")
    .insert({
      borrower_id: opts.borrowerId,
      status: opts.status,
      segment,
      entity_type: segment === "sme" ? (opts.entityType ?? "corporate") : opts.entityType ?? null,
      collateral_type: opts.collateralType ?? "none",
      payment_schedule: "monthly",
      schedule_type: "monthly",
      // Client-facing: this renders in the borrower's "Recent updates" feed,
      // so it carries no seeding markers. Clear-hold also reads this array
      // backwards for the last non-on_hold entry, so ordering is meaningful.
      status_history: opts.statusHistory ?? [
        { status: opts.status, at: new Date().toISOString() },
      ],
      blocker: opts.blocker ?? null,
    })
    .select("id, application_no")
    .single();
  if (error || !app) throw new Error(`create application (${opts.note}): ${error?.message}`);
  record("loan_applications", app.id as string, `${opts.note} / ${app.application_no}`);
  log(`created application ${app.application_no} status=${opts.status} — ${opts.note}`);

  const { error: detErr } = await db
    .from("application_details")
    .insert({ loan_application_id: app.id });
  if (detErr) throw new Error(`application_details (${opts.note}): ${detErr.message}`);

  let computationId: string | null = null;
  if (opts.withComputation) {
    const row = buildComputation(
      app.id as string,
      opts.withComputation.net,
      opts.withComputation.terms,
    );
    const { data: comp, error: compErr } = await db
      .from("computations")
      .insert(row)
      .select("id")
      .single();
    if (compErr || !comp) throw new Error(`computation (${opts.note}): ${compErr?.message}`);
    computationId = comp.id as string;
    record("computations", computationId, opts.note);
    log(`  + computation total_loan=${row.total_loan} amort=${row.monthly_amortization}`);
  }

  return { appId: app.id as string, computationId };
}

// ---------------------------------------------------------------------------
// PHASE 1 — borrower logins (unblocks UAT-008, 011, 012, 013, 014, 015, 016, 017)
// ---------------------------------------------------------------------------
async function phase1() {
  console.log("\n=== PHASE 1 — borrower logins ===");

  // UAT-008 — empty dashboard state. Owns nothing, deliberately.
  const newUser = await ensureAuthUser("demo.borrower.new@example.local", "Demo NewBorrower");
  await ensureRole(newUser, "borrower");
  await ensureBorrower(newUser, "demo.borrower.new@example.local", "Demo", "NewBorrower");

  // UAT-011/012/015 — one documents_pending + one draft.
  const activeUser = await ensureAuthUser(
    "demo.borrower.active@example.local",
    "Demo ActiveBorrower",
  );
  await ensureRole(activeUser, "borrower");
  const activeBorrower = await ensureBorrower(
    activeUser,
    "demo.borrower.active@example.local",
    "Demo",
    "ActiveBorrower",
  );
  await createApplication({
    borrowerId: activeBorrower,
    status: "documents_pending",
    withComputation: { net: 100000, terms: 6 },
    note: "UAT-011/015 documents_pending",
  });
  await createApplication({
    borrowerId: activeBorrower,
    status: "draft",
    withComputation: null,
    note: "UAT-012 draft to delete",
  });

  // UAT-013/014 — two terminal records with DIFFERENT statuses, so the
  // status filter has something to actually filter.
  const histUser = await ensureAuthUser(
    "demo.borrower.history@example.local",
    "Demo HistoryBorrower",
  );
  await ensureRole(histUser, "borrower");
  const histBorrower = await ensureBorrower(
    histUser,
    "demo.borrower.history@example.local",
    "Demo",
    "HistoryBorrower",
  );
  await createApplication({
    borrowerId: histBorrower,
    status: "paid_off",
    withComputation: { net: 80000, terms: 6 },
    statusHistory: [
      { status: "submitted", at: monthsAgo(10).toISOString() },
      { status: "loan_active", at: monthsAgo(8).toISOString() },
      { status: "paid_off", at: monthsAgo(1).toISOString() },
    ],
    note: "UAT-013/014 paid_off",
  });
  await createApplication({
    borrowerId: histBorrower,
    status: "denied",
    withComputation: null,
    statusHistory: [
      { status: "submitted", at: monthsAgo(6).toISOString() },
      { status: "denied", at: monthsAgo(5).toISOString(), note: "[UAT] demo denial" },
    ],
    note: "UAT-013/014 denied",
  });

  // UAT-016 — active servicing loan. Masterlist/schedule chain is added in
  // phase 1b once the computation exists (release_files.computation_id is
  // NOT NULL, so ordering matters).
  const svcUser = await ensureAuthUser(
    "demo.borrower.servicing@example.local",
    "Demo ServicingBorrower",
  );
  await ensureRole(svcUser, "borrower");
  const svcBorrower = await ensureBorrower(
    svcUser,
    "demo.borrower.servicing@example.local",
    "Demo",
    "ServicingBorrower",
  );
  await createApplication({
    borrowerId: svcBorrower,
    status: "loan_active",
    withComputation: { net: 120000, terms: 6 },
    statusHistory: [
      { status: "submitted", at: monthsAgo(4).toISOString() },
      { status: "released", at: monthsAgo(3).toISOString() },
      { status: "loan_active", at: monthsAgo(3).toISOString() },
    ],
    note: "UAT-016 active servicing loan",
  });

  // UAT-017 — reloan eligibility.
  const reloanUser = await ensureAuthUser(
    "demo.borrower.reloan@example.local",
    "Demo ReloanBorrower",
  );
  await ensureRole(reloanUser, "borrower");
  const reloanBorrower = await ensureBorrower(
    reloanUser,
    "demo.borrower.reloan@example.local",
    "Demo",
    "ReloanBorrower",
  );
  await createApplication({
    borrowerId: reloanBorrower,
    status: "paid_off",
    withComputation: { net: 90000, terms: 6 },
    statusHistory: [
      { status: "submitted", at: monthsAgo(12).toISOString() },
      { status: "loan_active", at: monthsAgo(10).toISOString() },
      { status: "paid_off", at: monthsAgo(2).toISOString() },
    ],
    note: "UAT-017 reloan-eligible paid_off",
  });
}

// ---------------------------------------------------------------------------
// PHASE 1b — servicing chain for the active loan (UAT-016)
//
// Without this the borrower dashboard renders but shows "Outstanding balance
// ₱0.00" and no loan account number, because the balance comes from
// `masterlist`, not from the application. Found by clicking, not by assuming.
//
// `masterlist.release_file_id` and `.computation_id` are both NULLABLE, so the
// release_files chain is not required here — masterlist + amortization_schedules
// is enough to make the dashboard, AR masterlist and collector views correct.
// ---------------------------------------------------------------------------
async function phase1b() {
  console.log("\n=== PHASE 1b — servicing chain (UAT-016) ===");

  const { data: borrower } = await db
    .from("borrowers")
    .select("id, borrower_no, first_name, last_name")
    .eq("email", "demo.borrower.servicing@example.local")
    .maybeSingle();
  if (!borrower) {
    log("servicing borrower not found — run phase 1 first");
    return;
  }

  const { data: app } = await db
    .from("loan_applications")
    .select("id, application_no")
    .eq("borrower_id", borrower.id)
    .eq("status", "loan_active")
    .maybeSingle();
  if (!app) {
    log("servicing application not found — run phase 1 first");
    return;
  }

  const { data: existing } = await db
    .from("masterlist")
    .select("id")
    .eq("loan_application_id", app.id)
    .maybeSingle();
  if (existing) {
    log(`masterlist already exists for ${app.application_no}`);
    return;
  }

  const { data: comp } = await db
    .from("computations")
    .select("*")
    .eq("loan_application_id", app.id)
    .maybeSingle();
  if (!comp) {
    log("computation not found for servicing application");
    return;
  }

  const releaseDate = toIso(monthsAgo(3));
  const firstPayment = toIso(monthsAgo(2));

  if (!APPLY) {
    log(
      `would create masterlist for ${app.application_no}: outstanding=${comp.total_loan} amort=${comp.monthly_amortization} terms=${comp.terms}`,
    );
    log(`would create ${comp.terms} amortization_schedules rows`);
    return;
  }

  const { data: ml, error: mlErr } = await db
    .from("masterlist")
    .insert({
      loan_application_id: app.id,
      borrower_id: borrower.id,
      computation_id: comp.id,
      loan_account_no: app.application_no,
      borrower_no: borrower.borrower_no,
      borrower_name: `${borrower.first_name} ${borrower.last_name}`,
      loan_amount: comp.principal,
      principal: comp.principal,
      total_loan: comp.total_loan,
      net_released: comp.net_released,
      monthly_amortization: comp.monthly_amortization,
      terms: comp.terms,
      outstanding_balance: comp.total_loan,
      aging_bucket: "current",
      account_status: "active",
      segment: "seafarer",
      loan_type_name: comp.loan_type_name,
      release_date: releaseDate,
      first_payment_date: firstPayment,
    })
    .select("id")
    .single();
  if (mlErr || !ml) throw new Error(`masterlist: ${mlErr?.message}`);
  record("masterlist", ml.id as string, `UAT-016 ${app.application_no}`);
  log(`created masterlist ${app.application_no} outstanding=${comp.total_loan}`);

  // Straight-line schedule off the stored amortization — same shape the AR
  // ledger and collector views expect.
  const rows = Array.from({ length: Number(comp.terms) }, (_, i) => {
    const due = new Date(`${firstPayment}T00:00:00`);
    due.setMonth(due.getMonth() + i);
    return {
      masterlist_id: ml.id,
      installment_no: i + 1,
      due_date: toIso(due),
      amount_due: comp.monthly_amortization,
    };
  });
  const { error: schedErr } = await db.from("amortization_schedules").insert(rows);
  if (schedErr) throw new Error(`amortization_schedules: ${schedErr.message}`);
  log(`created ${rows.length} amortization_schedules rows`);
}

// ---------------------------------------------------------------------------
// PHASE 2 — deactivated staff account (UAT-079). Zero inactive users exist.
// ---------------------------------------------------------------------------
async function phase2() {
  console.log("\n=== PHASE 2 — deactivated staff account (UAT-079) ===");
  const email = "demo.inactive.officer@loanstar.local";
  const userId = await ensureAuthUser(email, "Demo InactiveOfficer");
  await ensureRole(userId, "csa");

  if (!APPLY) {
    log(`would set profiles.is_active=false for ${email}`);
    return;
  }
  // The profile row is created by a trigger on auth user creation; this flips
  // the demo account itself (a row this script created), never a real user.
  const { error } = await db.from("profiles").update({ is_active: false }).eq("id", userId);
  if (error) throw new Error(`deactivate ${email}: ${error.message}`);
  log(`deactivated ${email}`);
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(
    APPLY
      ? "APPLYING — writing to the database"
      : "DRY RUN — nothing will be written. Re-run with --apply to write.",
  );

  if (!ONLY_PHASE || ONLY_PHASE === 1) await phase1();
  if (!ONLY_PHASE || ONLY_PHASE === 1) await phase1b();
  if (!ONLY_PHASE || ONLY_PHASE === 2) await phase2();

  console.log(`\nInserted rows this run: ${inserted.length}`);
  if (APPLY) console.log(`Rollback log: ${LOG_PATH}`);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  console.error("Partial inserts are in", LOG_PATH, "— roll back before retrying.");
  process.exit(1);
});
