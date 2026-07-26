"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  Td,
  Th,
  cn,
} from "@/components/ui";
import { ContactLogModal } from "@/components/collector/ContactLogModal";
import { DemandLetterModal } from "@/components/collector/DemandLetterModal";
import {
  agingNeedsAttention,
  nextOpenInstallment,
  type ScheduleLite,
} from "@/lib/collector/desk";
import {
  agingVariant,
  formatDate,
  formatMoney,
} from "@/lib/collector/format";

type LastContact = {
  contactType: string;
  callbackAt: string | null;
  createdAt: string;
};

type Account = {
  id: string;
  borrower_name: string;
  loan_account_no: string | null;
  outstanding_balance: number;
  aging_bucket: string;
  amortization_schedules?: ScheduleLite[] | ScheduleLite | null;
  lastContact?: LastContact | null;
};

function callbackDue(contact: LastContact | null | undefined): boolean {
  if (!contact?.callbackAt) return false;
  return new Date(contact.callbackAt).getTime() < Date.now();
}

const PAGE_SIZE = 10;
type AccountSort = "priority" | "balance" | "borrower" | "due";

function schedulesOf(account: Account): ScheduleLite[] {
  const raw = account.amortization_schedules;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

export default function CollectorAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [agingFilter, setAgingFilter] = useState("all");
  const [sortKey, setSortKey] = useState<AccountSort>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [contactModalFor, setContactModalFor] = useState<Account | null>(null);
  const [demandModalFor, setDemandModalFor] = useState<Account | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/collector/accounts");
      if (!res.ok) throw new Error("Failed to load accounts");
      const data = (await res.json()) as { accounts: Account[] };
      setAccounts(data.accounts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const agingOptions = useMemo(
    () =>
      Array.from(
        new Set(accounts.map((a) => a.aging_bucket).filter(Boolean)),
      ).map((bucket) => ({ value: bucket, label: bucket })),
    [accounts],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return accounts.filter((row) => {
      if (agingFilter !== "all" && row.aging_bucket !== agingFilter) {
        return false;
      }
      if (!term) return true;
      return (
        row.borrower_name.toLowerCase().includes(term) ||
        (row.loan_account_no?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [accounts, search, agingFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "balance") {
        return (
          dir *
          (Number(a.outstanding_balance) - Number(b.outstanding_balance))
        );
      }
      if (sortKey === "borrower") {
        return dir * a.borrower_name.localeCompare(b.borrower_name);
      }
      if (sortKey === "due") {
        const aDue = nextOpenInstallment(schedulesOf(a))?.due_date ?? "9999";
        const bDue = nextOpenInstallment(schedulesOf(b))?.due_date ?? "9999";
        return dir * aDue.localeCompare(bDue);
      }
      const aCallback = callbackDue(a.lastContact) ? 0 : 1;
      const bCallback = callbackDue(b.lastContact) ? 0 : 1;
      if (aCallback !== bCallback) return aCallback - bCallback;
      const aFlag = agingNeedsAttention(a.aging_bucket) ? 0 : 1;
      const bFlag = agingNeedsAttention(b.aging_bucket) ? 0 : 1;
      if (aFlag !== bFlag) return aFlag - bFlag;
      return Number(b.outstanding_balance) - Number(a.outstanding_balance);
    });
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort(key: AccountSort) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "borrower" || key === "due" ? "asc" : "desc");
    }
    setPage(1);
  }

  function sortArrow(key: AccountSort) {
    if (sortKey !== key) return null;
    return <span className="arr">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Assigned accounts"
        description="Borrowers in your collection portfolio."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {accounts.length === 0 ? (
        <EmptyState
          title="No accounts assigned"
          description="Assigned borrower accounts will appear here."
          showMark={false}
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          <div className="tbl-toolbar">
            <div className="gsearch" style={{ maxWidth: 280 }}>
              <span className="icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </span>
              <input
                className="input"
                style={{
                  height: 36,
                  paddingRight: 12,
                  borderRadius: "var(--r-md)",
                }}
                placeholder="Search borrower or account"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className={cn("fchip", agingFilter === "all" && "on")}
                onClick={() => {
                  setAgingFilter("all");
                  setPage(1);
                }}
              >
                All aging
              </button>
              {agingOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={cn("fchip", agingFilter === opt.value && "on")}
                  onClick={() => {
                    setAgingFilter(opt.value);
                    setPage(1);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="tbl-wrap">
            <Table>
              <thead>
                <tr>
                  <Th>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort("borrower")}
                    >
                      Borrower {sortArrow("borrower")}
                    </button>
                  </Th>
                  <Th>Account</Th>
                  <Th num>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort("balance")}
                    >
                      Balance {sortArrow("balance")}
                    </button>
                  </Th>
                  <Th>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort("priority")}
                    >
                      Aging {sortArrow("priority")}
                    </button>
                  </Th>
                  <Th>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort("due")}
                    >
                      Next due {sortArrow("due")}
                    </button>
                  </Th>
                  <Th>Last contact</Th>
                  <Th className="w-1">{""}</Th>
                </tr>
              </thead>
              <tbody>
                {paged.map((acc) => {
                  const next = nextOpenInstallment(schedulesOf(acc));
                  const overdueCallback = callbackDue(acc.lastContact);
                  return (
                    <tr key={acc.id}>
                      <Td className="font-medium text-ink-900">
                        {acc.borrower_name}
                      </Td>
                      <Td className="mono">{acc.loan_account_no ?? "—"}</Td>
                      <Td num className="mono text-teal-600">
                        {formatMoney(Number(acc.outstanding_balance))}
                      </Td>
                      <Td>
                        <Badge variant={agingVariant(acc.aging_bucket)}>
                          {acc.aging_bucket}
                        </Badge>
                      </Td>
                      <Td>
                        {next ? (
                          <span className="text-sm">
                            <span className="mono">
                              {formatDate(next.due_date)}
                            </span>
                            <span className="text-ink-500">
                              {" · "}₱
                              {formatMoney(
                                next.amount_due + next.penalty_amount,
                              )}
                            </span>
                          </span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </Td>
                      <Td>
                        {overdueCallback ? (
                          <Badge variant="danger">Callback due</Badge>
                        ) : acc.lastContact ? (
                          <span className="text-sm text-ink-500">
                            {acc.lastContact.contactType}{" "}
                            {formatDate(acc.lastContact.createdAt)}
                          </span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setDemandModalFor(acc)}
                          >
                            Demand letter
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setContactModalFor(acc)}
                          >
                            Log contact
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          {sorted.length > PAGE_SIZE ? (
            <Pagination
              page={safePage}
              pageCount={pageCount}
              onPageChange={setPage}
            />
          ) : null}
        </div>
      )}

      {contactModalFor ? (
        <ContactLogModal
          open={contactModalFor !== null}
          borrowerName={contactModalFor.borrower_name}
          masterlistId={contactModalFor.id}
          onClose={() => setContactModalFor(null)}
          onLogged={() => void load()}
        />
      ) : null}

      {demandModalFor ? (
        <DemandLetterModal
          open={demandModalFor !== null}
          borrowerName={demandModalFor.borrower_name}
          masterlistId={demandModalFor.id}
          onClose={() => setDemandModalFor(null)}
        />
      ) : null}
    </div>
  );
}
