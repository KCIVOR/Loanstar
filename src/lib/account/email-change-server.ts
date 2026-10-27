import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import type { EmailChangeDependencies, EmailChangeRequest } from "./email-change";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

/** Only call with the authenticated, active user's server-verified ID. */
export function emailChangeDependencies(userId: string): EmailChangeDependencies {
  const service = createServiceClient();
  return {
    async rpc(action, params) {
      const { data, error } = await service.rpc("account_email_change", { ...params, p_action: action, p_user_id: userId });
      if (error) throw new Error("Email change unavailable");
      return data as EmailChangeRequest | null;
    },
    async sendApproval({ to, newEmail, approvalUrl }) {
      await sendEmail({ to, templateSlug: "account_email_change_current_approval", variables: {
        newEmail: escapeHtml(newEmail), approvalUrl: escapeHtml(approvalUrl),
      } });
    },
    async updateAuthEmail(email) {
      // Explicitly approved current-inbox-only policy: ownership of the new inbox is not verified.
      const { data, error } = await service.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (error) throw error;
      if (data.user?.id !== userId) throw new Error("Unexpected identity response");
      return { email: data.user.email };
    },
    isDefiniteRejection(error) {
      const status = typeof error === "object" && error !== null && "status" in error ? error.status : null;
      return typeof status === "number" && status >= 400 && status < 500 && status !== 408;
    },
  };
}
