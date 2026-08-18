"use client";

import { useParams } from "next/navigation";

import { RecordPaymentPage } from "@/components/payments/RecordPaymentPage";

export default function CollectorRecordPaymentPage() {
  const params = useParams();
  return (
    <RecordPaymentPage
      desk="collector"
      masterlistId={params.id as string}
    />
  );
}
