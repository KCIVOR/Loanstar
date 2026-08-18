# Collector Case File — Full Page (UX amendment)

**Date:** 2026-08-17  
**Status:** Approved  
**Parent:** `2026-08-17-collector-remedial-origination-packet-design.md`

## Goal

Replace the Collector Case file **modal** with a dedicated full page so CSA summary, CI report, and attachment checklists are not cramped.

## Decisions

| Decision | Choice |
|---|---|
| Route | `/collector/accounts/[id]/case-file` |
| Navigation | Same tab from Accounts **Case file** button |
| Chrome | Breadcrumbs Accounts → Case file; PageHeader with borrower name |
| Content | Existing `OriginationPacketPanel` (unchanged APIs) |
| Remedial | Unchanged (already inline on account detail) |
| Modal | Remove Case file modal/state from collector accounts list |

## Out of scope

- New collector account-detail page for payments/contacts
- API / permission / RLS changes
- Remedial layout changes
