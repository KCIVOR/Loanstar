/**
 * One-off demo-data remediation script (Phase 0 of the executive reports plan,
 * see docs/revision-plans/feature-executive-reports-module.md).
 *
 * Rescales the ~19 seeded "Demo##" accounts to realistic loan amounts and
 * names, spreads their release dates across the last 12 months, and
 * regenerates their amortization schedule + payments + DCR + postings chain
 * so the account ledger, aging bucket, and reports dashboard all agree.
 *
 * NEVER runs automatically. NEVER touches a row outside the demo set —
 * scoped exclusively to borrowers.email ILIKE 'demo.borrower.%@example.local'.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/reseed-demo-data.ts             (dry run — prints the plan, writes nothing)
 *   npx tsx --env-file=.env.local scripts/reseed-demo-data.ts --apply     (executes the plan)
 */
import { createClient } from "@supabase/supabase-js";

import { computeFirstPaymentDate } from "../src/lib/computation/release-date";
import { halfUp } from "../src/lib/computation/money";
import {
  computeAgingBucket,
  daysPastDue,
  generateAmortizationSchedule,
  type AmortizationInstallment,
} from "../src/lib/ar/schedule";

const APPLY = process.argv.includes("--apply");
const DEMO_EMAIL_PATTERN = "demo.borrower.%@example.local";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with --env-file=.env.local",
  );
}
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Realistic Filipino name pool (self-contained — deliberately not importing
// src/lib/dev/fake-data.ts, which is explicitly scoped to dev-gated UI only).
// ---------------------------------------------------------------------------
const FIRST_NAMES = [
  "Juan", "Maria", "Jose", "Ana", "Pedro", "Rosa", "Carlos", "Elena",
  "Ramon", "Teresa", "Antonio", "Luz", "Roberto", "Carmen", "Manuel",
  "Josefina", "Ricardo", "Corazon", "Eduardo", "Remedios",
];
const LAST_NAMES = [
  "Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Torres", "Flores",
  "Ramos", "Villanueva", "Mendoza", "Castillo", "Aquino", "Dela Cruz",
  "Fernandez", "Gonzales", "Del Rosario", "Navarro", "Domingo", "Pascual",
];

function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length] as T;
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

function monthsAgoDate(months: number, dayOfMonth: number): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - months, dayOfMonth);
  return d;
}

// ---------------------------------------------------------------------------
// Per-account target bucket assignment — 19 demo accounts, matching the
// plan's target shape (~70/12/8/5/5% current/1-30/31-60/61-90/91+).
// ---------------------------------------------------------------------------
type BucketPlan = "current" | "1-30" | "31-60" | "61-90" | "91+";

const BUCKET_SEQUENCE: BucketPlan[] = [
  "1-30", "1-30",
  "31-60", "31-60",
  "61-90",
  "91+",
  // remaining accounts are "current"
];

// How many trailing (most recent) due installments to LEAVE UNPAID to land
// the oldest-unpaid installment in the target bucket (due dates are ~30
// days apart, so N unpaid trailing installments ≈ N×30 days past due).
const UNPAID_TAIL_BY_BUCKET: Record<BucketPlan, number> = {
  current: 0,
  "1-30": 1,
  "31-60": 2,
  "61-90": 3,
  "91+": 4,
};

const RELEASE_MONTHS_AGO_BY_BUCKET: Record<BucketPlan, number> = {
  current: 0, // overridden per-account below with a 0–11 month spread
  "1-30": 6,
  "31-60": 7,
  "61-90": 8,
  "91+": 10,
};

type DemoAccount = {
  masterlistId: string;
  borrowerId: string;
  loanApplicationId: string;
  loanAccountNo: string;
  segment: "seafarer" | "sme";
  collectorUserId: string | null;
  remedialUserId: string | null;
};

type AccountPlan = {
  account: DemoAccount;
  name: string;
  principal: number;
  terms: number;
  releaseDate: string;
  bucket: BucketPlan;
  schedule: AmortizationInstallment[];
  paidInstallments: AmortizationInstallment[];
  unpaidInstallments: AmortizationInstallment[];
};

async function fetchDemoAccounts(): Promise<DemoAccount[]> {
  const { data, error } = await supabase
    .from("masterlist")
    .select(
      "id, borrower_id, loan_application_id, loan_account_no, segment, borrower_name, borrowers!inner(email)",
    )
    .ilike("borrowers.email", DEMO_EMAIL_PATTERN)
    .order("loan_account_no", { ascending: true });
  if (error) throw new Error(error.message);

  const masterlistIds = (data ?? []).map((r) => r.id as string);
  const { data: assignments, error: aErr } = await supabase
    .from("assignments")
    .select("masterlist_id, collector_user_id, remedial_user_id")
    .in("masterlist_id", masterlistIds);
  if (aErr) throw new Error(aErr.message);
  const assignmentByMasterlist = new Map(
    (assignments ?? []).map((a) => [a.masterlist_id as string, a]),
  );

  return (data ?? []).map((row) => {
    const assignment = assignmentByMasterlist.get(row.id as string);
    return {
      masterlistId: row.id as string,
      borrowerId: row.borrower_id as string,
      loanApplicationId: row.loan_application_id as string,
      loanAccountNo: row.loan_account_no as string,
      segment: (row.segment as "seafarer" | "sme") ?? "seafarer",
      collectorUserId: (assignment?.collector_user_id as string) ?? null,
      remedialUserId: (assignment?.remedial_user_id as string) ?? null,
    };
  });
}

/** Deterministic pseudo-random float in [0, 1) — spreads evenly across a
 * small seed range, unlike a plain modulo which clusters for few samples. */
function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function principalFor(segment: "seafarer" | "sme", seed: number): number {
  const t = hash01(seed);
  if (segment === "sme") {
    // ₱500,000 – ₱5,000,000
    return halfUp(500_000 + t * 4_500_000);
  }
  // ₱50,000 – ₱500,000
  return halfUp(50_000 + t * 450_000);
}

function buildPlan(accounts: DemoAccount[]): AccountPlan[] {
  const today = new Date();
  const plans: AccountPlan[] = [];

  accounts.forEach((account, idx) => {
    const bucket: BucketPlan = BUCKET_SEQUENCE[idx] ?? "current";
    const terms = account.segment === "sme" ? 24 : 12;
    const principal = principalFor(account.segment, idx + 1);
    const monthlyAmortization = halfUp(principal / terms);

    const releaseMonthsAgo =
      bucket === "current"
        ? idx % 12 // spread the 13 "current" accounts across the last 12 months
        : RELEASE_MONTHS_AGO_BY_BUCKET[bucket];
    const releaseDate = toIsoDate(monthsAgoDate(releaseMonthsAgo, 15));

    const schedule = generateAmortizationSchedule({
      terms,
      monthlyAmortization,
      releaseDate,
      addonMonths: 1,
      dueDay: 10,
    });

    const dueByToday = schedule.filter((i) => i.dueDate <= toIsoDate(today));
    const unpaidTail = Math.min(UNPAID_TAIL_BY_BUCKET[bucket], dueByToday.length);
    const paidCount = dueByToday.length - unpaidTail;

    const paidInstallments = schedule.slice(0, paidCount);
    const unpaidInstallments = schedule.slice(paidCount);

    const first = FIRST_NAMES[idx % FIRST_NAMES.length];
    const last = LAST_NAMES[(idx * 3 + 1) % LAST_NAMES.length];

    plans.push({
      account,
      name: `${first} ${last}`,
      principal,
      terms,
      releaseDate,
      bucket,
      schedule,
      paidInstallments,
      unpaidInstallments,
    });
  });

  return plans;
}

function printPlan(plans: AccountPlan[]) {
  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN"} — ${plans.length} demo accounts\n`);
  console.log(
    "account".padEnd(11),
    "segment".padEnd(9),
    "old→new name".padEnd(28),
    "principal".padEnd(12),
    "release".padEnd(12),
    "bucket".padEnd(7),
    "paid/total",
  );
  for (const p of plans) {
    console.log(
      p.account.loanAccountNo.padEnd(11),
      p.account.segment.padEnd(9),
      p.name.padEnd(28),
      `₱${p.principal.toLocaleString("en-PH")}`.padEnd(12),
      p.releaseDate.padEnd(12),
      p.bucket.padEnd(7),
      `${p.paidInstallments.length}/${p.schedule.length}`,
    );
  }
  const totalPrincipal = plans.reduce((s, p) => s + p.principal, 0);
  console.log(`\nTotal principal across demo accounts: ₱${totalPrincipal.toLocaleString("en-PH")}`);
}

// ---------------------------------------------------------------------------
// Write path
// ---------------------------------------------------------------------------

async function deleteExistingChildren(masterlistId: string) {
  const { data: payments } = await supabase
    .from("payments")
    .select("id")
    .eq("masterlist_id", masterlistId);
  const paymentIds = (payments ?? []).map((p) => p.id as string);

  if (paymentIds.length) {
    const { data: dcrItems } = await supabase
      .from("dcr_items")
      .select("id, dcr_id")
      .in("payment_id", paymentIds);
    const dcrItemIds = (dcrItems ?? []).map((i) => i.id as string);
    const dcrIds = Array.from(new Set((dcrItems ?? []).map((i) => i.dcr_id as string)));

    if (dcrItemIds.length) {
      await supabase.from("dcr_item_allocations").delete().in("dcr_item_id", dcrItemIds);
      await supabase.from("dcr_items").delete().in("id", dcrItemIds);
    }
    // Only remove DCR shells that are now empty (exclusively belonged to this account's demo payments).
    if (dcrIds.length) {
      const { data: remaining } = await supabase
        .from("dcr_items")
        .select("dcr_id")
        .in("dcr_id", dcrIds);
      const stillUsed = new Set((remaining ?? []).map((r) => r.dcr_id as string));
      const emptyDcrIds = dcrIds.filter((id) => !stillUsed.has(id));
      if (emptyDcrIds.length) {
        await supabase.from("postings").delete().in("dcr_id", emptyDcrIds);
        await supabase.from("dcr").delete().in("id", emptyDcrIds);
      }
    }
  }

  await supabase.from("postings").delete().eq("masterlist_id", masterlistId);
  await supabase.from("payments").delete().eq("masterlist_id", masterlistId);
  await supabase.from("penalties").delete().eq("masterlist_id", masterlistId);
  await supabase.from("amortization_schedules").delete().eq("masterlist_id", masterlistId);
}

function randomOffset(seed: number, span: number): number {
  return (seed % (span * 2 + 1)) - span;
}

async function applyAccount(plan: AccountPlan, arUserId: string) {
  const { account } = plan;
  await deleteExistingChildren(account.masterlistId);

  const { data: scheduleRows, error: schedError } = await supabase
    .from("amortization_schedules")
    .insert(
      plan.schedule.map((inst) => ({
        masterlist_id: account.masterlistId,
        installment_no: inst.installmentNo,
        due_date: inst.dueDate,
        amount_due: inst.amountDue,
        penalty_amount: 0,
        amount_paid: 0,
        status: "pending",
      })),
    )
    .select("id, installment_no");
  if (schedError) throw new Error(schedError.message);

  const scheduleIdByInstallment = new Map(
    (scheduleRows ?? []).map((r) => [r.installment_no as number, r.id as string]),
  );

  const collectorId = account.collectorUserId ?? arUserId;
  let totalCollected = 0;

  if (plan.paidInstallments.length) {
    const { data: dcrRow, error: dcrError } = await supabase
      .from("dcr")
      .insert({
        collector_user_id: collectorId,
        status: "reconciled",
        submitted_at: `${plan.paidInstallments[0].dueDate}T09:00:00Z`,
        reconciled_by: arUserId,
        reconciled_at: `${plan.paidInstallments[0].dueDate}T09:00:00Z`,
        deposit_reference: `SEED-${account.loanAccountNo}`,
      })
      .select("id")
      .single();
    if (dcrError || !dcrRow) throw new Error(dcrError?.message ?? "dcr insert failed");

    for (const [idx, inst] of plan.paidInstallments.entries()) {
      const offset = randomOffset(idx * 7 + inst.installmentNo, 4);
      const paymentDate = addDaysIso(inst.dueDate, Math.min(offset, 0)); // paid on/before due date
      const postedAt = `${addDaysIso(inst.dueDate, offset)}T10:00:00Z`;

      const { data: paymentRow, error: paymentError } = await supabase
        .from("payments")
        .insert({
          masterlist_id: account.masterlistId,
          loan_application_id: account.loanApplicationId,
          borrower_id: account.borrowerId,
          reference_no: `SEED-${account.loanAccountNo}-${inst.installmentNo}`,
          payment_date: paymentDate,
          amount: inst.amountDue,
          channel: "bank_deposit",
          status: "posted",
          uploaded_by: collectorId,
          reviewed_by: arUserId,
          reviewed_at: postedAt,
        })
        .select("id")
        .single();
      if (paymentError || !paymentRow) throw new Error(paymentError?.message ?? "payment insert failed");

      const { data: itemRow, error: itemError } = await supabase
        .from("dcr_items")
        .insert({ dcr_id: dcrRow.id, payment_id: paymentRow.id, amount: inst.amountDue })
        .select("id")
        .single();
      if (itemError || !itemRow) throw new Error(itemError?.message ?? "dcr_item insert failed");

      const scheduleId = scheduleIdByInstallment.get(inst.installmentNo);
      await supabase.from("dcr_item_allocations").insert({
        dcr_item_id: itemRow.id,
        amortization_schedule_id: scheduleId,
        amount: inst.amountDue,
      });

      await supabase.from("postings").insert({
        dcr_id: dcrRow.id,
        payment_id: paymentRow.id,
        masterlist_id: account.masterlistId,
        amortization_schedule_id: scheduleId,
        amount: inst.amountDue,
        posted_by: arUserId,
        posted_at: postedAt,
      });

      await supabase
        .from("amortization_schedules")
        .update({ amount_paid: inst.amountDue, status: "paid", paid_at: postedAt })
        .eq("id", scheduleId);

      totalCollected = halfUp(totalCollected + inst.amountDue);
    }
  }

  // Mark unpaid-but-overdue installments as 'overdue' (past due, nothing posted).
  const todayIso = toIsoDate(new Date());
  const overdueIds = plan.unpaidInstallments
    .filter((i) => i.dueDate < todayIso)
    .map((i) => scheduleIdByInstallment.get(i.installmentNo))
    .filter((id): id is string => Boolean(id));
  if (overdueIds.length) {
    await supabase.from("amortization_schedules").update({ status: "overdue" }).in("id", overdueIds);
  }

  const outstandingBalance = halfUp(plan.principal - totalCollected);
  const oldestUnpaid = plan.unpaidInstallments[0];
  const agingBucket = oldestUnpaid
    ? computeAgingBucket(daysPastDue(oldestUnpaid.dueDate))
    : "current";

  await supabase
    .from("masterlist")
    .update({
      borrower_name: plan.name,
      total_loan: plan.principal,
      outstanding_balance: outstandingBalance,
      aging_bucket: agingBucket,
      release_date: plan.releaseDate,
      account_status:
        agingBucket === "61-90" || agingBucket === "91+" ? "remedial" : "active",
    })
    .eq("id", account.masterlistId);

  const [first, ...rest] = plan.name.split(" ");
  await supabase
    .from("borrowers")
    .update({ first_name: first, last_name: rest.join(" ") })
    .eq("id", account.borrowerId);

  return { agingBucket, outstandingBalance, totalCollected };
}

async function seedLeads(agentUserId: string) {
  const targetCount = 55;
  const { count: existing } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .ilike("borrower_name", "Seed Lead%");
  const toCreate = Math.max(0, targetCount - (existing ?? 0));
  if (!toCreate) {
    console.log("Leads: target already met, skipping.");
    return;
  }

  const rows = Array.from({ length: toCreate }, (_, i) => {
    const monthsAgo = i % 12;
    const createdAt = monthsAgoDate(monthsAgo, 5 + (i % 20)).toISOString();
    const converted = i % 5 === 0; // ~20% converted, matches a believable top-of-funnel
    const first = pick(FIRST_NAMES, i);
    const last = pick(LAST_NAMES, i * 5 + 2);
    return {
      agent_user_id: agentUserId,
      borrower_name: `Seed Lead ${first} ${last}`,
      status: converted ? "converted" : "open",
      created_at: createdAt,
      updated_at: createdAt,
    };
  });

  if (APPLY) {
    const { error } = await supabase.from("leads").insert(rows);
    if (error) throw new Error(error.message);
  }
  console.log(`Leads: ${APPLY ? "created" : "would create"} ${rows.length} rows.`);
}

async function seedRemedialTurnovers(plans: AccountPlan[], arUserId: string) {
  const candidates = plans.filter(
    (p) => p.bucket === "61-90" || p.bucket === "91+",
  );
  if (!candidates.length) {
    console.log("Remedial turnovers: no eligible accounts found, skipping.");
    return;
  }

  for (const plan of candidates) {
    const { account } = plan;
    if (!account.remedialUserId || !account.collectorUserId) continue;

    const { count: existingTurnovers } = await supabase
      .from("remedial_turnovers")
      .select("id", { count: "exact", head: true })
      .eq("masterlist_id", account.masterlistId)
      .eq("turnover_reason", "Missed 2+ consecutive installments");
    if ((existingTurnovers ?? 0) > 0) {
      console.log(`Remedial turnover: already exists for ${account.loanAccountNo}, skipping.`);
      continue;
    }

    const oldestUnpaid = plan.unpaidInstallments[0];
    const confirmedAt = oldestUnpaid
      ? `${addDaysIso(oldestUnpaid.dueDate, 35)}T09:00:00Z`
      : new Date().toISOString();

    if (APPLY) {
      const { error } = await supabase.from("remedial_turnovers").insert({
        masterlist_id: account.masterlistId,
        from_collector_id: account.collectorUserId,
        to_remedial_user_id: account.remedialUserId,
        confirmed_by: arUserId,
        turnover_reason: "Missed 2+ consecutive installments",
        confirmed_at: confirmedAt,
        created_at: confirmedAt,
      });
      if (error) throw new Error(error.message);

      // Partial post-turnover recovery: one small posting after the turnover date.
      const recoveryInstallment = plan.unpaidInstallments[0];
      const scheduleRow = await supabase
        .from("amortization_schedules")
        .select("id, amount_due")
        .eq("masterlist_id", account.masterlistId)
        .eq("installment_no", recoveryInstallment.installmentNo)
        .single();
      if (scheduleRow.data) {
        const recoveredAmount = halfUp(Number(scheduleRow.data.amount_due) * 0.4);
        const postedAt = `${addDaysIso(oldestUnpaid.dueDate, 50)}T10:00:00Z`;

        const { data: recoveryDcr, error: recoveryDcrError } = await supabase
          .from("dcr")
          .insert({
            collector_user_id: account.remedialUserId,
            status: "reconciled",
            submitted_at: postedAt,
            reconciled_by: arUserId,
            reconciled_at: postedAt,
            deposit_reference: `SEED-RECOVERY-${account.loanAccountNo}`,
          })
          .select("id")
          .single();
        if (recoveryDcrError || !recoveryDcr) {
          throw new Error(recoveryDcrError?.message ?? "recovery dcr insert failed");
        }

        const { data: paymentRow, error: paymentError } = await supabase
          .from("payments")
          .insert({
            masterlist_id: account.masterlistId,
            loan_application_id: account.loanApplicationId,
            borrower_id: account.borrowerId,
            reference_no: `SEED-RECOVERY-${account.loanAccountNo}`,
            payment_date: postedAt.slice(0, 10),
            amount: recoveredAmount,
            channel: "bank_deposit",
            status: "posted",
            uploaded_by: account.remedialUserId,
            reviewed_by: arUserId,
            reviewed_at: postedAt,
          })
          .select("id")
          .single();
        if (paymentError || !paymentRow) {
          throw new Error(paymentError?.message ?? "recovery payment insert failed");
        }

        const { error: itemError } = await supabase.from("dcr_items").insert({
          dcr_id: recoveryDcr.id,
          payment_id: paymentRow.id,
          amount: recoveredAmount,
        });
        if (itemError) throw new Error(itemError.message);

        const { error: postingError } = await supabase.from("postings").insert({
          dcr_id: recoveryDcr.id,
          payment_id: paymentRow.id,
          masterlist_id: account.masterlistId,
          amortization_schedule_id: scheduleRow.data.id,
          amount: recoveredAmount,
          posted_by: arUserId,
          posted_at: postedAt,
        });
        if (postingError) throw new Error(postingError.message);

        await supabase
          .from("amortization_schedules")
          .update({ amount_paid: recoveredAmount, status: "partial" })
          .eq("id", scheduleRow.data.id);

        const { data: currentMasterlist, error: mlReadError } = await supabase
          .from("masterlist")
          .select("outstanding_balance")
          .eq("id", account.masterlistId)
          .single();
        if (mlReadError || !currentMasterlist) {
          throw new Error(mlReadError?.message ?? "masterlist re-read failed");
        }
        await supabase
          .from("masterlist")
          .update({
            outstanding_balance: halfUp(
              Number(currentMasterlist.outstanding_balance) - recoveredAmount,
            ),
          })
          .eq("id", account.masterlistId);
      }
    }
    console.log(
      `Remedial turnover: ${APPLY ? "created" : "would create"} for ${account.loanAccountNo} (${plan.bucket}), confirmed ${confirmedAt.slice(0, 10)}`,
    );
  }
}

async function main() {
  const accounts = await fetchDemoAccounts();
  if (!accounts.length) {
    console.log("No demo accounts found matching", DEMO_EMAIL_PATTERN, "— nothing to do.");
    return;
  }

  const { data: arAuthUser } = await supabase.auth.admin.listUsers();
  const arUserId =
    arAuthUser?.users.find((u) => u.email === "ar@loanstar.local")?.id ?? null;
  const agentUserId =
    arAuthUser?.users.find((u) => u.email === "agent@loanstar.local")?.id ?? null;
  if (!arUserId || !agentUserId) {
    throw new Error("Could not resolve ar@loanstar.local / agent@loanstar.local seed users.");
  }

  const plans = buildPlan(accounts);
  printPlan(plans);

  if (!APPLY) {
    console.log("\nDry run only — re-run with --apply to write these changes.");
    return;
  }

  console.log("\nApplying...\n");
  for (const plan of plans) {
    const result = await applyAccount(plan, arUserId);
    console.log(
      `  ${plan.account.loanAccountNo}: aging=${result.agingBucket} outstanding=₱${result.outstandingBalance.toLocaleString("en-PH")}`,
    );
  }

  await seedLeads(agentUserId);
  await seedRemedialTurnovers(plans, arUserId);

  const { data: totals } = await supabase
    .from("masterlist")
    .select("outstanding_balance");
  const totalOutstanding = (totals ?? []).reduce(
    (s, r) => s + Number(r.outstanding_balance ?? 0),
    0,
  );
  console.log(`\nDone. Portfolio-wide outstanding balance is now ₱${totalOutstanding.toLocaleString("en-PH")}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
