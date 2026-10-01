import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

// Older notifications linked here; the account view lives at /loan-file.
export default async function CollectorAccountRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/collector/accounts/${id}/loan-file`);
}
