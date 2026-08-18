"use client";

import { useParams } from "next/navigation";

import { RecordPaymentPage } from "@/components/payments/RecordPaymentPage";

export default function RemedialRecordPaymentPage() {
  const params = useParams();
  return (
    <RecordPaymentPage
      desk="remedial"
      masterlistId={params.id as string}
    />
  );
}
