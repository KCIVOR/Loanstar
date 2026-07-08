# LoanStar Operations Runbook

## Backup and restore

**Supabase (recommended)**

1. Production: enable PITR in project settings
2. Restore: Supabase Dashboard → Database → Backups → restore to new project or point-in-time
3. After restore: update Vercel env vars if project URL/keys changed
4. Run dry-run on staging before any production restore

**Manual export**

- AR masterlist: `/ar` → Export CSV
- Audit log: Admin → Audit (API export if needed)

## User deactivation

1. **Admin → Users** — set user inactive (or remove role assignments)
2. Confirm `user_roles` rows removed for departed staff
3. Collector/Remedial dashboards should no longer show their assignments
4. Audit log retains historical `actor_id` references

## Common incidents

| Symptom | Check |
|---|---|
| Endorse button disabled | Intake checklist, NCL, signed computation |
| Release blocked | Borrower briefing sign-off, PDC path |
| Payment not "Paid" | Must go DCR → AR reconcile (borrower upload alone never sets Paid) |
| Collector sees no accounts | AR assignment on masterlist detail page |

## Post-launch backlog (deferred)

- In-app chat
- SMS / Text Brigade
- Multi-branch
- Real e-signature integration
- External integrations (NFIS, banks, POEA, Marina)
- Non-happy-path flows (cancellation, restructuring, buyout)
- Advanced penalty/legal beyond config (spec G7 Phase 2)

## Support contacts

Document client-specific escalation paths here after handover.
