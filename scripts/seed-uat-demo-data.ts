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

  // Idempotency keyed on (borrower_id, status, segment, collateral_type).
  // status alone is NOT enough: phase 4 seeds two applications for the same
  // borrower both in `for_verification`, differing only by segment and
  // collateral — keying on status alone silently skipped the second one.
  // Deliberately NOT keyed on a marker written into status_history: that text
  // renders in the borrower's "Recent updates" feed, so a seeding artifact
  // would be visible to the client during the demo.
  const collateral = opts.collateralType ?? "none";
  const { data: dupes } = await db
    .from("loan_applications")
    .select("id, application_no")
    .eq("borrower_id", opts.borrowerId)
    .eq("status", opts.status)
    .eq("segment", segment)
    .eq("collateral_type", collateral);
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
// Staff actor ids — used as `recorded_by` / `acted_by` / `uploaded_by` on the
// supporting rows. Resolved by email so this never hard-codes a uuid.
// ---------------------------------------------------------------------------
const STAFF_EMAILS = [
  "csa@loanstar.local",
  "cig@loanstar.local",
  "committee@loanstar.local",
  "lra@loanstar.local",
  "collector@loanstar.local",
] as const;
const staff: Record<string, string> = {};

async function loadStaff() {
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const email of STAFF_EMAILS) {
    const u = data?.users.find((x) => x.email?.toLowerCase() === email);
    if (!u) throw new Error(`staff account missing: ${email}`);
    staff[email] = u.id;
  }
}

/** One shared borrower for all the workflow-status demo applications. */
async function workflowBorrower() {
  const email = "demo.borrower.workflow@example.local";
  const userId = await ensureAuthUser(email, "Demo WorkflowBorrower");
  await ensureRole(userId, "borrower");
  return ensureBorrower(userId, email, "Demo", "WorkflowBorrower");
}

// ---------------------------------------------------------------------------
// PHASE 3 — the six workflow statuses that have zero rows
// ---------------------------------------------------------------------------
async function phase3() {
  console.log("\n=== PHASE 3 — workflow statuses ===");
  const borrowerId = await workflowBorrower();
  if (!APPLY) {
    log("would create 6 applications: on_hold, committee_hold, negotiating_terms,");
    log("  for_revision, lra_pending, release_briefing (+ their supporting rows)");
    return;
  }

  // --- on_hold (UAT-026/027) ---------------------------------------------
  // status_history must END with on_hold preceded by the status to restore to,
  // because resolveStatusAfterClearHold walks it backwards for the last
  // non-on_hold entry. Without the 'submitted' entry, Clear hold silently
  // falls back to CLEAR_HOLD_FALLBACK_STATUS.
  const holdReason =
    "Waiting for original signed POEA contract and proof of allottee relationship";
  const hold = await createApplication({
    borrowerId,
    status: "on_hold",
    blocker: holdReason,
    statusHistory: [
      { status: "submitted", at: monthsAgo(1).toISOString() },
      { status: "on_hold", at: new Date().toISOString(), note: holdReason },
    ],
    withComputation: { net: 110000, terms: 6 },
    note: "UAT-026/027 on_hold",
  });
  if (hold.appId && !hold.appId.startsWith("DRY")) {
    const { data: existingHold } = await db
      .from("file_holds")
      .select("id")
      .eq("loan_application_id", hold.appId)
      .maybeSingle();
    if (!existingHold) {
      const { data: fh, error } = await db
        .from("file_holds")
        .insert({
          loan_application_id: hold.appId,
          reason: holdReason,
          recorded_by: staff["csa@loanstar.local"],
        })
        .select("id")
        .single();
      if (error || !fh) throw new Error(`file_holds: ${error?.message}`);
      record("file_holds", fh.id as string, "UAT-027");
      log("  + file_holds row");
    }
  }

  // --- committee_hold (UAT-040) ------------------------------------------
  const cHold = await createApplication({
    borrowerId,
    status: "committee_hold",
    statusHistory: [
      { status: "submitted", at: monthsAgo(2).toISOString() },
      { status: "for_approval", at: monthsAgo(1).toISOString() },
      { status: "committee_hold", at: new Date().toISOString() },
    ],
    withComputation: { net: 260000, terms: 6 },
    note: "UAT-040 committee_hold",
  });
  await ensureCommitteeAction(cHold.appId, "hold", "[UAT] Requires Executive Committee review");

  // --- negotiating_terms (UAT-041) ---------------------------------------
  const nego = await createApplication({
    borrowerId,
    status: "negotiating_terms",
    statusHistory: [
      { status: "submitted", at: monthsAgo(2).toISOString() },
      { status: "for_approval", at: monthsAgo(1).toISOString() },
      { status: "negotiating_terms", at: new Date().toISOString() },
    ],
    withComputation: { net: 120000, terms: 4 },
    note: "UAT-041 negotiating_terms",
  });
  if (!nego.appId.startsWith("DRY")) {
    const { data: existingNego } = await db
      .from("negotiations")
      .select("id")
      .eq("loan_application_id", nego.appId)
      .maybeSingle();
    if (!existingNego) {
      const { data: n, error } = await db
        .from("negotiations")
        .insert({
          loan_application_id: nego.appId,
          status: "negotiating",
          last_counter_by: "committee",
        })
        .select("id")
        .single();
      if (error || !n) throw new Error(`negotiations: ${error?.message}`);
      record("negotiations", n.id as string, "UAT-041");
      const { error: mErr } = await db.from("negotiation_messages").insert({
        loan_application_id: nego.appId,
        author_id: staff["committee@loanstar.local"],
        author_role: "committee",
        kind: "offer",
        amount: 120000,
        body: "Counter-offer: PHP 120,000 over 4 months.",
      });
      if (mErr) throw new Error(`negotiation_messages: ${mErr.message}`);
      log("  + negotiation + counter-offer message");
    }
  }

  // --- for_revision (UAT / CIG revision loop) -----------------------------
  const rev = await createApplication({
    borrowerId,
    status: "for_revision",
    statusHistory: [
      { status: "submitted", at: monthsAgo(2).toISOString() },
      { status: "for_approval", at: monthsAgo(1).toISOString() },
      { status: "for_revision", at: new Date().toISOString() },
    ],
    withComputation: { net: 95000, terms: 6 },
    note: "for_revision (CIG revision loop)",
  });
  const revActionId = await ensureCommitteeAction(
    rev.appId,
    "revisit",
    "[UAT] Please re-verify employment details with the manning agency.",
  );
  if (revActionId && !rev.appId.startsWith("DRY")) {
    const { data: existingNotice } = await db
      .from("revisit_notices")
      .select("id")
      .eq("loan_application_id", rev.appId)
      .maybeSingle();
    if (!existingNotice) {
      // revisit_notices.committee_action_id is NOT NULL — the action above
      // must exist first.
      const { data: rn, error } = await db
        .from("revisit_notices")
        .insert({
          loan_application_id: rev.appId,
          committee_action_id: revActionId,
          route_to: "cig",
          comment: "Please re-verify employment details with the manning agency.",
        })
        .select("id")
        .single();
      if (error || !rn) throw new Error(`revisit_notices: ${error?.message}`);
      record("revisit_notices", rn.id as string, "for_revision");
      log("  + revisit_notice (route_to=cig)");
    }
  }

  // --- lra_pending (UAT-045/046) -----------------------------------------
  const lra = await createApplication({
    borrowerId,
    status: "lra_pending",
    statusHistory: [
      { status: "for_approval", at: monthsAgo(1).toISOString() },
      { status: "approved", at: monthsAgo(1).toISOString() },
      { status: "lra_pending", at: new Date().toISOString() },
    ],
    withComputation: { net: 150000, terms: 6 },
    note: "UAT-045/046 lra_pending",
  });
  if (!lra.appId.startsWith("DRY") && lra.computationId) {
    const { data: existingQ } = await db
      .from("release_queue")
      .select("id")
      .eq("loan_application_id", lra.appId)
      .maybeSingle();
    if (!existingQ) {
      // release_queue.computation_id is NOT NULL.
      const { data: q, error } = await db
        .from("release_queue")
        .insert({ loan_application_id: lra.appId, computation_id: lra.computationId })
        .select("id")
        .single();
      if (error || !q) throw new Error(`release_queue: ${error?.message}`);
      record("release_queue", q.id as string, "UAT-046");
      log("  + release_queue entry");
    }
  }

  // --- release_briefing (UAT-049/050) ------------------------------------
  const brief = await createApplication({
    borrowerId,
    status: "release_briefing",
    statusHistory: [
      { status: "approved", at: monthsAgo(1).toISOString() },
      { status: "release_signing", at: monthsAgo(1).toISOString() },
      { status: "release_briefing", at: new Date().toISOString() },
    ],
    withComputation: { net: 130000, terms: 6 },
    note: "UAT-049/050 release_briefing",
  });
  if (!brief.appId.startsWith("DRY") && brief.computationId) {
    const { data: existingRf } = await db
      .from("release_files")
      .select("id")
      .eq("loan_application_id", brief.appId)
      .maybeSingle();
    let releaseFileId = existingRf?.id as string | undefined;
    if (!releaseFileId) {
      // briefings.release_file_id is NOT NULL, and release_files.computation_id
      // is NOT NULL — so the chain must be computation -> release_file -> briefing.
      const { data: rf, error } = await db
        .from("release_files")
        .insert({
          loan_application_id: brief.appId,
          computation_id: brief.computationId,
          status: "awaiting_briefing",
          release_paths: ["with_pdc"],
        })
        .select("id")
        .single();
      if (error || !rf) throw new Error(`release_files: ${error?.message}`);
      releaseFileId = rf.id as string;
      record("release_files", releaseFileId, "UAT-049/050");
      log("  + release_file (awaiting_briefing)");
    }
    const { data: existingBrief } = await db
      .from("briefings")
      .select("id")
      .eq("release_file_id", releaseFileId)
      .maybeSingle();
    if (!existingBrief) {
      const { data: bf, error } = await db
        .from("briefings")
        .insert({ release_file_id: releaseFileId })
        .select("id")
        .single();
      if (error || !bf) throw new Error(`briefings: ${error?.message}`);
      record("briefings", bf.id as string, "UAT-049/050");
      log("  + briefing (pending sign-off)");
    }
  }
}

/** committee_actions.action is CHECK'd to approve|deny|revisit|hold. */
async function ensureCommitteeAction(appId: string, action: string, comment: string) {
  if (!APPLY || appId.startsWith("DRY")) return null;
  const { data: existing } = await db
    .from("committee_actions")
    .select("id")
    .eq("loan_application_id", appId)
    .eq("action", action)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await db
    .from("committee_actions")
    .insert({
      loan_application_id: appId,
      action,
      acted_by: staff["committee@loanstar.local"],
      comment,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`committee_actions (${action}): ${error?.message}`);
  record("committee_actions", data.id as string, action);
  log(`  + committee_action '${action}'`);
  return data.id as string;
}

// ---------------------------------------------------------------------------
// PHASE 4 — collateral applications sitting IN CIG (UAT-105..108)
//
// These must be in `for_verification`: the verifications_write RLS policy is
// `has_module_permission('verification','edit') AND status='for_verification'`,
// so outside that status Postgres rejects the write and the inspection form
// silently fails to save. Every existing collateral application is already
// past CIG, which is why UAT-105-108 had nothing to act on.
// ---------------------------------------------------------------------------
async function phase4() {
  console.log("\n=== PHASE 4 — collateral applications in CIG ===");
  const borrowerId = await workflowBorrower();

  await createApplication({
    borrowerId,
    status: "for_verification",
    segment: "sme",
    entityType: "corporate", // loan_applications_entity_type_sme_only
    collateralType: "car_refinancing",
    statusHistory: [
      { status: "submitted", at: monthsAgo(1).toISOString() },
      { status: "for_verification", at: new Date().toISOString() },
    ],
    withComputation: { net: 250000, terms: 6 },
    note: "UAT-105/106 SME car_refinancing in CIG",
  });

  await createApplication({
    borrowerId,
    status: "for_verification",
    segment: "individual",
    collateralType: "real_estate",
    statusHistory: [
      { status: "submitted", at: monthsAgo(1).toISOString() },
      { status: "for_verification", at: new Date().toISOString() },
    ],
    withComputation: { net: 300000, terms: 6 },
    note: "UAT-107/108 Individual real_estate in CIG",
  });
}

// ---------------------------------------------------------------------------
// PHASE 5 — a DCR awaiting reconciliation (UAT-055/060)
//
// dcr_items.payment_id is NOT NULL, so the chain is
// masterlist -> payments -> dcr -> dcr_items. Built against the servicing
// account seeded in phase 1b so it reconciles against a real schedule.
// ---------------------------------------------------------------------------
async function phase5() {
  console.log("\n=== PHASE 5 — submitted DCR ===");

  const { data: ml } = await db
    .from("masterlist")
    .select("id, loan_application_id, borrower_id, loan_account_no, monthly_amortization")
    .eq("loan_account_no", "AN300491")
    .maybeSingle();
  if (!ml) {
    log("servicing masterlist not found — run phase 1 first");
    return;
  }

  const { data: existingDcr } = await db
    .from("dcr")
    .select("id")
    .eq("collector_user_id", staff["collector@loanstar.local"])
    .eq("status", "submitted")
    .maybeSingle();
  if (existingDcr) {
    log("submitted DCR already exists");
    return;
  }

  if (!APPLY) {
    log(`would create 2 payments + 1 submitted DCR against ${ml.loan_account_no}`);
    return;
  }

  // payments.channel is CHECK'd to bank_deposit|check|pos_cash — "cash" in the
  // UAT document maps to pos_cash.
  const amount = Number(ml.monthly_amortization);
  const paymentIds: string[] = [];
  for (const [i, channel] of (["pos_cash", "bank_deposit"] as const).entries()) {
    const { data: p, error } = await db
      .from("payments")
      .insert({
        masterlist_id: ml.id,
        loan_application_id: ml.loan_application_id,
        borrower_id: ml.borrower_id,
        payment_date: toIso(new Date()),
        amount,
        channel,
        status: "pending_verification",
        uploaded_by: staff["collector@loanstar.local"],
        reference_no: `OR-88910${i + 2}`,
      })
      .select("id")
      .single();
    if (error || !p) throw new Error(`payments: ${error?.message}`);
    paymentIds.push(p.id as string);
    record("payments", p.id as string, "UAT-055/060");
  }
  log(`  + ${paymentIds.length} payments of ${amount}`);

  const { data: dcr, error: dcrErr } = await db
    .from("dcr")
    .insert({
      collector_user_id: staff["collector@loanstar.local"],
      status: "submitted",
      submitted_at: new Date().toISOString(),
      deposit_amount: amount * paymentIds.length,
      deposit_reference: "DEP-UAT-0001",
    })
    .select("id")
    .single();
  if (dcrErr || !dcr) throw new Error(`dcr: ${dcrErr?.message}`);
  record("dcr", dcr.id as string, "UAT-055/060");

  for (const pid of paymentIds) {
    const { data: item, error } = await db
      .from("dcr_items")
      .insert({ dcr_id: dcr.id, payment_id: pid, amount, status: "pending" })
      .select("id")
      .single();
    if (error || !item) throw new Error(`dcr_items: ${error?.message}`);
    record("dcr_items", item.id as string, "UAT-055/060");
  }
  log(`  + submitted DCR with ${paymentIds.length} items, deposit=${amount * paymentIds.length}`);
}

// ---------------------------------------------------------------------------
async function main() {
  await loadStaff();
  console.log(
    APPLY
      ? "APPLYING — writing to the database"
      : "DRY RUN — nothing will be written. Re-run with --apply to write.",
  );

  if (!ONLY_PHASE || ONLY_PHASE === 1) await phase1();
  if (!ONLY_PHASE || ONLY_PHASE === 1) await phase1b();
  if (!ONLY_PHASE || ONLY_PHASE === 2) await phase2();
  if (!ONLY_PHASE || ONLY_PHASE === 3) await phase3();
  if (!ONLY_PHASE || ONLY_PHASE === 4) await phase4();
  if (!ONLY_PHASE || ONLY_PHASE === 5) await phase5();

  console.log(`\nInserted rows this run: ${inserted.length}`);
  if (APPLY) console.log(`Rollback log: ${LOG_PATH}`);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  console.error("Partial inserts are in", LOG_PATH, "— roll back before retrying.");
  process.exit(1);
});
