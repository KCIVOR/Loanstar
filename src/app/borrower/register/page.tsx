import { redirect } from "next/navigation";

/** Legacy URL — registration lives at `/register`. */
export default function BorrowerRegisterRedirectPage() {
  redirect("/register");
}
