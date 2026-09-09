# Audit: 30-Day Roll-Forward vs. Client Requirements

**Date:** 2026-09-09  
**Auditor:** Technical Review (based on comprehensive transcript analysis)  
**Scope:** All meeting transcripts and documentation in `docs/` folder  
**Finding:** The automatic 30-day roll-forward in `refresh_one_masterlist_aging` contradicts client requirements

---

## Executive Summary

The current implementation contains a 30-day automatic roll-forward block that, when an installment reaches 30 days past due, merges its balance and penalty into the next installment and marks it as `status='rolled'`. **This behavior appears in NO client transcript.**

The client's model, consistently described across multiple meetings, is: each missed installment stays as its own line with its own Target unchanged; only the Penalty column grows via monthly compounding on that line's balance.

---

## Evidence from Transcripts

### 1. The Client's Penalty Model (Verbatim Quotes)

**Source:** `docs/transcription.md` lines 1033-1039  
**Context:** Rovick explaining the penalty model to the client, who confirms understanding

> **Line 1033-1035:** "compounding yung penalty natin… Ngayong buwan magkakaroon siyang penalty. Next month, ano yung balance niya? Para bang amortization plus penalty tapos kukumputan ko na naman siya ng panibagong penalty. Whatever is the balance sa amortization and penalty. … itong isa meron na siyang amortization, penalty, penalty… yun na yung duty niya doon sa first line."

**Translation/Meaning:** The penalty compounds monthly. This month it gets a penalty. Next month, what's the balance? It's like amortization plus penalty, then we apply another new penalty to it. Whatever the balance is in amortization and penalty. This one now has amortization, penalty, penalty... that's its duty on that first line.

**Key Point:** The line STAYS ("yun na yung duty niya doon sa first line"). It accumulates "amortization, penalty, penalty" on THAT line, not by moving to another line.

---

**Source:** `docs/transcription.md` line 1036

> "ang October mo is meron kang amort plus penalty. Pagdating ng November, itong amort plus penalty, ito total mo ulit yan, tapos kumputan mo ulit siya ng panibagong penalty."

**Translation:** Your October has amort plus penalty. When November comes, this amort plus penalty becomes your total again, then you apply another new penalty to it.

**Key Point:** The installment's "total" (amort + penalty) is the base for the next penalty. This describes column growth, not row merging.

---

**Source:** `docs/transcription.md` line 1039

> "meron na siyang dalawang penalty na compounding. Isang amort, isang penalty, at isang penalty… kung ano yung balance, yun yung kinukumputan niya ng penalty."

**Translation:** It now has two compounding penalties. One amort, one penalty, and one penalty... whatever the balance is, that's what gets penalized.

**Key Point:** "dalawang penalty" = two penalty rounds accumulated. Still one installment with multiple penalties, not merged into another row.

---

### 2. Payment Flexibility (Pay Any Month)

**Source:** `docs/transcription.md` line 103

> "try po natin lang mabayaran itong month. For example, itong two months lang na ito."

**Translation:** Let's just try to pay this month. For example, just these two months.

**Key Point:** Borrower can choose to pay "itong two months lang" (just these two months), implying each month is a separate, payable line.

---

**Source:** `docs/transcription.md` line 727

> "sa mata ni barrower kasi, dalawang buwan pa yan."

**Translation:** In the borrower's eyes, that's still two months.

**Key Point:** The borrower sees multiple missed months as distinct lines ("dalawang buwan pa yan" = that's still two months). Not one merged blob.

---

### 3. Sign-Off Checklist (Requirements Validation)

**Source:** `docs/meeting-minutes-2026-08-25.md` section 9, line 233

> "Multiple missed months each compound their own penalty correctly (validated against meeting test case)."

**Key Point:** PLURAL "months" (not "the merged month"). Each compounds "their own penalty" (not "a single combined penalty"). This checklist item was explicitly checked off as a requirement.

---

**Source:** `docs/meeting-minutes-2026-08-25.md` section 9, line 232

> "Partial payments correctly reduce the balance penalty is calculated on (recalculates on remaining balance)."

**Key Point:** When a borrower pays part of ONE installment, the penalty recalculates on the REMAINDER of that installment. This only makes sense if installments stay separate and payable.

---

### 4. Move of Payment (A DIFFERENT Feature)

**Source:** `docs/transcription.md` lines 781-823

**Context:** The ONLY discussion in transcripts about "moving" or "shifting" a line

> **Line 781:** "Pag nagbayad siya ngayon ng one-month interest, ito, ang due ko dito ay parang mawawala."  
> **Translation:** If they pay one-month interest now, this, my due here will sort of disappear.

> **Line 790:** "Parang lang ipalabas na meron siyang payment na 212, pero hindi siya mag-a-affect dito sa remaining balance na to."  
> **Translation:** It's just to show there's a payment of 212, but it won't affect this remaining balance.

> **Line 803:** "isang beses lang yan. Hindi mo yan pwedeng gawin pa ulit-ulit."  
> **Translation:** That's only once. You can't do it again and again.

> **Line 817:** "parang nagbabayad ng, nag-o-offer ng, Sir, parang hindi ka mag, ano, mag-offer payment na lang kayo"  
> **Translation:** Like paying, offering, Sir, like you don't have to, just offer a payment instead.

> **Line 820:** "Mawawala ito, kasi hindi ka naman nagbayad. Mawawala ito ngayong move of payment mo tapos itong lahat na ito, babalik sa dating as isware siya ulit"  
> **Translation:** This will disappear because you didn't pay. This move of payment disappears and all of this goes back to how it was before.

**Key Points:**
- This is a VOLUNTARY offer ("nag-o-offer") initiated by Collection, not automatic
- Costs one month's interest ("nagbabayad ng one-month interest")
- Once per loan only ("isang beses lang yan")
- REVERTS if not honored ("babalik sa dating" = goes back to how it was)
- Creates a SEPARATE payment line for the interest, doesn't merge the installment itself

**Conclusion:** Move of Payment is a paid deferral feature. It is NOT the same as automatic delinquency behavior. The transcript describes it as a grace period the borrower pays for, not an automatic merge that happens at 30 days overdue.

---

### 5. The Only "Rollover" Mention

**Source:** `docs/transcription-2026-08-25.md` line 1090

> **Client:** "Yung magro-ro. What do you mean?"  
> **Response:** "Para yung, paano yan? Pag 30 days and above, hindi ka pa nagpa-penalty."  
> **Follow-up:** "Nagpaano po, pero na-initi mo po yung. Hindi, pero sa 30 days kasi pag nag-pass yun na siya, penalty na agad yun eh."  
> **Clarification:** "Penalty na agad. Ah-ah. Hindi mo kailangan maghintay ba ng 90 days?"

**Translation/Context:**
- Client asks: "That 'rollover' thing, what do you mean?"
- Response: "So that... how? When it's 30 days and above, you haven't applied penalty yet."
- Follow-up: "It was done, but you initialized it. No, but at 30 days, when it passes that, it's already a penalty."
- Clarification: "Already a penalty. Ah. You don't need to wait 90 days?"

**Key Point:** The client is ASKING what "rollover" means because they haven't heard of it before. The answer given is only about WHEN penalty starts (30 days, not 90 days), NOT about merging balances. The confusion proves rollover was not part of the original requirements discussion.

---

## What the Current Implementation Does (Contradicts Requirements)

**Source Code:** `loanstar/supabase/migrations/20260908231312_penalty_monthly_compounding.sql` lines 290-358

**Behavior at 30 Days Past Due:**
1. Selects the oldest overdue installment
2. Calculates `roll_amount = (amort - discount - paid) + penalty - penalty_discount`
3. Finds the next unpaid installment
4. ADDS `roll_amount` to that installment's `amount_due` and `penalty_amount`
5. Marks the original installment as `status='rolled'`, `rolled_at=NOW()`, `rolled_into_installment_no=X`
6. Inserts a `penalties` row with notes like `'30-day rollover: ₱X rolled into installment #Y'`

**Result:**
- Installment #1 (oldest overdue) becomes frozen, unpayable on its own
- Installment #2 now has Target = ₱149,600 (doubled from ₱74,800)
- Borrower CANNOT pay installment #1 separately (contradicts line 103, 727 requirements)
- The "dalawang buwan pa yan" (two separate months) becomes ONE merged month (contradicts line 727)

**Production Impact:** 24 rows currently have `status='rolled'` (per database audit 2026-09-09), representing frozen installments.

---

## When This Rollover Code Was Added

**Migration History:**
- The 30-day rollover predates the penalty meetings (first appears in `20260712010000_collection_flow_alignment.sql`, July 2026)
- The penalty meetings (`transcription.md`, `meeting-minutes-2026-08-25.md`) happened in August 2026
- The rollover was NEVER validated against the penalty requirements documented in those meetings

**Hypothesis:** The rollover was part of earlier "collection flow alignment" work, before the client's detailed penalty model was discussed. It was carried forward into the Phase 2 penalty compounding migration (20260908231312) without re-checking whether it matched the new requirements.

---

## Conclusion

**The 30-day automatic roll-forward contradicts the client's requirements.**

- ❌ Transcripts say: each missed month stays as its own line → rollover merges them
- ❌ Transcripts say: borrower can pay any month → rolled rows can't be paid independently  
- ❌ Transcripts say: "dalawang buwan pa yan" (two months) → rollover makes it one merged row
- ❌ Transcripts say: "Multiple missed months each compound their own penalty" → rollover makes only the merged row compound

**The correct behavior (already implemented in Phase 2 accrual loop):**
- ✅ Each overdue installment keeps its own Target (₱74,800) unchanged
- ✅ Each overdue installment's Penalty column grows monthly, compounding on its own balance
- ✅ Borrower can pay any installment independently
- ✅ "Dalawang buwan" stays as two visible, payable rows in the ledger

**Recommendation:** Remove the 30-day roll-forward block. The Phase 2 per-installment penalty accrual loop already implements what the client wants. The rollover is a separate, contradictory behavior that should not exist in the delinquency path.

---

## Appendix: All Transcript Files Audited

1. `docs/transcription.md` — main meeting with detailed penalty discussion (lines 1033-1039 key quotes)
2. `docs/transcription-2026-08-25.md` — follow-up meeting (line 1090 "rollover" confusion)
3. `docs/meeting-minutes-2026-08-25.md` — formalized requirements checklist (§9 lines 232-233)
4. `docs/transcription_2.txt` — (no relevant penalty/rollover discussion found)
5. `docs/meeting-minutes-2026-09-01.md` — (no relevant penalty/rollover discussion found)
6. `docs/Meeting-Transcript-Sept-04.md` — (no relevant penalty/rollover discussion found)
7. `docs/Meeting-Minutes-Sept-04.md` — (no relevant penalty/rollover discussion found)

**Verdict:** ZERO transcripts support automatic balance-merging at 30 days. The client's model is consistently described as per-installment independent compounding across all documents.
