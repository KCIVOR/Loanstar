"use client";

/* Meridian component gallery — Phase 0 exit criteria.
   Renders every shared primitive for side-by-side comparison with
   docs/LoanStar_Meridian_Design_System_v1.1_1.html. Not linked from app nav. */

import { useState } from "react";

import {
  Accordion,
  Alert,
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Chip,
  ConfirmDialog,
  DocumentRow,
  DropdownMenu,
  EmptyState,
  FileDropzone,
  Input,
  KpiCard,
  Label,
  LoanStarMark,
  Modal,
  PageHeader,
  Pagination,
  Progress,
  QueueListItem,
  Radio,
  SegmentedControl,
  Select,
  Skeleton,
  Spinner,
  StatusBadge,
  Stepper,
  Table,
  Td,
  Textarea,
  Th,
  Toast,
  Toggle,
  Tooltip,
} from "@/components/ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 first:mt-0">
      <h2 className="font-display text-[22px] font-bold text-navy-900">{title}</h2>
      <div className="relative mb-6 mt-3 h-px bg-line before:absolute before:-top-0.5 before:left-0 before:h-[5px] before:w-14 before:rounded-[3px] before:bg-teal-600 before:content-['']" />
      {children}
    </section>
  );
}

function Demo({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-4 rounded-[var(--r-lg)] border p-6 ${
        dark ? "border-navy-800 bg-navy-900" : "border-line bg-surface"
      }`}
    >
      {children}
    </div>
  );
}

export default function DesignGalleryPage() {
  const [seg, setSeg] = useState<"all" | "active" | "delinquent">("all");
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("semi");
  const [toggled, setToggled] = useState(true);
  const [chipOn, setChipOn] = useState(true);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <main className="mx-auto max-w-[1080px] px-8 py-12">
      <PageHeader
        title="Meridian — Component Gallery"
        description="Phase 0 exit criteria: every shared primitive rendered against the reference."
        actions={<Badge variant="teal">v1.1</Badge>}
      />

      <Section title="Buttons">
        <Demo>
          <Button variant="primary">Primary</Button>
          <Button variant="accent">Accent · Approve</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="danger-soft">Danger · Soft</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="primary" loading>
            Loading
          </Button>
        </Demo>
        <Demo>
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
          <SegmentedControl
            value={seg}
            onChange={setSeg}
            options={[
              { value: "all", label: "All loans" },
              { value: "active", label: "Active" },
              { value: "delinquent", label: "Delinquent" },
            ]}
          />
        </Demo>
      </Section>

      <Section title="Form Inputs">
        <Demo>
          <div className="field">
            <Label required>Borrower name</Label>
            <Input placeholder="e.g. Juan R. Dela Cruz" />
            <span className="help">As it appears on the seafarer&apos;s book.</span>
          </div>
          <div className="field is-error">
            <Label required>Contact number</Label>
            <Input defaultValue="0917-123" />
            <span className="err">Enter a valid 11-digit mobile number.</span>
          </div>
          <div className="field">
            <Label>Employer / manning agency</Label>
            <Input placeholder="Disabled while verifying" disabled />
          </div>
        </Demo>
        <Demo>
          <div className="field">
            <Label>Loan amount</Label>
            <div className="affix">
              <span className="add">₱</span>
              <Input mono defaultValue="150,000.00" />
            </div>
          </div>
          <div className="field">
            <Label>Interest rate</Label>
            <div className="affix">
              <Input mono className="lead" defaultValue="4.50" />
              <span className="add">% / mo</span>
            </div>
          </div>
          <div className="field">
            <Label>Loan product</Label>
            <Select defaultValue="sf">
              <option value="sf">SF Loan — Standard</option>
              <option value="aa">Allotment Advance</option>
              <option value="re">Reloan</option>
            </Select>
          </div>
        </Demo>
        <Demo>
          <div className="field basis-full">
            <Label>Remarks</Label>
            <Textarea placeholder="Notes for the credit committee…" />
          </div>
        </Demo>
        <Demo>
          <div className="flex flex-col gap-3">
            <Checkbox
              checked={checked}
              onChange={setChecked}
              label="Complete requirements"
              description="All documents verified by CIG"
            />
            <Checkbox checked={false} onChange={() => {}} label="Co-maker attached" />
          </div>
          <div className="flex flex-col gap-3">
            <Radio
              name="sched"
              value="semi"
              checked={radio === "semi"}
              onChange={setRadio}
              label="Semi-monthly"
              description="Deducted every 15th & 30th"
            />
            <Radio
              name="sched"
              value="monthly"
              checked={radio === "monthly"}
              onChange={setRadio}
              label="Monthly"
              description="Deducted every end of month"
            />
          </div>
          <div className="flex flex-col gap-3.5">
            <Toggle checked={toggled} onChange={setToggled} label="Email notifications" />
            <Toggle checked={false} onChange={() => {}} label="SMS reminders" />
          </div>
        </Demo>
      </Section>

      <Section title="Badges & Status">
        <Demo>
          <Badge variant="neutral" dot>
            Draft
          </Badge>
          <Badge variant="navy" dot>
            Pending review
          </Badge>
          <Badge variant="warning" dot>
            For committee
          </Badge>
          <Badge variant="teal" dot>
            Approved
          </Badge>
          <Badge variant="success" dot>
            Released
          </Badge>
          <Badge variant="danger" dot>
            Delinquent
          </Badge>
          <Badge variant="solid">New</Badge>
          <StatusBadge active />
          <StatusBadge active={false} />
          <Chip selected={chipOn} onClick={() => setChipOn(!chipOn)}>
            Status: <b>Active</b>
          </Chip>
          <Chip selected={false} onClick={() => {}}>
            Branch
          </Chip>
        </Demo>
      </Section>

      <Section title="Alerts, Toasts & Tooltips">
        <div className="mb-4 flex flex-col gap-3">
          <Alert variant="info" title="Verification in progress">
            The CIG is confirming this borrower&apos;s contract with the manning agency.
          </Alert>
          <Alert variant="success" title="Loan released">
            ₱150,000.00 was credited to the borrower&apos;s nominated account on Jul 8, 2026.
          </Alert>
          <Alert variant="warning" title="Payment due soon">
            Amortization of ₱16,875.00 is due on Jul 15, 2026.
          </Alert>
          <Alert variant="error" title="Account delinquent">
            2 missed amortizations. This account is now endorsed to Collections.
          </Alert>
        </div>
        <Demo>
          <Toast
            title="Application submitted"
            message="LN-2026-004518 is now pending review."
            onClose={() => {}}
          />
          <Toast variant="error" title="Posting failed" message="Ledger rejected the entry." onClose={() => {}} />
          <div className="pt-8">
            <Tooltip content="Effective rate incl. service fee">
              <Button variant="outline" size="sm">
                Hover target
              </Button>
            </Tooltip>
          </div>
        </Demo>
      </Section>

      <Section title="Cards & Data">
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <KpiCard label="Total portfolio" value="₱48.2M" delta={{ direction: "up", text: "6.4% vs last month" }} />
          <KpiCard label="Active loans" value="1,284" delta={{ direction: "up", text: "32 new this month" }} />
          <KpiCard label="Delinquency rate" value="2.1%" alert delta={{ direction: "down", text: "0.3 pts vs last month" }} />
        </div>
        <Demo>
          <Card className="w-full max-w-[420px]">
            <div className="mb-2.5 font-display font-semibold text-navy-900">Loan summary</div>
            <div className="kv">
              <div className="row">
                <span className="k">Reference</span>
                <span className="v mono">LN-2026-004518</span>
              </div>
              <div className="row">
                <span className="k">Principal</span>
                <span className="v mono">₱150,000.00</span>
              </div>
              <div className="row">
                <span className="k">Status</span>
                <span className="v">
                  <Badge variant="success" dot>
                    Active
                  </Badge>
                </span>
              </div>
            </div>
          </Card>
          <Card variant="kpi" className="w-full max-w-[280px]">
            <div className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-navy-200">
              Monthly amortization
            </div>
            <div className="mono mt-2 text-[26px] font-semibold text-teal-400">₱21,750.00</div>
          </Card>
        </Demo>
        <div className="mb-4">
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Borrower</Th>
                <Th num>Principal</Th>
                <Th num>Balance</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td className="id">LN-2026-004518</Td>
                <Td>
                  <Avatar initials="JD" name="Juan Dela Cruz" subtitle="MV Pacific Star" size="sm" />
                </Td>
                <Td num>150,000.00</Td>
                <Td num>108,750.00</Td>
                <Td>
                  <Badge variant="success" dot>
                    Active
                  </Badge>
                </Td>
              </tr>
              <tr>
                <Td className="id">LN-2026-004471</Td>
                <Td>
                  <Avatar initials="RS" name="Ramon Santos" subtitle="MV Coral Queen" size="sm" />
                </Td>
                <Td num>80,000.00</Td>
                <Td num>52,300.00</Td>
                <Td>
                  <Badge variant="danger" dot>
                    Delinquent
                  </Badge>
                </Td>
              </tr>
            </tbody>
          </Table>
        </div>
        <Demo>
          <Avatar initials="KC" size="sm" />
          <Avatar initials="JD" />
          <Avatar initials="MR" size="lg" teal />
          <LoanStarMark />
          <div className="w-full max-w-[420px]">
            <Progress value={4} max={10} label="Repayment progress" />
          </div>
          <div className="w-full max-w-[420px]">
            <Progress value={92} label="Credit limit used" tone="warn" />
          </div>
        </Demo>
        <Demo>
          <div className="w-[280px]">
            <Skeleton />
          </div>
          <div className="w-[320px]">
            <Skeleton variant="list-row" />
          </div>
          <Spinner label="Computing amortization…" className="!py-0" />
        </Demo>
        <div className="mb-4">
          <EmptyState
            title="No applications yet"
            description="New loan applications from the borrower portal will appear here once submitted."
            action={
              <Button variant="accent" size="sm">
                Create application
              </Button>
            }
          />
        </div>
        <QueueListItem
          href="#"
          title="Juan Dela Cruz"
          subtitle="LN-2026-004518"
          meta={
            <>
              <span>SF Loan · ₱150,000 · 10 months</span>
              <Badge variant="warning" dot>
                For committee
              </Badge>
            </>
          }
        />
      </Section>

      <Section title="Navigation">
        <Demo>
          <Breadcrumbs
            items={[
              { label: "Loans", href: "#" },
              { label: "Applications", href: "#" },
              { label: "LN-2026-004518" },
            ]}
          />
        </Demo>
        <Demo>
          <div className="tabs">
            <button className="tab is-active">Details</button>
            <button className="tab">
              Documents<span className="cnt">6</span>
            </button>
            <button className="tab">Payment schedule</button>
          </div>
        </Demo>
        <Demo>
          <Pagination page={page} pageCount={18} onPageChange={setPage} summary="Showing 1–20 of 356" />
        </Demo>
      </Section>

      <Section title="Overlays">
        <Demo>
          <Button onClick={() => setModalOpen(true)}>Open modal</Button>
          <Button variant="danger-soft" onClick={() => setConfirmOpen(true)}>
            Open confirm
          </Button>
          <DropdownMenu
            trigger={<Button variant="outline">Actions ▾</Button>}
            items={[
              { label: "View details", onClick: () => {} },
              { label: "Edit application", onClick: () => {} },
              { label: "Cancel application", onClick: () => {}, danger: true },
            ]}
          />
        </Demo>
        <Modal
          open={modalOpen}
          title="Release loan proceeds?"
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="accent" onClick={() => setModalOpen(false)}>
                Release funds
              </Button>
            </>
          }
        >
          <p className="mb-3.5">
            You are about to release funds for <b className="mono text-[13px]">LN-2026-004518</b>. This
            action posts to the ledger and cannot be undone.
          </p>
          <div className="kv">
            <div className="row">
              <span className="k">Net proceeds</span>
              <span className="v mono">₱142,750.00</span>
            </div>
            <div className="row">
              <span className="k">Release channel</span>
              <span className="v">Bank transfer · BDO</span>
            </div>
          </div>
        </Modal>
        <ConfirmDialog
          open={confirmOpen}
          title="Delete this draft application?"
          message="Draft DR-2026-000231 and its 3 attached files will be permanently removed."
          variant="danger"
          confirmLabel="Delete draft"
          cancelLabel="Keep draft"
          onConfirm={() => setConfirmOpen(false)}
          onCancel={() => setConfirmOpen(false)}
        />
      </Section>

      <Section title="Stepper & Timeline">
        <Demo>
          <Stepper
            steps={[
              { label: "Application", description: "Submitted", state: "done" },
              { label: "Verification", description: "CIG cleared", state: "done" },
              { label: "Committee", description: "2 of 3 votes", state: "current" },
              { label: "Approval", description: "Pending", state: "todo" },
              { label: "Release", description: "Pending", state: "todo" },
            ]}
          />
        </Demo>
        <Demo>
          <div className="tl">
            <div className="tl-item done">
              <span className="pt">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <div className="tl-h">
                <b>Application submitted</b>
                <span className="when">Jul 02, 2026 · 09:14</span>
              </div>
              <p>Borrower completed the SF Loan application with all required documents attached.</p>
              <div className="by">
                by <b>Juan Dela Cruz</b> · Borrower portal
              </div>
            </div>
            <div className="tl-item cur">
              <span className="pt" />
              <div className="tl-h">
                <b>Committee review in progress</b>
                <span className="when">Jul 08, 2026 · 16:25</span>
              </div>
              <p>Two approvals recorded. Awaiting final committee member&apos;s vote.</p>
            </div>
            <div className="tl-item">
              <span className="pt" />
              <div className="tl-h">
                <b style={{ color: "var(--ink-400)" }}>Release of proceeds</b>
                <span className="when">Pending</span>
              </div>
            </div>
          </div>
        </Demo>
      </Section>

      <Section title="Files & Documents">
        <div className="mb-4 flex max-w-[520px] flex-col gap-3.5">
          <FileDropzone hint="PDF, JPG, or PNG up to 10 MB · Contract, allotment slip, valid IDs" />
          <DocumentRow
            title="employment_contract.pdf"
            subtitle="2.4 MB · uploaded Jul 02"
            status="confirmed"
            fileType="pdf"
          />
          <DocumentRow
            title="allotment_slip_jun2026.jpg"
            subtitle="1.1 MB · re-upload requested"
            status="required"
            fileType="jpg"
            action={
              <Button variant="outline" size="sm">
                Upload
              </Button>
            }
          />
        </div>
        <Accordion
          defaultOpenId="a"
          items={[
            {
              id: "a",
              title: "How is my monthly amortization computed?",
              children:
                "Principal plus flat add-on interest for the full term, divided by the number of months.",
            },
            {
              id: "b",
              title: "Can I pay off my loan early?",
              children: "Yes — request an early settlement quote from your account officer.",
            },
          ]}
        />
      </Section>
    </main>
  );
}
