# Application Creation — Field Combination Checklist

This is just for the **Create Application** screen itself (Segment → Entity
type → Collateral → Loan schedule) — testing that the right fields show up,
and the right options are allowed/blocked, before you ever get to
Computation. Fill in Email/First name/Last name with anything to actually
submit each one.

For each row: pick the fields shown, check the "You should see" column,
then click **Create application** and confirm it either succeeds or is
blocked as noted.

---

## 1. Seafarer

| Field | Value |
|---|---|
| Loan segment | **Seafarer** |

✅ You should see: **no** Entity type field, **no** Collateral field, **no**
Loan schedule field — none of them apply to Seafarer. Just segment + the
borrower's name/email/phone.

Submit → should succeed with no errors.

---

## 2. SME — walk through both Entity types

| Step | Loan segment | Entity type | Collateral | Loan schedule |
|---|---|---|---|---|
| 2a | SME | **Individual (Sole Proprietorship)** | Clean | shows all 8 options |
| 2b | SME | **Corporate (Partnership/Corporation)** | Clean | shows all 8 options |

✅ For both 2a and 2b: **Entity type is required** (try submitting without
picking one — should be blocked). Once Clean is selected, the Loan schedule
dropdown should show all 8: Regular, MPL, Salary, Invoice Financing,
Bi-monthly, Quarterly, Two-monthly, Daily.

Submit 2a and 2b once each, picking a different schedule each time (e.g.
Quarterly for 2a, Daily for 2b) — both should succeed.

---

## 3. SME — Collateral locks the schedule

| Step | Loan segment | Entity type | Collateral | Loan schedule |
|---|---|---|---|---|
| 3a | SME | Individual | **Car Refinancing** | locked to Regular (Monthly) |
| 3b | SME | Individual | **Real Estate** | locked to Regular (Monthly) |

✅ The moment you pick Car Refinancing or Real Estate, the Loan schedule
dropdown should **grey out** and show only "Regular (Monthly)" with a small
note underneath saying it's locked. The other 7 options should disappear
from the list entirely (not just be unselectable).

Switch Collateral back to **Clean** → all 8 options should reappear immediately.

Submit both 3a and 3b → should succeed (Monthly is the only choice, so
there's nothing invalid to submit).

---

## 4. Individual — same access as SME now

| Step | Loan segment | Entity type | Collateral | Loan schedule |
|---|---|---|---|---|
| 4a | Individual | *(no Entity type field — Individual doesn't have one)* | Clean | shows all 8 options |
| 4b | Individual | — | **Car Refinancing** | locked to Regular (Monthly) |
| 4c | Individual | — | **Real Estate** | locked to Regular (Monthly) |

✅ 4a should look identical to SME's Clean case (Test 2) — this is the main
thing that changed: Individual used to only get MPL/Salary, now gets the
same full 8-option list. 4b and 4c should lock exactly like SME's did in
Test 3.

Submit 4a with schedule = **Salary**, submit 4b, submit 4c → all three should succeed.

---

## 5. Try to break it (should all fail)

Try each of these and confirm you get a clear error, not a silent success:

1. **Seafarer + try to set a schedule anyway** — not reachable through the
   UI (no field shown), but worth confirming there's genuinely no way to
   sneak a non-Monthly schedule onto a Seafarer application.
2. **SME with no Entity type selected** → blocked, "entityType is required."
3. Pick **Car Refinancing**, then quickly switch Loan schedule to something
   else before the lock kicks in, then submit — should still either
   auto-correct to Monthly or be rejected server-side, never save a
   collateral loan with a non-Monthly schedule.

---

## Quick summary table

| Segment | Entity type shown? | Collateral shown? | Schedule options |
|---|---|---|---|
| Seafarer | No | No | No field — always Monthly |
| SME | **Yes, required** | Yes | 8 if Clean, locked to Monthly if collateral |
| Individual | No | Yes | 8 if Clean, locked to Monthly if collateral |

If any row doesn't match what you see on screen, that's the bug to report — tell me which row and what showed up instead.
