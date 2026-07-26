# Manual E2E Test Journey — Workflow Alignment (Phases 1–12)

Use this as a checklist. Do **not** skip steps. For each row: perform the **Act** as the **Actor**, then confirm the **Expected output** before moving on.

**Fresh audit evidence (2026-07-17):** Phases 1–12 code **PASS**; unit tests **268/268**; DB has aging + reminder crons, LOI/LA published templates, `reminder_log`, SMS config keys. Plan verification gate remains open until this journey is completed.

---

## 0. Prerequisites (setup once)

| # | Actor | Act | Expected output |
|---|-------|-----|-----------------|
| 0.1 | Admin / Super Admin | Confirm test users exist for: Agent, CSA, CIG, Committee (3 members), LRA, Collector, AR, Borrower | Each role can log in to its portal |
| 0.2 | Admin | Open `/admin/config` — note coverage ratio (default 0.35). Leave SMS **disabled** until step 26 unless testing Twilio now | Config page loads; SMS section visible; auth token masked if previously saved |
| 0.3 | Tester | Pick a unique email for the borrower (not already in system). Note a PH mobile `09XXXXXXXXX` | Email free to claim; mobile usable for SMS later |
| 0.4 | Tester | Prepare sample PDFs: passport, seaman’s book, clearance/application docs, employment contract, later signed scans | Files ready to upload |

**Recommended test borrower profile:** declare monthly income high enough that monthly amortization ≤ 35% of income (so endorse is not blocked by coverage). Example: income ₱100,000 if amort ≈ ₱30,000.

### Account settings smoke (Account Settings plan)

| # | Actor | Act | Expected output |
|---|-------|-----|-----------------|
| A.1 | Any staff | Header → **Account** (not borrower KYC) | `/account` loads with AppShell |
| A.2 | Same | Change display name → Save | Header name updates; Admin Users list matches after refresh |
| A.3 | Same | Upload avatar → hard refresh | Photo in header; objects in `avatars` bucket only (not `loan-documents`) |
| A.4 | Borrower | Open `/borrower/profile` | **Application profile** (SF form) still works |
| A.5 | Borrower (claimed) | Toggle email/SMS off → Save; trigger reminder or denial path | Channel skipped; unclaimed / missing prefs still send (fail-open) |
| A.6 | Any | Endorse / approve a claimed borrower app | Header bell shows in-app notification |

---

## Part A — Lead → Claim → CSA intake (Phases 5–6, 1, 9)

| # | Actor | Act | Expected output |
|---|-------|-----|-----------------|
| 1 | **Agent** | Log in → create a new lead with borrower name + email matching the test email | Lead saved; agent can see own lead |
| 2 | **Agent** | (Optional) Upload agent-side requirement flags if UI allows; do **not** expect document bytes view | Lead shows complete/incomplete flag; agent cannot open document contents |
| 3 | **CSA** | Log in → CSA dashboard | Card/section **“New leads from agents”** (or equivalent) lists the open unlinked lead |
| 4 | **CSA** | Open lead → **Convert to application** (or New Application with lead prefill) | Application created; lead linked; borrower record exists (may be unclaimed) |
| 5 | **Borrower** | Open register → enter **same email** as lead/application → complete registration → submit | UI says check email / confirm; **does not** auto-log in to borrower portal |
| 6 | **Borrower** | Open confirmation link from email (Resend) → set password if prompted → log in | Account claimed; borrower number visible; application appears on borrower dashboard |
| 7 | **Borrower** | Try to re-register / claim same email again | Blocked / 409 already claimed (or clear “already registered” message) |
| 8 | **CSA** | Open the application workspace | Status editable (intake); checklist + computation + endorse panels visible |
| 9 | **CSA** | Fill borrower details (agency, employment, contacts). Set **monthly income** for coverage | Profile saves |
| 10 | **CSA** | Record **NCL** check (pass or fail — either is fine for endorse as long as recorded) | NCL badge updates (pass/fail) |
| 11 | **CSA** | Upload each **required** intake document via CSA checklist | Status becomes **uploaded** (not signed by borrower) |
| 12 | **CSA** | For each uploaded required doc → click **Confirm** | Status becomes **confirmed**; subtitle like “Awaiting CSA confirmation” clears |
| 13 | **Borrower** | Open intake checklist on borrower portal | **No per-file Sign** for requirement docs (view/upload only as designed) |
| 14 | **CSA** | Run computation (loan type, amount, terms). Confirm coverage warning if any | Computation saved; if ratio > threshold, on-screen warning matches admin coverage % |
| 15 | **Borrower** | Sign the computation | Computation shows signed |
| 16 | **CSA** | Open **Endorse to CIG** panel | Coverage line shown: green if ≤ threshold; amber if income unknown; **red blocker** if over threshold |
| 17 | **CSA** | If intentionally testing Phase 9 blocker: temporarily use income so amort > 35% → try Endorse | Endorse **disabled**; missing lists “Monthly amortization exceeds NN%…” |
| 18 | **CSA** | Restore valid income / recompute so coverage OK → click **Endorse to CIG** | Status moves to CIG verification; CSA loses edit rights on this file |

---

## Part B — CIG verification

| # | Actor | Act | Expected output |
|---|-------|-----|-----------------|
| 19 | **CIG** | Open queue → open endorsed file | File in CIG workspace |
| 20 | **CIG** | Complete verification form fields + required CIG checks (NFIS/MF/etc. as UI requires) | Completeness improves |
| 21 | **CIG** | Submit / complete CI report (explicit submit button) | File becomes visible to Committee (`for_approval` or equivalent) |
| 22 | **Borrower** | Check status | Sees verification → for approval style status |

---

## Part C — Committee (Phases 2–4)

| # | Actor | Act | Expected output |
|---|-------|-----|-----------------|
| 23 | **Committee member A** | Open file → cast vote (approve) | Vote logged (1/3) |
| 24 | **Committee member B** | Cast vote (approve) | Vote logged (2/3). Final Approve/Deny/Hold still **blocked** if UI shows Waiting / votesNeeded |
| 25 | **Committee member A or B** | Try final action **Approve** while only 2 votes | **Rejected** — need all 3 votes |
| 26 | **Committee member C** | Cast vote (approve) | 3/3 votes; final actions enable |
| 27 | **Any committee member** | Click **Hold** with required comment | Status → **`committee_hold`** (not CSA `on_hold`); queue flags held; borrower copy ≠ CSA hold wording |
| 28 | **Any committee member** | From hold → final **Approve** (comment if required by UI) | Status → approved; file available for disclosure/negotiation |
| 29 | *(Side path — Phase 4)* **Committee** | On a **second** test file later: Deny after 3 votes | Borrower gets **denial email** (no reason in body); CIG denial-informed remains call-only |

---

## Part D — Disclose → sign computation → LRA queue

| # | Actor | Act | Expected output |
|---|-------|-----|-----------------|
| 30 | **CSA / Processing** | Disclose approved amount/terms to borrower (system disclose action) | Negotiation/disclosure state advances |
| 31 | **Borrower** | Accept terms / sign computation if prompted again after disclose | Signed computation is LRA trigger |
| 32 | **LRA** | Open LRA queue → open application → **Start / open release file** | Release file created; status awaiting path |

---

## Part E — LRA path, PDC, generate, sign (Phases 8, 11, 10)

| # | Actor | Act | Expected output |
|---|-------|-----|-----------------|
| 33 | **LRA** | Choose path **With PDC** → Save path | Status → PDC encoding |
| 34 | **LRA** | Set **Number of checks** = terms − 1 (shortfall) → Save PDC | Confirm dialog: “Only N of M amortization checks…” |
| 35 | **LRA** | Cancel dialog | Still on PDC encoding; not advanced |
| 36 | **LRA** | Save again → **Confirm and save** shortfall | PDC saved; audit records acknowledged shortfall; status → ready to generate |
| 37 | **LRA** | Click **Generate** documents | **7** generated docs including **Letter of Intent** + **Loan Agreement** (+ BLRI, PN, DS, check voucher, AR check voucher) |
| 38 | **LRA / Borrower** | Complete witnessed signing for **all 7** generated docs | After last signature → awaiting briefing (not stuck) |
| 39 | **Collector / Collection Head** | Open briefings → acknowledge briefing for this release | Release file → `ready_release`; if no employment contract yet, application blocker **“Pending: employment contract”** |
| 40 | **LRA** | On ready_release screen, note **Record release** button | Disabled listing: employment contract (and briefing if missing) |
| 41 | **LRA** | Upload **Employment contract** on the LRA “Employment contract” checklist (intake slug `contract`) | Upload succeeds; `employmentContractPresent` true after refresh |
| 42 | **LRA** | Click **Record release** → confirm | Status → released |
| 43 | **LRA** | Upload required signed scans on release checklist (signed check voucher, signed PN, signed DS) | Checklist items uploaded |
| 44 | **LRA** | **Close file** → confirm | Status → closed; queued for AR |

---

## Part F — AR → Collection → reminders / aging (Phases 7, 12)

| # | Actor | Act | Expected output |
|---|-------|-----|-----------------|
| 45 | **AR** | Open AR queue → receive closed file / create masterlist if prompted | Masterlist row exists with amort schedule |
| 46 | **AR** | Assign collector to the account | Account appears on Collector dashboard |
| 47 | **Collector** | Open accounts list (triggers on-view aging refresh) | Accounts load; no error |
| 48 | **Admin** | (Ops) Set `CRON_SECRET` in app env; in `/admin/config` set matching **Cron secret** + **App base URL**; optionally enable SMS + Twilio + test mobile | Save succeeds; token stays masked on reload |
| 49 | **Admin** | Send **test SMS** to the borrower’s mobile | “LoanStar test message” arrives **or** clear Twilio error if misconfigured; if SMS disabled → skipped message |
| 50 | **Collector** | Click **Send reminders** (with an installment due within 7 days on a current-bucket account) | Sent/skipped counts returned; `reminder_log` gains email (and SMS if enabled + mobile on file) |
| 51 | **Collector** | Click Send reminders again without resend | Skips already-logged channels (no duplicate automated rows) |
| 52 | **Admin / DB** | Confirm cron jobs exist (or wait for schedule): `loanstar-aging-daily`, `loanstar-reminders-daily` | Both active in `cron.job` |
| 53 | **AR / Collector** | (Optional) Create overdue installment scenario → wait for aging cron or open collector accounts | Penalty / bucket / remedial flag updates per aging rules |

---

## Part G — Borrower visibility checkpoints (spot-check anytime)

| # | Actor | Act | Expected output |
|---|-------|-----|-----------------|
| G1 | **Borrower** | After CSA endorse | Status reflects verification |
| G2 | **Borrower** | After committee approve | Approved / negotiating as designed |
| G3 | **Borrower** | During LRA | Blocker text visible when release blocked (PDC / contract / briefing) |
| G4 | **Borrower** | After release | Released / active loan info |

---

## Phase coverage map (what this journey proves)

| Phase | Steps that prove it |
|-------|---------------------|
| 1 CSA confirm / no borrower Sign | 11–13 |
| 2 All 3 votes | 23–26 |
| 3 Committee hold | 27–28 |
| 4 Denial email | 29 (side path) |
| 5 Claim / no auto-login | 5–7 |
| 6 CSA leads convert | 1–4 |
| 7 Aging cron + on-view | 47, 52–53 |
| 8 PDC shortfall | 34–36 |
| 9 Coverage endorse | 16–18 |
| 10 Contract before release | 39–42 |
| 11 LOI + LA generated (7 docs) | 37–38 |
| 12 SMS + reminder log + cron | 48–52 |

---

## Sign-off

When every required row above is checked:

- [ ] Full happy path completed without skipped steps  
- [ ] Phase side-paths done (shortfall confirm, hold, coverage blocker, denial email on 2nd file)  
- [ ] Mark plan **Verification gate** items complete in `docs/workflow-alignment-fix-plan.md`
