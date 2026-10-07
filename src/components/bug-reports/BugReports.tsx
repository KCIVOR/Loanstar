"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Image from "next/image";

import { Badge, Button, Card, Input, Label, PageHeader } from "@/components/ui";
import { BUG_IMAGE_MAX_BYTES, BUG_IMAGE_MAX_COUNT } from "@/lib/bug-reports/images";

type Report = {
  id: string;
  reporter_id: string;
  title: string;
  description: string;
  expected_behavior: string;
  location: string;
  error_message: string | null;
  severity: "low" | "medium" | "high";
  status: "open" | "in_progress" | "resolved" | "closed";
  resolution_note: string | null;
  created_at: string;
  reporter?: { full_name: string | null; email: string } | null;
  bug_report_images: Array<{ id: string; file_name: string }>;
};

const emptyForm = {
  title: "",
  description: "",
  expected_behavior: "",
  location: "",
  error_message: "",
  severity: "medium" as Report["severity"],
};

export function BugReports({ admin = false }: { admin?: boolean }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [images, setImages] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<Report["status"]>("open");
  const [resolutionNote, setResolutionNote] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/bug-reports", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not load reports");
        if (active) setReports(body.reports);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load reports");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function addImages(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (images.length + selected.length > BUG_IMAGE_MAX_COUNT) {
      setError("You can attach up to three images.");
      return;
    }
    if (selected.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size === 0 || file.size > BUG_IMAGE_MAX_BYTES)) {
      setError("Use JPEG, PNG, or WebP images of 5 MB or less each.");
      return;
    }
    setError("");
    setImages((current) => [...current, ...selected]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, value));
      images.forEach((image) => payload.append("images", image));
      const response = await fetch("/api/bug-reports", { method: "POST", body: payload });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not submit report");
      setReports((current) => [body.report, ...current]);
      setForm(emptyForm);
      setImages([]);
      setSuccess("Your report has been sent to the admin queue.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit report");
    } finally {
      setSaving(false);
    }
  }

  async function saveStatus() {
    if (!selectedId) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/bug-reports/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolution_note: resolutionNote }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not update report");
      setReports((current) => current.map((report) => report.id === selectedId ? { ...report, ...body.report } : report));
      setSuccess("Report updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update report");
    } finally {
      setSaving(false);
    }
  }

  const selected = reports.find((report) => report.id === selectedId);
  const fieldClass = "textarea w-full";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={admin ? "Bug reports" : "Report a bug"}
        description={admin ? "Review issues reported across Loanstar." : "Tell us what happened. You can track your reports below."}
      />
      {error && <p role="alert" className="rounded-lg border border-danger-line bg-danger-bg p-3 text-[13px] text-danger">{error}</p>}
      {success && <p role="status" className="rounded-lg border border-success-line bg-success-bg p-3 text-[13px] text-success">{success}</p>}

      {!admin && (
        <form onSubmit={(event) => void submit(event)} className="card card-pad space-y-5">
          <h2 className="font-display text-lg font-semibold text-navy-900">Describe the issue</h2>
          <div><Label htmlFor="bug-title" required>Issue title</Label>
            <Input id="bug-title" required minLength={3} maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </div>
          <div><Label htmlFor="bug-location" required>Where did it happen?</Label>
            <Input id="bug-location" required minLength={2} maxLength={200} placeholder="Page or task you were using" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
          </div>
          <div><Label htmlFor="bug-description" required>What happened?</Label>
            <textarea id="bug-description" required minLength={10} maxLength={5000} rows={4} className={fieldClass} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </div>
          <div><Label htmlFor="bug-expected" required>What did you expect?</Label>
            <textarea id="bug-expected" required minLength={3} maxLength={5000} rows={3} className={fieldClass} value={form.expected_behavior} onChange={(event) => setForm({ ...form, expected_behavior: event.target.value })} />
          </div>
          <div><Label htmlFor="bug-error">Error message</Label>
            <textarea id="bug-error" maxLength={3000} rows={2} className={fieldClass} value={form.error_message} onChange={(event) => setForm({ ...form, error_message: event.target.value })} />
          </div>
          <div><Label htmlFor="bug-severity" required>Severity</Label>
            <select id="bug-severity" className="select w-full" value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value as Report["severity"] })}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </div>
          <div>
            <Label htmlFor="bug-images">Screenshots</Label>
            <p className="mb-2 text-[12px] text-ink-500">Optional · up to 3 JPEG, PNG, or WebP images · 5 MB each</p>
            <input ref={fileInput} id="bug-images" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addImages} className="sr-only" />
            <Button type="button" variant="outline" disabled={images.length >= BUG_IMAGE_MAX_COUNT} onClick={() => fileInput.current?.click()}>Add images</Button>
            {images.length > 0 && <ul className="mt-3 space-y-2">{images.map((image, index) => <li key={`${image.name}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-line-soft bg-surface-2 px-3 py-2 text-[13px] text-ink-700"><span className="min-w-0 truncate">{image.name}</span><button type="button" className="shrink-0 font-semibold text-teal-700 hover:underline" onClick={() => setImages((current) => current.filter((_, i) => i !== index))}>Remove</button></li>)}</ul>}
          </div>
          <Button type="submit" loading={saving}>Submit bug report</Button>
        </form>
      )}

      <Card>
        <h2 className="mb-4 font-display text-lg font-semibold text-navy-900">{admin ? "All reports" : "My reports"}</h2>
        {loading ? <p className="text-[13px] text-ink-500">Loading reports…</p> : reports.length === 0 ? <p className="text-[13px] text-ink-500">No reports yet.</p> : <div className="divide-y divide-line-soft">{reports.map((report) => (
          <button key={report.id} type="button" onClick={() => { setSelectedId(report.id); setStatus(report.status); setResolutionNote(report.resolution_note ?? ""); }} className="flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left transition-colors hover:bg-surface-2">
            <span className="min-w-0"><span className="block font-semibold text-navy-900">{report.title}</span><span className="block text-[12px] text-ink-500">{report.location} · {new Date(report.created_at).toLocaleDateString()}{admin && report.reporter ? ` · ${report.reporter.full_name || report.reporter.email}` : ""}</span></span>
            <span className="flex items-center gap-2"><Badge variant={report.status === "resolved" ? "success" : report.status === "in_progress" ? "info" : report.status === "open" ? "warning" : "neutral"}>{report.status.replace("_", " ")}</Badge><Badge variant={report.severity === "high" ? "danger" : report.severity === "medium" ? "warning" : "neutral"}>{report.severity}</Badge></span>
          </button>
        ))}</div>}
      </Card>

      {selected && <Card>
        <div className="mb-4 flex items-start justify-between gap-4"><h2 className="font-display text-lg font-semibold text-navy-900">{selected.title}</h2><Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>Close</Button></div>
        <dl className="space-y-3 text-[13px] text-ink-700"><div><dt className="font-semibold">Location</dt><dd>{selected.location}</dd></div><div><dt className="font-semibold">What happened</dt><dd className="whitespace-pre-wrap">{selected.description}</dd></div><div><dt className="font-semibold">Expected behavior</dt><dd className="whitespace-pre-wrap">{selected.expected_behavior}</dd></div>{selected.error_message && <div><dt className="font-semibold">Error message</dt><dd className="whitespace-pre-wrap">{selected.error_message}</dd></div>}{selected.resolution_note && !admin && <div><dt className="font-semibold">Admin note</dt><dd className="whitespace-pre-wrap">{selected.resolution_note}</dd></div>}</dl>
        {selected.bug_report_images?.length > 0 && <div className="mt-5"><h3 className="mb-2 text-[13px] font-semibold text-ink-700">Screenshots</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{selected.bug_report_images.map((image) => { const src = `/api/bug-reports/${selected.id}/images/${image.id}`; return <a key={image.id} href={src} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-line-soft bg-surface-2"><Image src={src} alt={image.file_name} width={360} height={220} unoptimized className="h-32 w-full object-contain" /><span className="block truncate px-2 py-1 text-[11px] text-ink-500">{image.file_name}</span></a>; })}</div></div>}
        {admin && <div className="mt-5 space-y-4 border-t border-line-soft pt-5"><div><Label htmlFor="bug-status">Status</Label><select id="bug-status" className="select w-full" value={status} onChange={(event) => setStatus(event.target.value as Report["status"])}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></div><div><Label htmlFor="bug-resolution">Resolution note</Label><textarea id="bug-resolution" maxLength={3000} rows={3} className={fieldClass} value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} /></div><Button loading={saving} onClick={() => void saveStatus()}>Save update</Button></div>}
      </Card>}
    </div>
  );
}
