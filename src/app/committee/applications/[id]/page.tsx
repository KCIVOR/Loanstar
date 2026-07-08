"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Input,
  Label,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from "@/components/admin/ui";
import { formatStatusLabel } from "@/lib/applications/status";

type CommitteeDetail = {
  application: {
    id: string;
    applicationNo: string | null;
    status: string;
    statusLabel: string;
    canDecide: boolean;
    canOverride: boolean;
  };
  borrower: {
    borrowerNo: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  verification: {
    finding: string | null;
    findingNotes: string | null;
    forwardedAt: string | null;
  } | null;
  computation: {
    id: string;
    inputMode: string;
    inputAmount: number;
    principal: number;
    netReleased: number;
    monthlyAmortization: number;
    lineItems: Array<{ label: string; amount: number }>;
    terms: number;
    addonMonths: number;
    signedAt: string | null;
    loanTypeName: string | null;
  } | null;
  votes: Array<{ voterId: string; vote: "approve" | "deny"; votedAt: string }>;
  tally: {
    approve: number;
    deny: number;
    label: string | null;
    hasMajority: boolean;
  };
  myVote: "approve" | "deny" | null;
  latestAction: {
    action: string;
    comment: string | null;
    actedAt: string;
  } | null;
  negotiation: {
    status: string;
    approvedAmount: number | null;
    currentAmount: number | null;
    lastCounterAmount: number | null;
    lastCounterBy: string | null;
  } | null;
  tatDays: number | null;
};

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function CommitteeApplicationPage() {
  const params = useParams();
  const applicationId = params.id as string;

  const [data, setData] = useState<CommitteeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [revisitComment, setRevisitComment] = useState("");
  const [revisitRoute, setRevisitRoute] = useState<"csa" | "cig">("csa");
  const [holdComment, setHoldComment] = useState("");
  const [confirmAction, setConfirmAction] = useState<"approve" | "deny" | null>(
    null,
  );
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideMode, setOverrideMode] = useState("NET_SARADO");
  const [overrideTerms, setOverrideTerms] = useState("6");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/committee/applications/${applicationId}`);
      if (!res.ok) throw new Error("Failed to load application");
      setData((await res.json()) as CommitteeDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleVote(vote: "approve" | "deny") {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/committee/applications/${applicationId}/vote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vote }),
        },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Vote failed");
      setMessage(`Vote recorded: ${vote}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleAction(
    action: "approve" | "deny" | "revisit" | "hold",
  ) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const payload: Record<string, string> = { action };
      if (action === "revisit") {
        payload.comment = revisitComment;
        payload.revisitRoute = revisitRoute;
      }
      if (action === "hold") {
        payload.comment = holdComment;
      }

      const res = await fetch(
        `/api/committee/applications/${applicationId}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await res.json()) as { error?: string; status?: string };
      if (!res.ok) throw new Error(body.error ?? "Action failed");
      setMessage(`Final action recorded: ${action}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleOverride(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/committee/applications/${applicationId}/override`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: Number(overrideAmount),
            inputMode: overrideMode,
            terms: Number(overrideTerms),
          }),
        },
      );
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Override failed");
      setMessage("Committee override saved — borrower must re-sign.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Override failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (!data) return <Alert>Application not found.</Alert>;

  return (
    <div>
      <PageHeader
        title={
          data.borrower
            ? `${data.borrower.firstName} ${data.borrower.lastName}`
            : "Application"
        }
        description={
          data.application.applicationNo ??
          formatStatusLabel(data.application.status)
        }
        actions={
          <Link href="/committee">
            <Button variant="secondary">Back to queue</Button>
          </Link>
        }
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {message ? (
        <div className="mb-4">
          <Alert variant="success">{message}</Alert>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-neutral-500">Status</p>
          <p className="font-semibold text-neutral-900">
            {data.application.statusLabel}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-500">TAT (since CIG forward)</p>
          <p className="font-semibold text-neutral-900">
            {data.tatDays != null ? `${data.tatDays} day(s)` : "—"}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-neutral-500">Vote tally (informational)</p>
          <p className="font-semibold text-neutral-900">
            {data.tally.label ??
              `${data.tally.approve} approve · ${data.tally.deny} deny`}
          </p>
        </Card>
      </div>

      {data.computation ? (
        <Card className="mb-6">
          <h2 className="mb-3 text-lg font-semibold text-neutral-900">
            Computation
          </h2>
          <p className="mb-2 text-sm text-neutral-600">
            {data.computation.loanTypeName ?? "Loan"} · Net released{" "}
            {formatMoney(data.computation.netReleased)}
          </p>
          <div className="grid gap-1 sm:grid-cols-2">
            {data.computation.lineItems.slice(0, 6).map((item) => (
              <div
                key={item.label}
                className="flex justify-between text-sm text-neutral-700"
              >
                <span>{item.label}</span>
                <span className="tabular-nums">{formatMoney(item.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {data.application.canDecide ? (
        <>
          <Card className="mb-6">
            <h2 className="mb-4 text-lg font-semibold text-neutral-900">Your vote</h2>
            <p className="mb-3 text-sm text-neutral-600">
              {data.myVote
                ? `You voted: ${data.myVote}`
                : "Cast your vote (informational — final action is separate)."}
            </p>
            <div className="flex gap-2">
              <Button
                disabled={saving}
                onClick={() => void handleVote("approve")}
              >
                Vote Approve
              </Button>
              <Button
                variant="secondary"
                disabled={saving}
                onClick={() => void handleVote("deny")}
              >
                Vote Deny
              </Button>
            </div>
          </Card>

          <Card className="mb-6">
            <h2 className="mb-4 text-lg font-semibold text-neutral-900">
              Final action
            </h2>
            <p className="mb-3 text-sm text-neutral-600">
              Final actions are binding and recorded on the file — you will be
              asked to confirm.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={saving} onClick={() => setConfirmAction("approve")}>
                Approve loan
              </Button>
              <Button
                variant="danger"
                disabled={saving}
                onClick={() => setConfirmAction("deny")}
              >
                Deny loan
              </Button>
            </div>

            <ConfirmDialog
              open={confirmAction !== null}
              title={
                confirmAction === "approve"
                  ? "Approve this loan?"
                  : "Deny this loan?"
              }
              message={
                confirmAction === "approve"
                  ? `This records the final committee approval for ${
                      data.borrower
                        ? `${data.borrower.firstName} ${data.borrower.lastName}`
                        : "this application"
                    } and moves the file forward to negotiation and release. This cannot be undone from this screen.`
                  : `This records the final committee denial for ${
                      data.borrower
                        ? `${data.borrower.firstName} ${data.borrower.lastName}`
                        : "this application"
                    }. This cannot be undone from this screen.`
              }
              confirmLabel={
                confirmAction === "approve" ? "Yes, approve" : "Yes, deny"
              }
              variant={confirmAction === "approve" ? "primary" : "danger"}
              loading={saving}
              onCancel={() => setConfirmAction(null)}
              onConfirm={() => {
                if (!confirmAction) return;
                void handleAction(confirmAction).then(() =>
                  setConfirmAction(null),
                );
              }}
            />

            <div className="mt-6 space-y-3 border-t border-neutral-100 pt-4">
              <Label htmlFor="holdComment">Hold comment</Label>
              <Input
                id="holdComment"
                value={holdComment}
                onChange={(e) => setHoldComment(e.target.value)}
                placeholder="Reason for hold"
              />
              <Button
                variant="secondary"
                disabled={!holdComment.trim() || saving}
                onClick={() => void handleAction("hold")}
              >
                Confirm hold
              </Button>
            </div>

            <form
              className="mt-6 space-y-3 border-t border-neutral-100 pt-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleAction("revisit");
              }}
            >
              <h3 className="font-medium text-neutral-900">Notice to Revisit</h3>
              <Label htmlFor="revisitRoute">Route to</Label>
              <Select
                id="revisitRoute"
                value={revisitRoute}
                onChange={(e) =>
                  setRevisitRoute(e.target.value as "csa" | "cig")
                }
              >
                <option value="csa">CSA (intake)</option>
                <option value="cig">CIG (verification)</option>
              </Select>
              <Label htmlFor="revisitComment">Comment (required)</Label>
              <Textarea
                id="revisitComment"
                value={revisitComment}
                onChange={(e) => setRevisitComment(e.target.value)}
                rows={3}
                required
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={!revisitComment.trim() || saving}
              >
                Send Notice to Revisit
              </Button>
            </form>
          </Card>
        </>
      ) : null}

      {data.application.canOverride && data.negotiation ? (
        <Card className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-neutral-900">
            Negotiation override
          </h2>
          <p className="mb-4 text-sm text-neutral-600">
            Borrower counter:{" "}
            {data.negotiation.lastCounterAmount != null
              ? formatMoney(data.negotiation.lastCounterAmount)
              : "—"}
          </p>
          <form onSubmit={(e) => void handleOverride(e)} className="space-y-3">
            <div>
              <Label htmlFor="overrideAmount">Override amount</Label>
              <Input
                id="overrideAmount"
                type="number"
                step="0.01"
                value={overrideAmount}
                onChange={(e) => setOverrideAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="overrideMode">Input mode</Label>
              <Select
                id="overrideMode"
                value={overrideMode}
                onChange={(e) => setOverrideMode(e.target.value)}
              >
                <option value="NET_SARADO">Net Sarado</option>
                <option value="NET_LESS_SECURITY">Net Less Security</option>
                <option value="PRINCIPAL">Principal</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="overrideTerms">Terms (months)</Label>
              <Input
                id="overrideTerms"
                type="number"
                value={overrideTerms}
                onChange={(e) => setOverrideTerms(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={saving}>
              Apply override &amp; send to borrower
            </Button>
          </form>
        </Card>
      ) : null}

      {data.latestAction ? (
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-neutral-900">
            Latest committee action
          </h2>
          <p className="text-sm text-neutral-700">
            {data.latestAction.action} ·{" "}
            {new Date(data.latestAction.actedAt).toLocaleString()}
          </p>
          {data.latestAction.comment ? (
            <p className="mt-2 text-sm text-neutral-600">
              {data.latestAction.comment}
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
