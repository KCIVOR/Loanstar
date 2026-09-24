# UAT demo data — complete inventory

**Written:** 2026-09-22 · Source: all 110 "Test data" + "Starting condition" rows in `Loanstar-System-UAT-POL006.docx`, cross-checked against the live database (project `acopcwlhkovssjnrqygk`).

The doc's "Test data" column mixes four different kinds of thing. Seeding only makes sense for one of them, so everything below is tagged:

| Tag | Meaning |
|---|---|
| **SEED** | Must exist in the database before UAT starts |
| **TYPED** | The tester types it during the test — do not seed |
| **FILE** | A file that must be on the tester's own machine |
| **MUST-NOT-EXIST** | A negative test — seeding this would break the case |

Status against live DB: ✅ already exists · ⚠️ gap, needs seeding

---

## A. Login accounts

### A1. Staff logins — ✅ all exist

Password for all of these is `Loanstar2026` (per UAT-073/083).

| Email | Role | Used by |
|---|---|---|
| `super_admin@loanstar.local` | Super Admin | UAT-068, 072, 075, 083, 084 |
| `admin@loanstar.local` | Super Admin | spare |
| `agent@loanstar.local` | Agent | UAT-018–023, 094 |
| `csa@loanstar.local` | CSA | UAT-024–030 |
| `cig@loanstar.local` | CIG | UAT-031–035, 098–108 |
| `committee@loanstar.local` | Committee | UAT-036–043, 104, 109, 110 |
| `lra@loanstar.local` | LRA | UAT-044–048 |
| `collection_head@loanstar.local` | Collection head / Briefing | UAT-049, 050 |
| `ar@loanstar.local` | AR | UAT-051–056 |
| `collector@loanstar.local` | Collector | UAT-057–063, 073, 092 |
| `remedial@loanstar.local` | Remedial | UAT-064–067 |

Two extra super-admins exist (3 total), which satisfies **UAT-081** (remove Super Admin role — needs a target that isn't the only one).

### A2. Borrower logins — ⚠️ **the biggest gap in the whole UAT**

**`borrower@loanstar.local` owns zero loan applications.** It's the only borrower login the UAT doc names, and it has nothing attached to it.

The borrower accounts that *do* own applications are personal and throwaway emails with unknown passwords — `rvckmlnrmsnt@gmail.com` (18 apps), `lupsuvalmi@necub.com` (18), `ubeeeyk@gmail.com` (5, your own address), `rovickromasanta.startuplab@gmail.com` (3), plus ~30 `@necub.com` temp-mail accounts holding 1–2 each.

A client tester cannot log into any of those, and you would not want them to — notification emails from the demo would land in your personal inbox.

**Seed 5 purpose-built borrower logins**, all password `Loanstar2026`:

| Account | Must own | Unlocks |
|---|---|---|
| `demo.borrower.new@example.local` | nothing at all | UAT-008 (empty dashboard state) |
| `demo.borrower.active@example.local` | 1 `documents_pending` app with 2 of 5 docs uploaded, 1 `draft` app | UAT-011, UAT-012, UAT-015 |
| `demo.borrower.history@example.local` | ≥2 terminal apps with *different* statuses (1 `paid_off` + 1 `denied`) | UAT-013, UAT-014 |
| `demo.borrower.servicing@example.local` | 1 `loan_active` app, balance ≈ PHP 120,000, monthly amort ≈ PHP 23,000 | UAT-016 |
| `demo.borrower.reloan@example.local` | 1 `paid_off` app in good standing | UAT-017 |

`borrower@loanstar.local` itself stays as-is — it's the duplicate-email target for **UAT-002** and the reset-link target for **UAT-089**, and both of those want an account with no baggage.

### A3. Admin-test user accounts

| Need | Status | Detail |
|---|---|---|
| Active non-super-admin to deactivate (UAT-078) | ✅ | 50 active non-super-admin profiles |
| **Inactive user to reactivate (UAT-079)** | ⚠️ **GAP** | **Zero inactive users exist** — all 53 profiles are active. Seed 1 deactivated staff account, e.g. `demo.inactive.officer@loanstar.local` |
| User missing a given role (UAT-080) | ✅ | No user holds every role |
| User with Super Admin (UAT-081) | ✅ | 3 exist |
| `new.officer@loanstar.ph` (UAT-076) | **MUST-NOT-EXIST** | The tester creates it. Delete it between dry runs. |

---

## B. Loan applications

### B1. By status — what exists vs. what's missing

| Status | Live count | Needed by | Status |
|---|---|---|---|
| `draft` | 6 | UAT-012 | ✅ |
| `documents_pending` | 2 | UAT-011 | ✅ (but see A2 — not owned by a login-able account) |
| `submitted` | 14 | UAT-025 | ✅ |
| `for_verification` | 3 | UAT-031, 032, 098–103 | ✅ |
| `for_approval` | 6 | UAT-037–043 | ✅ |
| `approved` / `denied` / `cancelled` | 2 / 3 / 2 | UAT-013, 042 | ✅ |
| `release_signing` | 5 | UAT-045 | ✅ |
| `release_ready` | 2 | UAT-047 | ✅ |
| `loan_active` | 53 | UAT-016, 054, 058 | ✅ |
| `paid_off` | 27 | UAT-013, 062 | ✅ |
| **`on_hold`** | **0** | UAT-026, 027 | ⚠️ **GAP** — seed 1 |
| **`committee_hold`** | **0** | UAT-040 | ⚠️ **GAP** — seed 1 |
| **`negotiating_terms`** | **0** | UAT-041 | ⚠️ **GAP** — seed 1 |
| **`for_revision`** | **0** | CIG revision flow | ⚠️ **GAP** — seed 1 |
| **`lra_pending`** | **0** | UAT-045, 046 | ⚠️ **GAP** — seed 1 |
| **`release_briefing`** | **0** | UAT-049, 050 | ⚠️ **GAP** — seed 1 |

### B2. By segment — ✅ all three exist

Seafarer 54 · SME 49 · Individual 19. Covers UAT-009, 010, 022, 067, 097.

### B3. By collateral

| Combination | Live | Needed by | Status |
|---|---|---|---|
| SME + `car_refinancing` | 7 | UAT-105, 106 | ✅ exists, ⚠️ but none is in `for_verification` (all past CIG, so not editable) |
| SME + `real_estate` | 4 | UAT-107, 108 | ✅ exists, ⚠️ same problem |
| Individual + collateral | 2 | UAT-097 | ✅ exists, ⚠️ both have empty inspections |
| **A collateral app open *in CIG*** | **0** | UAT-105–108 | ⚠️ **GAP** — seed 1 car + 1 real-estate app in `for_verification` |

---

## C. Supporting records

| Record | Live state | Needed by | Status |
|---|---|---|---|
| CM Inspection with ≥2 vehicles | 3 vehicles on 2 SME apps | UAT-106 | ✅ viewable, ⚠️ not editable (both `release_signing`) |
| **REM Inspection properties** | **0 anywhere** | UAT-107, 108 | ⚠️ **GAP — never used in this system at all** |
| Individual w/ `pic_verification`, no `field_visit` | 18 | UAT-104 (legacy fallback) | ✅ |
| SME w/ completed Field Visit | 8 | UAT-098, 109 | ✅ |
| Individual w/ completed Field Visit | 0 | UAT-110 | ⚠️ **GAP** — seed 1 (or produce it live by running UAT-100→103 first) |
| Masterlist aging buckets | current 48 · 1-30 16 · 31-60 5 · 61-90 3 · 91+ 10 | UAT-053, 071 | ✅ |
| Masterlist account status | active 37 · paid 37 · remedial 8 | UAT-052, 062 | ✅ |
| Remedial accounts | 8, incl. 91+ | UAT-064–067 | ✅ (verify "Critical" tier is computed from DPD) |
| Leads | 48 open · 16 converted | UAT-018, 020, 021, 023 | ✅ |
| Lead pipeline stages | computed, no stored column | UAT-019 | ✅ likely — verify |
| DCR | 117 reconciled · 6 rejected | UAT-055, 056 | ✅ history, ⚠️ **none pending** |
| **DCR awaiting reconciliation** | **0** | UAT-055, 060 | ⚠️ **GAP** — seed 1 `submitted` DCR with 2–3 items |
| CIG callbacks | exist | UAT-034, 035 | ✅ |
| Briefings | — | UAT-049, 050 | ⚠️ follows from the `release_briefing` gap |

---

## D. Files the tester needs locally — ⚠️ prepare these, they are not seeded

| File | Spec | Used by |
|---|---|---|
| `avatar-profile.jpg` | JPEG, 400×400 px, ~150 KB, under 2 MB | UAT-007 |
| `deposit-slip.jpg` | JPEG, under 5 MB | UAT-063 |
| 2 borrower documents | any valid PDF/JPG | UAT-011 (needs "2 of 5 uploaded") |

---

## E. Values the tester types — do **not** seed these

These appear in the doc's Test data column but are keyboard input during the test:

- **Registration (UAT-001):** Juan Dela Cruz · `juan.delacruz.test@example.com` · `Password123!` · 09171234567 · Married
- **Bad passwords / empty fields (UAT-003, 004, 077, 085, 090):** `pass12`, blank first name, blank email
- **Wrong password (UAT-084):** `WrongPassword999`
- **Account update (UAT-005):** `Capt. Roberto Reyes Jr.` · `09189876543`
- **New lead (UAT-021):** Danilo Cruz · Magsaysay Maritime
- **CSA hold reason (UAT-026):** "Waiting for original signed POEA contract and proof of allottee relationship"
- **CIG cancellation (UAT-033):** "Vessel departure cancelled by foreign principal; employment contract rescinded."
- **CIG callback (UAT-034):** tomorrow 10:00 AM
- **Committee approve remark (UAT-038):** "Applicant meets debt service ratio and employment stability criteria."
- **Committee deny reason (UAT-039):** "Debt-to-income ratio exceeds allowable ceiling; unfavorable allottee history."
- **Committee hold reason (UAT-040):** "Requires higher credit authority / Executive Committee review for exposure > PHP 250k."
- **Counter-offer (UAT-041):** PHP 120,000 · 4 months
- **LRA release path (UAT-046):** With PDC · Direct Bank Deposit (BDO Unibank)
- **Computation inputs (UAT-029):** PHP 150,000 · 6 months · USD 2,000 basic salary
- **DCR entry (UAT-060):** PHP 15,000 · Cash · OR-889102
- **Field Visit (UAT-098):** today · Bungalow · Low risk · For approval
- **Informant (UAT-102):** Jose Mendoza · Bonifacio Ave., Poblacion, Iloilo City
- **Neighborhood (UAT-103):** Residential · Middle · Good
- **Vehicle plates (UAT-105):** ABC-1234 · XYZ-5678 · DEF-9012
- **Properties (UAT-107):** Lot 5 · Lot 8, same TCT series
- **New staff user (UAT-076):** `new.officer@loanstar.ph` · Maria Santos · Credit Investigator
- **Report date range (UAT-069):** 2026-01-01 → 2026-06-30

---

## F. Must NOT exist before testing

| Data | Case | Why |
|---|---|---|
| `juan.delacruz.test@example.com` | UAT-001 | Registration must succeed — delete between runs |
| `new.borrower@example.com` | UAT-003 | Same |
| `maria.santos@example.com` | UAT-004 | Same |
| `new.officer@loanstar.ph` | UAT-076 | User-creation must succeed — delete between runs |

`borrower@loanstar.local` **must** exist for UAT-002 (duplicate email) and UAT-089 (reset link).

---

## Summary of gaps

**11 things to seed:**

1. 5 borrower logins with known passwords + their applications *(A2 — blocks 7 test cases)*
2. 1 deactivated staff account *(A3 — UAT-079)*
3. 1 app in `on_hold`
4. 1 app in `committee_hold`
5. 1 app in `negotiating_terms`
6. 1 app in `for_revision`
7. 1 app in `lra_pending`
8. 1 app in `release_briefing`
9. 1 SME + car-refinancing app in `for_verification` with an editable CM Inspection
10. 1 Individual + real-estate app in `for_verification` with an editable REM Inspection *(the only path to any REM data existing at all)*
11. 1 `submitted` DCR with 2–3 line items

**3 files to prepare locally** *(section D)*, and **4 accounts to clear between runs** *(section F)*.

Everything else the 110 test cases need is already in the database.

---

## Note on how to seed this safely

There is only one Supabase project — no staging. Follow the pattern already in `scripts/reseed-demo-data.ts`: scoped identifiers (`demo.borrower.*@example.local`), dry-run by default with `--apply` to write, inserts only (never update or delete an existing row), amounts generated through the app's own computation helpers so schedules stay internally consistent, and a logged list of inserted ids for rollback. Detail in `uat-demo-data-seed-plan.md`.
