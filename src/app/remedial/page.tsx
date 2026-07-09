"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge, Card, PageHeader, Spinner } from "@/components/ui";

type Account = {
  id: string;
  borrower_name: string;
  loan_account_no: string | null;
  outstanding_balance: number;
  aging_bucket: string;
};

export default function RemedialDashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/remedial/accounts");
      if (res.ok) {
        const data = (await res.json()) as { accounts: Account[] };
        setAccounts(data.accounts);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Remedial accounts"
        description="Accounts turned over from collection (91+ days aging)."
      />

      {accounts.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">No remedial accounts assigned.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => (
            <Card key={acc.id}>
              <p className="font-medium text-ink">
                {acc.borrower_name}
                <span className="ml-2 font-mono text-sm font-normal text-ink-muted">
                  {acc.loan_account_no}
                </span>
              </p>
              <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
                {"Balance "}
                <span className="font-mono">
                  {Number(acc.outstanding_balance).toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}
                </span>
                <Badge variant="danger">{acc.aging_bucket}</Badge>
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
