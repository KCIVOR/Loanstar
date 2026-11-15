"use client";

import { ComponentProps, useCallback, useEffect, useRef, useState } from "react";

import { Alert, Card, ConfirmDialog, Label, Textarea } from "@/components/ui";
import { ComputationPanel, type Computation } from "@/components/csa/ComputationPanel";

type PanelProps = ComponentProps<typeof ComputationPanel>;

type CalculatorData = {
  computation: Computation | null;
  application: {
    segment: PanelProps["segment"];
    collateralType: NonNullable<PanelProps["collateralType"]>;
    paymentSchedule: PanelProps["paymentSchedule"] | null;
  };
  releaseFileStatus: string | null;
  wouldClear: {
    generatedDocuments: number;
    pdcChecks: number;
    briefingAcknowledged: boolean;
  };
};

const STEP_LABEL: Record<string, string> = {
  pdc_encoding: "PDC encoding",
  ready_generate: "document generation",
};

/**
 * The calculator on the LRA release page. LRA can recompute the loan any time
 * before it is marked released. There is no signing step: the new computation
 * is auto-approved under the LRA user and logged with the reason typed here.
 * A recompute clears the PDC checks and generated documents (they carry the
 * old figures), so this card warns first and asks for confirmation.
 */
export function LraCalculatorCard({
  applicationId,
  releasePaths,
  onUpdated,
}: {
  applicationId: string;
  releasePaths: readonly string[];
  onUpdated: () => void;
}) {
  const [data, setData] = useState<CalculatorData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmResolver = useRef<((ok: boolean) => void) | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/lra/applications/${applicationId}/computation`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load the calculator");
        return (await res.json()) as CalculatorData;
      })
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load the calculator",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId, reloadKey]);

  const beforeCompute = useCallback(() => {
    if (!reason.trim()) {
      setReasonError("Enter the reason for this change before recalculating.");
      return Promise.resolve(false);
    }
    setReasonError(null);
    return new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
      setConfirmOpen(true);
    });
  }, [reason]);

  function settleConfirm(ok: boolean) {
    setConfirmOpen(false);
    confirmResolver.current?.(ok);
    confirmResolver.current = null;
  }

  if (loadError) {
    return (
      <Card className="mb-6">
        <Alert variant="error">{loadError}</Alert>
      </Card>
    );
  }
  if (!data) return null;

  const { wouldClear } = data;
  const status = data.releaseFileStatus;
  const returnsTo =
    status && status !== "awaiting_path"
      ? releasePaths.includes("with_pdc")
        ? "pdc_encoding"
        : "ready_generate"
      : null;
  const clearsSomething =
    wouldClear.generatedDocuments > 0 ||
    wouldClear.pdcChecks > 0 ||
    wouldClear.briefingAcknowledged;

  return (
    <Card className="mb-6">
      <h2 className="mb-1 font-display text-lg font-semibold text-navy-900">
        Calculator
      </h2>
      <p className="mb-4 text-sm text-ink-500">
        Change the release date or any loan figure before the loan is released.
        No signature is needed — the change is approved under your name and
        recorded in the audit log.
      </p>

      {clearsSomething ? (
        <div className="mb-4">
          <Alert variant="warning">
            Recalculating removes {wouldClear.generatedDocuments} generated
            document{wouldClear.generatedDocuments === 1 ? "" : "s"} and{" "}
            {wouldClear.pdcChecks} PDC check
            {wouldClear.pdcChecks === 1 ? "" : "s"}
            {wouldClear.briefingAcknowledged ? ", and resets the briefing" : ""}
            {returnsTo ? `. The file goes back to ${STEP_LABEL[returnsTo]}.` : "."}
          </Alert>
        </div>
      ) : null}

      <div className="mb-4">
        <Label htmlFor="lraRecomputeReason" required>
          Reason for change
        </Label>
        <Textarea
          id="lraRecomputeReason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (reasonError) setReasonError(null);
          }}
          placeholder="Why the computation is being changed…"
          rows={2}
        />
        {reasonError ? (
          <p className="mt-1 text-xs text-danger-600">{reasonError}</p>
        ) : null}
      </div>

      <ComputationPanel
        mode="lra"
        applicationId={applicationId}
        loanTypeId={data.computation?.loanTypeId ?? null}
        segment={data.application.segment}
        collateralType={data.application.collateralType}
        editable
        computation={data.computation}
        paymentSchedule={data.application.paymentSchedule ?? undefined}
        extraFields={{ reason: reason.trim() }}
        beforeCompute={beforeCompute}
        onUpdated={() => {
          setReason("");
          setReloadKey((k) => k + 1);
          onUpdated();
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Recalculate this loan?"
        variant="danger"
        confirmLabel="Yes, recalculate"
        cancelLabel="Cancel"
        onCancel={() => settleConfirm(false)}
        onConfirm={() => settleConfirm(true)}
      >
        <div className="kv mb-2">
          <div className="row">
            <span className="k">Generated documents removed</span>
            <span className="v">{wouldClear.generatedDocuments}</span>
          </div>
          <div className="row">
            <span className="k">PDC checks removed</span>
            <span className="v">{wouldClear.pdcChecks}</span>
          </div>
          <div className="row">
            <span className="k">Briefing</span>
            <span className="v">
              {wouldClear.briefingAcknowledged ? "Reset" : "No change"}
            </span>
          </div>
          <div className="row">
            <span className="k">File goes back to</span>
            <span className="v">{returnsTo ? STEP_LABEL[returnsTo] : "No change"}</span>
          </div>
          <div className="row">
            <span className="k">Reason</span>
            <span className="v">{reason.trim()}</span>
          </div>
        </div>
        <p className="text-sm text-ink-500">
          The new computation is approved under your name with no borrower
          signature. This cannot be undone.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
