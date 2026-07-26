import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail } from "@/lib/email/send";
import { shouldSendChannel } from "@/lib/notifications/should-send-channel";
import { sendSms } from "@/lib/sms/send";

import {
  REMINDER_LOOKAHEAD_DAYS,
  addDaysIso,
  buildPaymentReminderSms,
  pickUpcomingInstallment,
  toDateOnly,
  type ReminderScheduleRow,
} from "./reminder-scan";

export type ReminderSendResult = {
  masterlistId: string;
  installmentNo?: number;
  status: "sent" | "skipped";
  channels?: Array<"email" | "sms">;
  reason?: string;
};

export type RunRemindersOptions = {
  /** Limit to these masterlist IDs (collector manual send). Omit = all current. */
  masterlistIds?: string[];
  /** Collector user id for contact log on email (manual path). */
  collectorUserId?: string;
  /** Allow re-sending channels already in reminder_log (updates row, flags is_resend). */
  resend?: boolean;
  asOf?: Date;
};

type AccountRow = {
  id: string;
  loan_account_no: string | null;
  borrower_name: string;
  aging_bucket: string;
  amortization_schedules:
    | Array<{
        installment_no: number;
        due_date: string;
        amount_due: number;
        status: string;
      }>
    | {
        installment_no: number;
        due_date: string;
        amount_due: number;
        status: string;
      }
    | null;
  borrowers:
    | {
        email?: string | null;
        mobile_phone?: string | null;
        user_id?: string | null;
      }
    | Array<{
        email?: string | null;
        mobile_phone?: string | null;
        user_id?: string | null;
      }>
    | null;
};

async function alreadyLogged(
  supabase: SupabaseClient,
  masterlistId: string,
  installmentNo: number,
  channel: "email" | "sms",
): Promise<boolean> {
  const { data } = await supabase
    .from("reminder_log")
    .select("id")
    .eq("masterlist_id", masterlistId)
    .eq("installment_no", installmentNo)
    .eq("channel", channel)
    .maybeSingle();
  return Boolean(data?.id);
}

async function recordReminderLog(
  supabase: SupabaseClient,
  masterlistId: string,
  installmentNo: number,
  channel: "email" | "sms",
  resend: boolean,
): Promise<void> {
  if (resend) {
    const { error } = await supabase.from("reminder_log").upsert(
      {
        masterlist_id: masterlistId,
        installment_no: installmentNo,
        channel,
        sent_at: new Date().toISOString(),
        is_resend: true,
      },
      { onConflict: "masterlist_id,installment_no,channel" },
    );
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("reminder_log").insert({
    masterlist_id: masterlistId,
    installment_no: installmentNo,
    channel,
    is_resend: false,
  });
  if (error) {
    // Unique violation = already sent — treat as skip at caller
    if (error.code === "23505") return;
    throw new Error(error.message);
  }
}

/**
 * Scan current-bucket accounts for installments due within 7 days and send
 * email + SMS (when enabled), logging each channel once per installment.
 */
export async function runPaymentDueReminders(
  supabase: SupabaseClient,
  options: RunRemindersOptions = {},
): Promise<{
  sent: number;
  skipped: number;
  results: ReminderSendResult[];
}> {
  const asOf = options.asOf ?? new Date();
  const todayStr = toDateOnly(asOf);
  const windowEnd = addDaysIso(asOf, REMINDER_LOOKAHEAD_DAYS);
  const resend = options.resend === true;

  let query = supabase
    .from("masterlist")
    .select(
      `
      id, loan_account_no, borrower_name, aging_bucket,
      amortization_schedules ( installment_no, due_date, amount_due, status ),
      borrowers ( email, mobile_phone, user_id )
    `,
    )
    .eq("aging_bucket", "current");

  if (options.masterlistIds && options.masterlistIds.length > 0) {
    query = query.in("id", options.masterlistIds);
  }

  const { data: accounts, error } = await query;
  if (error) throw new Error(error.message);

  const results: ReminderSendResult[] = [];

  for (const account of (accounts ?? []) as AccountRow[]) {
    const schedulesRaw = Array.isArray(account.amortization_schedules)
      ? account.amortization_schedules
      : account.amortization_schedules
        ? [account.amortization_schedules]
        : [];

    const schedules: ReminderScheduleRow[] = schedulesRaw.map((s) => ({
      installmentNo: Number(s.installment_no),
      dueDate: s.due_date as string,
      amountDue: Number(s.amount_due),
      status: s.status as string,
    }));

    const upcoming = pickUpcomingInstallment(schedules, todayStr, windowEnd);
    if (!upcoming) continue;

    const borrowerRaw = account.borrowers;
    const borrower = Array.isArray(borrowerRaw) ? borrowerRaw[0] : borrowerRaw;
    const email = borrower?.email?.trim() || null;
    const mobile = borrower?.mobile_phone?.trim() || null;
    const borrowerUserId = borrower?.user_id ?? null;

    const channelsSent: Array<"email" | "sms"> = [];
    const skipReasons: string[] = [];

    // --- email ---
    const emailLogged = await alreadyLogged(
      supabase,
      account.id,
      upcoming.installmentNo,
      "email",
    );
    if (emailLogged && !resend) {
      skipReasons.push("email already logged");
    } else if (!email) {
      skipReasons.push("No email on file");
    } else {
      const emailPref = await shouldSendChannel(
        supabase,
        borrowerUserId,
        "email",
      );
      if (!emailPref.allowed) {
        skipReasons.push(emailPref.reason ?? "email preference off");
      } else {
        try {
          await sendEmail({
            to: email,
            templateSlug: "payment_due_reminder",
            variables: {
              borrower_name: account.borrower_name,
              loan_account_no: account.loan_account_no ?? "",
              due_date: upcoming.dueDate,
              amount_due: upcoming.amountDue.toFixed(2),
            },
          });
          await recordReminderLog(
            supabase,
            account.id,
            upcoming.installmentNo,
            "email",
            resend,
          );
          if (options.collectorUserId) {
            await supabase.from("collector_contacts").insert({
              masterlist_id: account.id,
              collector_user_id: options.collectorUserId,
              contact_type: "email",
              notes: `Due-date reminder for installment #${upcoming.installmentNo}`,
            });
          }
          channelsSent.push("email");
        } catch (err) {
          skipReasons.push(
            err instanceof Error ? err.message : "Email send failed",
          );
        }
      }
    }

    // --- sms ---
    const smsLogged = await alreadyLogged(
      supabase,
      account.id,
      upcoming.installmentNo,
      "sms",
    );
    if (smsLogged && !resend) {
      skipReasons.push("sms already logged");
    } else if (!mobile) {
      skipReasons.push("No mobile on file");
    } else {
      const smsPref = await shouldSendChannel(supabase, borrowerUserId, "sms");
      if (!smsPref.allowed) {
        skipReasons.push(smsPref.reason ?? "sms preference off");
      } else {
        try {
          const smsResult = await sendSms({
            to: mobile,
            body: buildPaymentReminderSms({
              borrowerName: account.borrower_name,
              loanAccountNo: account.loan_account_no ?? "",
              dueDate: upcoming.dueDate,
              amountDue: upcoming.amountDue.toFixed(2),
            }),
          });
          if (smsResult.status === "sent") {
            await recordReminderLog(
              supabase,
              account.id,
              upcoming.installmentNo,
              "sms",
              resend,
            );
            if (options.collectorUserId) {
              await supabase.from("collector_contacts").insert({
                masterlist_id: account.id,
                collector_user_id: options.collectorUserId,
                contact_type: "sms",
                notes: `Due-date SMS reminder for installment #${upcoming.installmentNo}`,
              });
            }
            channelsSent.push("sms");
          } else {
            skipReasons.push(smsResult.reason);
          }
        } catch (err) {
          skipReasons.push(
            err instanceof Error ? err.message : "SMS send failed",
          );
        }
      }
    }

    if (channelsSent.length > 0) {
      results.push({
        masterlistId: account.id,
        installmentNo: upcoming.installmentNo,
        status: "sent",
        channels: channelsSent,
        reason: skipReasons.length ? skipReasons.join("; ") : undefined,
      });
    } else {
      results.push({
        masterlistId: account.id,
        installmentNo: upcoming.installmentNo,
        status: "skipped",
        reason: skipReasons.join("; ") || "Nothing to send",
      });
    }
  }

  return {
    sent: results.filter((r) => r.status === "sent").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  };
}
