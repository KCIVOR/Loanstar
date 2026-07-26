import { redirect } from "next/navigation";

/** New lead is a modal on the pipeline — keep this URL as a soft redirect. */
export default function NewLeadRedirectPage() {
  redirect("/agent");
}
