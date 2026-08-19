import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function CollectorCaseFileRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/collector/accounts/${id}/loan-file`);
}
