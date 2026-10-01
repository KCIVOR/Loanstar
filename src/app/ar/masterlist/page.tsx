import { redirect } from "next/navigation";

// Older notifications linked here; the masterlist itself lives at /ar.
export default function ArMasterlistRedirect() {
  redirect("/ar");
}
