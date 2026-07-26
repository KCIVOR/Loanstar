# Meridian Email Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a reusable Meridian-branded HTML email shell and update `application_denied`, `application_approved`, and `test` templates in code + live DB.

**Architecture:** `buildMeridianEmailHtml` (table + inline styles, logo + wordmark). Default bodies built via helper; SQL migration UPDATEs `email_templates.body_html`; apply to remote.

**Tech Stack:** TypeScript, Supabase `email_templates`, `BRANDING.logoUrl`, node:test.

**Spec:** `docs/superpowers/specs/2026-07-24-meridian-email-shell-design.md`

**DO NOT git commit unless the user explicitly asks.**

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/email/meridian-layout.ts` | Shared shell builder |
| `src/lib/email/meridian-default-bodies.ts` | Deny / approve / test inner+full HTML via helper |
| `src/lib/email/__tests__/meridian-layout.test.mts` | Unit tests |
| `supabase/migrations/20260724150000_meridian_email_shell.sql` | UPDATE three templates |
| Apply via MCP `apply_migration` | Live DB |

---

### Task 1: Layout helper + tests (TDD)
### Task 2: Default template bodies module
### Task 3: Migration SQL + apply to remote
### Task 4: Verify `npm test` + checklist
