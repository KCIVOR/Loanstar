"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Badge,
  Button,
  Card,
  cn,
  ConfirmDialog,
  DropdownMenu,
  EmptyState,
  Label,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { BorrowerStatusTimeline } from "@/components/borrower/BorrowerStatusTimeline";
import {
  formatStatusLabel,
  statusBadgeVariant,
} from "@/lib/applications/status";
import {
  borrowerHomeDescription,
  borrowerHomeMode,
  docsUploadPercent,
  formatBlockerLabel,
  nextActionLabel,
  nextStepGuidance,
} from "@/lib/borrowers/home";
import {
  canStartReloan,
  nextApplicationKind,
  RELOAN_TERMINAL_STATUSES,
} from "@/lib/borrowers/reloan";
import type { BorrowerProfile } from "@/lib/borrowers/types";

type Application = {
  id: string;
  applicationNo: string | null;
  status: string;
  statusLabel: string;
  blocker: string | null;
  isReloan: boolean;
  createdAt: string;
  segment: string;
  entityType: string | null;
  loanAmount: number | null;
  loanTypeName: string | null;
  termMonths: number | null;
  interestRate: number | null;
};

type DocsSummary = {
  required: number;
  uploaded: number;
  complete: number;
  percentComplete: number;
};

type LoanSummary = {
  applicationId: string;
  outstanding: number;
  totalLoan: number;
  monthly: number;
  accountStatus: string;
  paidCount: number;
  termCount: number;
  nextDue: { date: string; amount: number } | null;
};

const LOAN_STATUSES = ["released", "closed", "loan_active", "paid_off"];
const HISTORY_PAGE_SIZE = 5;

type StartSegment = "seafarer" | "sme";
type StartEntityType = "individual" | "corporate";

function formatMoney(value: number) {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const KPI_TONES = {
  navy: { background: "var(--navy-50)", color: "var(--navy-700)" },
  teal: { background: "var(--teal-50)", color: "var(--teal-700)" },
  success: { background: "var(--success-bg)", color: "var(--success)" },
  warning: { background: "var(--warning-bg)", color: "var(--warning)" },
  danger: { background: "var(--danger-bg)", color: "var(--danger)" },
} as const;

function Kpi({
  tone,
  icon,
  label,
  value,
  hint,
}: {
  tone: keyof typeof KPI_TONES;
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="kpi flex h-full flex-col">
      <span className="ic" style={KPI_TONES[tone]}>
        {icon}
      </span>
      <div className="k">{label}</div>
      <div className="v leading-tight">{value}</div>
      <div className="d mt-auto pt-2">{hint ?? " "}</div>
    </div>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const IconId = (
  <svg {...iconProps}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="M15 8h4M15 12h4M7 16h10" />
  </svg>
);
const IconFile = (
  <svg {...iconProps}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
  </svg>
);
const IconLayers = (
  <svg {...iconProps}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </svg>
);
const IconCalendar = (
  <svg {...iconProps}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);
const IconDocs = (
  <svg {...iconProps}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6M9 15h6M9 11h6" />
  </svg>
);

export default function BorrowerDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<BorrowerProfile | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loan, setLoan] = useState<LoanSummary | null>(null);
  const [docsSummary, setDocsSummary] = useState<DocsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startAppLoading, setStartAppLoading] = useState(false);
  const [showSegmentPicker, setShowSegmentPicker] = useState(false);
  const [pickerSegment, setPickerSegment] = useState<StartSegment>("seafarer");
  const [pickerEntityType, setPickerEntityType] =
    useState<StartEntityType>("individual");
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState(false);
  const [deleteDraftLoading, setDeleteDraftLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [historyPage, setHistoryPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, appsRes] = await Promise.all([
        fetch("/api/borrower/profile"),
        fetch("/api/borrower/applications"),
      ]);
      if (!profileRes.ok) throw new Error("Failed to load profile");
      if (!appsRes.ok) throw new Error("Failed to load applications");
      const profileData = (await profileRes.json()) as {
        profile: BorrowerProfile;
      };
      const appsData = (await appsRes.json()) as {
        applications: Application[];
      };
      setProfile(profileData.profile);
      const apps = appsData.applications ?? [];
      setApplications(apps);

      const openPipeline =
        apps.find(
          (a) =>
            !(RELOAN_TERMINAL_STATUSES as readonly string[]).includes(
              a.status,
            ) && !LOAN_STATUSES.includes(a.status),
        ) ?? null;

      if (openPipeline) {
        try {
          const checklistRes = await fetch(
            `/api/borrower/applications/${openPipeline.id}/checklist?stage=intake`,
          );
          if (checklistRes.ok) {
            const checklistData = (await checklistRes.json()) as {
              summary: {
                required: number;
                uploaded: number;
                complete: number;
                percentComplete: number;
              };
            };
            setDocsSummary({
              required: checklistData.summary.required,
              uploaded: checklistData.summary.uploaded,
              complete: checklistData.summary.complete,
              percentComplete: checklistData.summary.percentComplete,
            });
          } else {
            setDocsSummary(null);
          }
        } catch {
          setDocsSummary(null);
        }
      } else {
        setDocsSummary(null);
      }

      // Prefer a still-open loan over an already paid-off one — a borrower
      // can carry both (e.g. one paid-off loan plus a newer active one), and
      // picking whichever was created most recently would surface the
      // wrong "current loan" summary once a newer loan happens to be the
      // one that's already closed out.
      const loanApp =
        apps.find(
          (a) => LOAN_STATUSES.includes(a.status) && a.status !== "paid_off",
        ) ?? apps.find((a) => LOAN_STATUSES.includes(a.status));
      if (loanApp) {
        try {
          const loanRes = await fetch(
            `/api/borrower/applications/${loanApp.id}/loan`,
          );
          if (loanRes.ok) {
            const loanData = (await loanRes.json()) as {
              loan: Record<string, unknown> & {
                amortization_schedules?: Array<{
                  installment_no: number;
                  due_date: string;
                  amount_due: number;
                  status: string;
                }>;
              };
            };
            const ml = loanData.loan;
            const schedules = [...(ml.amortization_schedules ?? [])].sort(
              (a, b) => a.installment_no - b.installment_no,
            );
            const next = schedules.find((s) => s.status !== "paid");
            setLoan({
              applicationId: loanApp.id,
              outstanding: Number(ml.outstanding_balance ?? 0),
              totalLoan: Number(ml.total_loan ?? 0),
              monthly: Number(ml.monthly_amortization ?? 0),
              accountStatus: (ml.account_status as string) ?? "active",
              paidCount: schedules.filter((s) => s.status === "paid").length,
              termCount: schedules.length,
              nextDue: next
                ? { date: next.due_date, amount: Number(next.amount_due) }
                : null,
            });
          }
        } catch {
          /* loan panel is progressive enhancement */
        }
      } else {
        setLoan(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * `body` supplies segment/entityType for first and reloan creates. Resume
   * of an existing draft ignores body (API returns early). Omit body only
   * when you intentionally want the API's no-body fallback (inherit/default).
   */
  async function handleStartApplication(body?: {
    segment: StartSegment;
    entityType?: StartEntityType;
  }) {
    setStartAppLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/borrower/applications/reloan", {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(errBody?.error ?? "Failed to start application");
      }
      const json = (await res.json()) as { application: { id: string } };
      setShowSegmentPicker(false);
      router.push(`/borrower/applications/${json.application.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start application",
      );
    } finally {
      setStartAppLoading(false);
    }
  }

  /** Both first and reloan open the segment picker. Reloan prefills from the
   * latest application; first defaults to Seafarer. */
  function handleStartClick() {
    if (appKind === "reloan") {
      const latest = applications[0];
      const segment = latest?.segment === "sme" ? "sme" : "seafarer";
      setPickerSegment(segment);
      setPickerEntityType(
        segment === "sme"
          ? latest?.entityType === "corporate"
            ? "corporate"
            : "individual"
          : "individual",
      );
    } else {
      setPickerSegment("seafarer");
      setPickerEntityType("individual");
    }
    setShowSegmentPicker(true);
  }

  function handleConfirmSegmentPicker() {
    void handleStartApplication(
      pickerSegment === "sme"
        ? { segment: "sme", entityType: pickerEntityType }
        : { segment: "seafarer" },
    );
  }

  const statuses = applications.map((a) => a.status);
  const application =
    applications.find(
      (a) =>
        !(RELOAN_TERMINAL_STATUSES as readonly string[]).includes(a.status),
    ) ?? null;
  const pipelineApp =
    applications.find(
      (a) =>
        !(RELOAN_TERMINAL_STATUSES as readonly string[]).includes(a.status) &&
        !LOAN_STATUSES.includes(a.status),
    ) ?? null;

  async function handleDeleteDraft() {
    if (!pipelineApp || pipelineApp.status !== "draft") return;
    setDeleteDraftLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/borrower/applications/${pipelineApp.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(errBody?.error ?? "Failed to delete draft");
      }
      setConfirmDeleteDraft(false);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete draft",
      );
      setConfirmDeleteDraft(false);
    } finally {
      setDeleteDraftLoading(false);
    }
  }

  const appKind = nextApplicationKind({ applicationStatuses: statuses });
  const canStart = canStartReloan({ applicationStatuses: statuses });
  const startLabel =
    appKind === "reloan" ? "Apply for reloan" : "Start application";
  const mode = borrowerHomeMode({
    hasOpenApplication: pipelineApp != null,
    hasActiveLoan: loan != null,
  });
  const fullyPaid = loan !== null && loan.outstanding <= 0;
  const paidPct = loan?.termCount
    ? Math.round((loan.paidCount / loan.termCount) * 100)
    : 0;
  const docsPct =
    docsSummary && docsSummary.required > 0
      ? docsUploadPercent({
          uploaded: docsSummary.uploaded,
          required: docsSummary.required,
        })
      : null;
  const guidance = pipelineApp
    ? nextStepGuidance({
        status: pipelineApp.status,
        blocker: pipelineApp.blocker,
        docsUploaded: docsSummary?.uploaded,
        docsRequired: docsSummary?.required,
      })
    : null;
  const blockerLabel = formatBlockerLabel(pipelineApp?.blocker);

  /** Past files only — exclude the current open / active loan application. */
  const historySource = applications.filter((app) => {
    if (application && app.id === application.id) return false;
    return true;
  });

  const statusOptions = Array.from(
    new Set(historySource.map((a) => a.status)),
  ).map((status) => ({
    value: status,
    label: formatStatusLabel(status),
  }));

  const filteredHistory = historySource.filter((app) => {
    const matchesStatus =
      historyStatus === "all" || app.status === historyStatus;
    const term = historySearch.trim().toLowerCase();
    const matchesSearch =
      !term ||
      (app.applicationNo?.toLowerCase().includes(term) ?? false) ||
      app.id.toLowerCase().includes(term);
    return matchesStatus && matchesSearch;
  });
  const historyPageCount = Math.max(
    1,
    Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE),
  );
  const safeHistoryPage = Math.min(historyPage, historyPageCount);
  const pagedHistory = filteredHistory.slice(
    (safeHistoryPage - 1) * HISTORY_PAGE_SIZE,
    safeHistoryPage * HISTORY_PAGE_SIZE,
  );

  const statusTone = application
    ? ({
        success: "success",
        warning: "warning",
        danger: "danger",
        teal: "teal",
        navy: "navy",
        neutral: "navy",
      }[statusBadgeVariant(application.status)] as keyof typeof KPI_TONES)
    : "navy";

  return (
    <div>
      <PageHeader
        title={`Welcome, ${profile?.firstName ?? "Borrower"}`}
        description={borrowerHomeDescription(mode)}
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-6">
          <Skeleton variant="line" className="card card-pad" />
          <div className="kpi-grid">
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
            <Skeleton variant="kpi" />
          </div>
        </div>
      ) : (
        <>
          {guidance ? (
            <div className="banner warn mb-6">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0 }}
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <span>
                <b>{guidance.title}</b>
                {" — "}
                {guidance.body}
              </span>
              {pipelineApp ? (
                <span className="sp">
                  <Link href={`/borrower/applications/${pipelineApp.id}`}>
                    {nextActionLabel(pipelineApp.status)}
                  </Link>
                </span>
              ) : null}
            </div>
          ) : null}

          {loan ? (
            <Card variant="gradient" className="mb-6">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div className="min-w-[240px]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
                    Outstanding balance
                  </p>
                  <p className="mono mt-1 text-[34px] font-semibold leading-none tracking-tight">
                    ₱{formatMoney(loan.outstanding)}
                  </p>
                  <div className="mt-3">
                    <Badge variant={fullyPaid ? "success" : "teal"} dot>
                      {fullyPaid ? "Fully paid" : "Active loan"}
                    </Badge>
                  </div>
                  <div className="mt-5 max-w-[320px]">
                    <div className="flex items-center justify-between text-[12px] text-white/60">
                      <span>
                        {loan.paidCount} of {loan.termCount} installments paid
                      </span>
                      <span className="mono">{paidPct}%</span>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 overflow-hidden rounded-full"
                      style={{ background: "rgba(255,255,255,0.15)" }}
                    >
                      <div
                        className="h-full rounded-full bg-teal-400 transition-[width]"
                        style={{ width: `${paidPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <div className="min-w-[150px] rounded-[var(--r-md)] bg-white/10 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
                      Monthly
                    </p>
                    <p className="mono mt-1 text-lg font-semibold">
                      ₱{formatMoney(loan.monthly)}
                    </p>
                  </div>
                  <div className="min-w-[150px] rounded-[var(--r-md)] bg-white/10 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
                      Next payment
                    </p>
                    <p className="mono mt-1 text-lg font-semibold">
                      {loan.nextDue ? formatDate(loan.nextDue.date) : "—"}
                    </p>
                    {loan.nextDue ? (
                      <p className="mono mt-1 text-sm text-teal-300">
                        ₱{formatMoney(loan.nextDue.amount)}
                      </p>
                    ) : null}
                  </div>
                  <div className="min-w-[150px] rounded-[var(--r-md)] bg-white/10 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
                      Total loan
                    </p>
                    <p className="mono mt-1 text-lg font-semibold">
                      ₱{formatMoney(loan.totalLoan)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 border-t border-white/10 pt-4">
                <Link href={`/borrower/applications/${loan.applicationId}`}>
                  <Button variant="secondary" size="sm">
                    {fullyPaid ? "View loan record" : "View loan & pay"}
                  </Button>
                </Link>
              </div>
            </Card>
          ) : null}

          <div className="kpi-grid">
            <Kpi
              tone="navy"
              icon={IconId}
              label="Borrower number"
              value={profile?.borrowerNo ?? "—"}
              hint="Your permanent ID"
            />
            <Kpi
              tone={statusTone}
              icon={IconFile}
              label="Current application"
              value={
                application
                  ? (application.statusLabel ??
                    formatStatusLabel(application.status))
                  : "None"
              }
              hint={
                application?.applicationNo ? (
                  <span className="mono">{application.applicationNo}</span>
                ) : application ? (
                  "No application no. yet"
                ) : (
                  "Start when ready"
                )
              }
            />
            <Kpi
              tone={
                docsPct != null
                  ? docsPct >= 100
                    ? "success"
                    : "warning"
                  : "teal"
              }
              icon={docsPct != null ? IconDocs : IconLayers}
              label={docsPct != null ? "Documents uploaded" : "Total applications"}
              value={
                docsPct != null && docsSummary
                  ? `${docsSummary.uploaded}/${docsSummary.required}`
                  : applications.length
              }
              hint={
                docsPct != null
                  ? `${docsPct}% of required intake docs`
                  : "All time"
              }
            />
            <Kpi
              tone={loan?.nextDue ? "warning" : "navy"}
              icon={IconCalendar}
              label={loan?.nextDue ? "Amount due next" : "Monthly amortization"}
              value={
                loan
                  ? `₱${formatMoney(loan.nextDue ? loan.nextDue.amount : loan.monthly)}`
                  : "—"
              }
              hint={
                loan?.nextDue
                  ? `Due ${formatDate(loan.nextDue.date)}`
                  : loan
                    ? "No payment due"
                    : "No active loan"
              }
            />
          </div>

          {pipelineApp ? (
            <Card className="mt-6 overflow-x-auto">
              <div className="mb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-semibold text-navy-900">
                    Application progress
                  </h2>
                  <Badge variant={statusBadgeVariant(pipelineApp.status)} dot>
                    {pipelineApp.statusLabel ??
                      formatStatusLabel(pipelineApp.status)}
                  </Badge>
                </div>
                {blockerLabel ? (
                  <p className="mt-2 max-w-full break-words text-sm leading-snug text-ink-700">
                    <span className="font-medium text-warning">Hold reason:</span>{" "}
                    {blockerLabel}
                  </p>
                ) : null}
              </div>

              <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-[var(--r-md)] border border-line-soft bg-surface-2/80 px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-400">
                    Application no.
                  </div>
                  <div className="mono mt-1 text-sm font-semibold text-ink-900">
                    {pipelineApp.applicationNo ?? "Pending assignment"}
                  </div>
                </div>
                <div className="rounded-[var(--r-md)] border border-line-soft bg-surface-2/80 px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-400">
                    Filed
                  </div>
                  <div className="mono mt-1 text-sm font-semibold text-ink-900">
                    {formatDate(pipelineApp.createdAt)}
                  </div>
                </div>
                <div className="rounded-[var(--r-md)] border border-line-soft bg-surface-2/80 px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-400">
                    Loan type
                  </div>
                  <div className="mt-1 text-sm font-semibold text-ink-900">
                    {pipelineApp.loanTypeName ??
                      (pipelineApp.isReloan ? "Reloan" : "New loan")}
                  </div>
                </div>
                <div className="rounded-[var(--r-md)] border border-line-soft bg-surface-2/80 px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-400">
                    Principal
                  </div>
                  <div className="mono mt-1 text-sm font-semibold text-ink-900">
                    {pipelineApp.loanAmount != null
                      ? `₱${formatMoney(pipelineApp.loanAmount)}`
                      : "Not computed yet"}
                  </div>
                </div>
              </div>

              {docsSummary && docsSummary.required > 0 ? (
                <div className="mb-5">
                  <div className="prog-lbl">
                    <span>Intake documents</span>
                    <b>
                      {docsSummary.uploaded}/{docsSummary.required} · {docsPct}%
                    </b>
                  </div>
                  <div className="prog">
                    <i style={{ width: `${docsPct ?? 0}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-ink-400">
                    {docsSummary.complete} confirmed by staff ·{" "}
                    {Math.max(docsSummary.required - docsSummary.uploaded, 0)}{" "}
                    still missing
                  </p>
                </div>
              ) : null}

              <BorrowerStatusTimeline currentStatus={pipelineApp.status} />
              <div className="mt-5 flex flex-wrap gap-3 border-t border-[var(--line-soft)] pt-4">
                <Link href={`/borrower/applications/${pipelineApp.id}`}>
                  <Button size="sm">
                    {nextActionLabel(pipelineApp.status)}
                  </Button>
                </Link>
                {pipelineApp.status === "draft" ? (
                  <Button
                    variant="danger-soft"
                    size="sm"
                    onClick={() => setConfirmDeleteDraft(true)}
                  >
                    Delete draft
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : loan && !fullyPaid ? null : (
            <Card className="mt-6">
              <EmptyState
                title="No active application"
                description={
                  appKind === "reloan"
                    ? "Start a reloan when you are ready, or wait for CSA to open a file on your behalf."
                    : "When you are ready, start your first loan application. CSA can also open a file for you."
                }
                showMark={false}
                action={
                  canStart.ok ? (
                    <Button loading={startAppLoading} onClick={handleStartClick}>
                      {startLabel}
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          )}

          {historySource.length ? (
            <div className="mt-8 rounded-[var(--r-lg)] border border-line-soft bg-surface-2/50 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-navy-900">
                  Loan history
                </h2>
                <span className="text-[13px] text-ink-500">
                  {historySource.length} past application
                  {historySource.length === 1 ? "" : "s"}
                </span>
              </div>

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
                      placeholder="Search this table"
                      value={historySearch}
                      onChange={(e) => {
                        setHistorySearch(e.target.value);
                        setHistoryPage(1);
                      }}
                    />
                  </div>

                  <DropdownMenu
                    trigger={
                      <span
                        className={cn(
                          "fchip",
                          historyStatus !== "all" && "is-on",
                        )}
                      >
                        {historyStatus === "all" ? (
                          <>
                            Filter
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M22 3H2l8 9.46V19l4 2v-8.54Z" />
                            </svg>
                          </>
                        ) : (
                          <>
                            Status:{" "}
                            <b>{formatStatusLabel(historyStatus)}</b>
                            <span
                              className="x"
                              onClick={(e) => {
                                e.stopPropagation();
                                setHistoryStatus("all");
                                setHistoryPage(1);
                              }}
                            >
                              ×
                            </span>
                          </>
                        )}
                      </span>
                    }
                    items={[
                      {
                        label: "All statuses",
                        onClick: () => {
                          setHistoryStatus("all");
                          setHistoryPage(1);
                        },
                      },
                      ...statusOptions.map((opt) => ({
                        label: opt.label,
                        onClick: () => {
                          setHistoryStatus(opt.value);
                          setHistoryPage(1);
                        },
                      })),
                    ]}
                  />
                </div>

                {filteredHistory.length ? (
                  <>
                    <div className="tbl-wrap">
                      <Table>
                        <thead>
                          <tr>
                            <Th>Application</Th>
                            <Th>Type</Th>
                            <Th num>Amount</Th>
                            <Th>Status</Th>
                            <Th>Filed</Th>
                            <Th className="w-1">{""}</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedHistory.map((app) => (
                            <tr key={app.id}>
                              <Td>
                                <span className="id">
                                  {app.applicationNo ?? app.id.slice(0, 8)}
                                </span>
                              </Td>
                              <Td>{app.isReloan ? "Reloan" : "New loan"}</Td>
                              <Td num>
                                {app.loanAmount != null
                                  ? formatMoney(app.loanAmount)
                                  : "—"}
                              </Td>
                              <Td>
                                <Badge
                                  variant={statusBadgeVariant(app.status)}
                                  dot
                                >
                                  {app.statusLabel ??
                                    formatStatusLabel(app.status)}
                                </Badge>
                              </Td>
                              <Td>{formatDate(app.createdAt)}</Td>
                              <Td>
                                <Link href={`/borrower/applications/${app.id}`}>
                                  <Button variant="secondary" size="sm">
                                    Open
                                  </Button>
                                </Link>
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>

                    <Pagination
                      page={safeHistoryPage}
                      pageCount={historyPageCount}
                      onPageChange={setHistoryPage}
                      summary={`Showing ${
                        pagedHistory.length
                          ? (safeHistoryPage - 1) * HISTORY_PAGE_SIZE + 1
                          : 0
                      }–${
                        (safeHistoryPage - 1) * HISTORY_PAGE_SIZE +
                        pagedHistory.length
                      } of ${filteredHistory.length}`}
                    />
                  </>
                ) : (
                  <EmptyState
                    title="No matching applications"
                    description="Try a different search term or status filter."
                    showMark={false}
                  />
                )}
              </div>
            </div>
          ) : null}
        </>
      )}

      <Modal
        open={showSegmentPicker}
        title={startLabel}
        onClose={() => setShowSegmentPicker(false)}
        footer={
          <Button
            loading={startAppLoading}
            onClick={handleConfirmSegmentPicker}
          >
            Continue
          </Button>
        }
      >
        <p className="mb-4 text-sm text-ink-500">
          Choose the type of loan you are applying for. This cannot be
          changed after you start.
        </p>
        <div className="grid gap-4">
          <div>
            <Label htmlFor="start-segment">Loan segment</Label>
            <Select
              id="start-segment"
              value={pickerSegment}
              onChange={(e) =>
                setPickerSegment(e.target.value as StartSegment)
              }
            >
              <option value="seafarer">Seafarer</option>
              <option value="sme">SME (Small &amp; Medium Enterprise)</option>
            </Select>
          </div>
          {pickerSegment === "sme" ? (
            <div>
              <Label htmlFor="start-entity-type" required>
                Entity type
              </Label>
              <Select
                id="start-entity-type"
                value={pickerEntityType}
                onChange={(e) =>
                  setPickerEntityType(e.target.value as StartEntityType)
                }
                required
              >
                <option value="individual">Individual</option>
                <option value="corporate">Corporate</option>
              </Select>
            </div>
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDeleteDraft}
        title="Delete this draft application?"
        message="This cannot be undone. Any documents you uploaded with this draft will be removed too."
        confirmLabel="Delete draft"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleteDraftLoading}
        onConfirm={() => void handleDeleteDraft()}
        onCancel={() => setConfirmDeleteDraft(false)}
      />
    </div>
  );
}
