# Document Needs Revision Implementation Plan

> **For agentic workers:** Implement task-by-task. Spec: `docs/superpowers/specs/2026-07-23-document-needs-revision-design.md`

**Goal:** CSA can request document revision with remarks, put app On Hold, borrower replaces; Clear hold + endorse hard lock while on hold.

**Architecture:** Extend `documents` status + `revision_remarks`; request-revision API reuses hold side effects; clear-hold restores prior status; `getEndorseReadiness` blocks `on_hold`; shared `DocumentChecklist` shows remarks / Request revision.

**Tech Stack:** Next.js App Router, Supabase, existing DocumentChecklist / CSA hold patterns.

---

### Task 1: Migration + checklist types/summary
### Task 2: Hold helper + request-revision + clear-hold APIs
### Task 3: Endorse on_hold lock + upload clears remarks
### Task 4: DocumentChecklist UI + CSA wiring
### Task 5: Tests green + manual smoke
