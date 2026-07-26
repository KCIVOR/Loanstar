import { createServiceClient } from "@/lib/supabase/server";

import {
  asConfigBoolean,
  asConfigString,
} from "./config-mask";
import { normalizePhMobile } from "./phone";

export type SendSmsInput = {
  to: string;
  body: string;
};

export type SendSmsResult =
  | { status: "sent"; sid: string; to: string }
  | { status: "skipped"; reason: string };

/**
 * Send an SMS via Twilio Messages API (no SDK).
 * No-ops when `sms_enabled` is false.
 */
export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const supabase = createServiceClient();
  const { data: rows, error } = await supabase
    .from("config_settings")
    .select("key, value")
    .in("key", [
      "sms_enabled",
      "twilio_account_sid",
      "twilio_auth_token",
      "twilio_from_number",
    ]);

  if (error) {
    throw new Error(`Failed to load SMS config: ${error.message}`);
  }

  const map = new Map(
    (rows ?? []).map((r) => [r.key as string, r.value as unknown]),
  );

  const enabled = asConfigBoolean(map.get("sms_enabled"), false);
  if (!enabled) {
    console.info("[sms] skipped — sms_enabled is false");
    return { status: "skipped", reason: "sms_enabled is false" };
  }

  const accountSid = asConfigString(map.get("twilio_account_sid")).trim();
  const authToken = asConfigString(map.get("twilio_auth_token")).trim();
  const from = asConfigString(map.get("twilio_from_number")).trim();

  if (!accountSid || !authToken || !from) {
    throw new Error("Twilio credentials are incomplete");
  }

  const to = normalizePhMobile(input.to);
  if (!to) {
    throw new Error("Invalid Philippine mobile number");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const body = new URLSearchParams({
    To: to,
    From: from,
    Body: input.body,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = (await res.json().catch(() => null)) as {
    sid?: string;
    message?: string;
    error_message?: string;
  } | null;

  if (!res.ok) {
    throw new Error(
      payload?.message ??
        payload?.error_message ??
        `Twilio error HTTP ${res.status}`,
    );
  }

  return {
    status: "sent",
    sid: payload?.sid ?? "",
    to,
  };
}
