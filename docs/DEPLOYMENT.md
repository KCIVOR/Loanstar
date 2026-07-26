# LoanStar Deployment Checklist

Use separate Supabase projects and Vercel environments for **dev**, **staging**, and **production**.

## 1. Supabase (per environment)

- [ ] Create project (staging + production)
- [ ] Run all migrations: `supabase db push` (or link + push per project)
- [ ] Confirm **RLS enabled** on every public table
- [ ] Verify storage bucket `loan-documents` policies
- [ ] Enable **Point-in-Time Recovery** (PITR) on production
- [ ] Configure auth: email verification, redirect URLs for each Vercel domain
- [ ] Seed production config: loan types, checklists, roles (via migrations)
- [ ] Bootstrap Super Admin user and assign `super_admin` role

## 2. Vercel

- [ ] Connect repository; create **Preview** (staging) and **Production** envs
- [ ] Set environment variables per env:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only; never expose to client |

- [ ] Deploy staging first; run smoke + E2E against staging URL
- [ ] Production deploy after staging sign-off

## 3. Email (SMTP via Superadmin)

- [ ] Configure Google SMTP (or other provider) under **Superadmin → System Config**
- [ ] Enable transactional email; set **From** to match the mailbox username
- [ ] Test via `/admin/email-test` (generic `test` template, or committee `application_approved` / `application_denied`)
- [ ] Edit Approve/Deny email copy at **Superadmin → Decision Emails** (`/admin/email-templates`); committee Approve sends SMTP + in-app notice
- [ ] Separately configure **Supabase Auth SMTP** in the Supabase dashboard for signup/confirm and password-reset emails

## 4. Pre-production verification

- [ ] `npm run test` — computation F1–F7, BLRI F2, RBAC/trigger QA tests green
- [ ] `npm run test:e2e` against staging (set `PLAYWRIGHT_BASE_URL`)
- [ ] Full lifecycle demo on staging (registration → release → payment → posted)
- [ ] Dry-run backup restore on staging Supabase project

## 5. Post-deploy

- [ ] Confirm Super Admin can access `/admin` and `/reports`
- [ ] Spot-check RLS: agent cannot fetch document bytes; borrower cannot see committee votes
- [ ] Monitor audit log for trigger events on first live transactions
