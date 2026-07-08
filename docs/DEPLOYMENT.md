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
| `RESEND_API_KEY` | Transactional email |
| `EMAIL_FROM` | Verified sender domain |

- [ ] Deploy staging first; run smoke + E2E against staging URL
- [ ] Production deploy after staging sign-off

## 3. Email (Resend)

- [ ] Add and verify sending domain (DKIM/SPF)
- [ ] Test denial + key transition templates via `/admin/email-test`

## 4. Pre-production verification

- [ ] `npm run test` — computation F1–F7, BLRI F2, RBAC/trigger QA tests green
- [ ] `npm run test:e2e` against staging (set `PLAYWRIGHT_BASE_URL`)
- [ ] Full lifecycle demo on staging (registration → release → payment → posted)
- [ ] Dry-run backup restore on staging Supabase project

## 5. Post-deploy

- [ ] Confirm Super Admin can access `/admin` and `/reports`
- [ ] Spot-check RLS: agent cannot fetch document bytes; borrower cannot see committee votes
- [ ] Monitor audit log for trigger events on first live transactions
