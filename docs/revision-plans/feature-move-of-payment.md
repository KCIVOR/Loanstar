# Move of Payment — Confirmed Requirements

**Status:** Requirements only, confirmed against the raw meeting transcript. No implementation plan and no code exist yet. This document is written to be handed to another party (human or AI) to turn into a phase-by-phase implementation plan — it intentionally does not prescribe a technical design, only the confirmed business rules and the current state of the codebase.

**Source:** Tracked as Feature #2 in [implementation-tracker-2026-08-25.md](../implementation-tracker-2026-08-25.md). Every rule below is a direct quote or a directly-quoted exchange from the raw transcript at [transcription-2026-08-25.md](../transcription-2026-08-25.md) — not the meeting-minutes summary, and not an assumption. Where the transcript itself is ambiguous or unresolved, that is stated explicitly rather than filled in.

---

## 1. What this feature is

A one-time payment-relief mechanism, offered by Collections staff to a borrower who cannot make a full amortization payment on time. Instead of missing the payment (and accruing a penalty), the borrower pays a smaller amount — **one month's interest only**, which the calculator already has a field for, called the **"security fee."**

> **Conference:** *"Sa collection naman, meron siyang tinatawag niya move of payment. So, ang katumbas nun is yung security fee, which is one month interest na surcharge."*

The purpose, stated directly with a worked scenario:

> **Conference:** *"Kunyari, ito, hindi ako makabayad ng, ano, ito, 8.15, bayad na ako. 8.19, bayad na ako. So, ang next ng due is 10.15."*
> **rovick:** *"Ay, hindi ako makabayad dito. Parang alanganin yung sahod ko, hindi ako makabayad."*
> **Conference:** *"So, sa halip na mag-pass due ako, in-offer na collection ng sir, bayad nga lang po kayo ng..."*
> **rovick:** *"move of payment, katumbas ng one-month interest."*

---

## 2. Confirmed mechanics (what actually happens to the schedule and the ledger)

1. **The borrower pays one month's interest as a surcharge.** In the transcript's worked example this is ₱212.88.

2. **That payment removes the due date for the current month and shifts every remaining installment down by one month/line.** The debt itself is unchanged — only the calendar shifts.
   > *"pagka mabayaran niya yun, mawawalan siya ng due date doon sa month na yun... Tapos, lahat ng month sa ilalim, March-April, magmove siya, parang magmove siya ng isang line. So sa halip na ang end of payment niya, kanyari September, magiging October niya..."*
   > *"Binayaran niya yung surcharge para sa interest doon sa isang buwan lang. Pero yung utang niya, same pa din."*

3. **A new ledger line is added for the shifted month.** It shows the interest-only payment as both debit and credit (so it nets to zero against the running balance) and carries **no target/amortization amount** for that line:
   > **rovick:** *"Ang mangyayari, ang lalabas nandiyan na payment ko, itong 212. Pero wala kong target. Magiging blanco ang target ko. Kasi magmumove siya ngayon."*
   > **Conference:** *"Magkakaroon siya ngayon dito ng panibagong... panibagong line... Ma-adjust lang po siya pababa... Pero yung remaining po sa baba, made pa rin po yung bayad ni lahat."*
   > **rovick:** *"Parang lang ipalabas na meron siyang payment na 212, pero hindi siya mag-a-affect dito sa remaining balance na to. Wala siyang kihalaan dyan."*
   > **rovick (numeric confirmation):** *"kunyari, magiging target mo ngayon dito na amount, magkakaroon ka ng 212 din. Yung interest nakatumbas, 212.88 dyan, tapos may debit ka, meron ka yung credit dito, 212.88 para mag-balance yung total mo."*
   > **Conference:** *"itong month na to, yan lang ang pumasok na payment, 212.88. Mag-cover lang po yung interest. Isang one month interest lang ang katumbas niya na payment."*

4. **No past-due status shows for the shifted month**, because the due date itself moved rather than being missed:
   > *"Kaya lalabas na wala siyang past due kasi nagmove yung mga due date niya."*

---

## 3. One-time limit

**Exactly once per loan, ever.**

> *"sa isang account po, isang beses lang po nila pwede kumitin yung move-off payment sa isang loan. Isang beses lang siya."*
> **Conference (separately, confirming the same point):** *"Ano po yan? Isang beses lang po sila pwede magyanas o madami? Isang beses lang yan. Hindi mo yan pwedeng gawin pa ulit-ulit. Parang one time, another time tapos, yan na yun. Hindi ka na pwede. Sa sumunod, penalty na bayaran mo."*

Typical real-world timing: right after the borrower's first payment cycle, when their first salary is still tight against other obligations.

> *"usually yan, mag-iari yan sa umpisa pa lang dito. Kasi nga, minsan sa unang sampak nila, yung unang sahod, parang kulang pa kasi may marami pa rin yung binabayaran o pinapadala sa pamilya. Kaya nagre-requestion sila, sir, pwede bang mag-move-off payment kami?"*

This is stated as the *typical* case, not a hard rule restricting the feature to first-payment-only — no quote restricts *when in the loan's life* it can be used, only that it can be used once, ever.

---

## 4. Who can trigger it

**Collections decides and offers it. It is explicitly not a borrower self-service option.**

> *"Talagang in-offer lang yan sa mga collection ang nag-decide kung ipaka-move payment nila o hindi."*

Directly asked and directly answered — should the borrower be able to request/apply this themselves from their own dashboard?

> **rovick:** *"Di ba po si borrower mayroon siyang dashboard, then dun siya pwede mag-mag-upload ng process payment."*
> **Conference:** *"Pwede po kayo dun ilagayin din. Parang lalagyan po siya ng option na parang ipapamove yung kanyang payment ngayong month. Oo, pero **hindi dapat na-application. Hindi na dapat na-available doon.** Kasi siyempre makikita nilang pwede [i]... Talagang in-offer lang yan sa mga collection ang nag-decide kung ipaka-move payment nila o hindi."*

It is triggered from the **Collections dashboard**, and once triggered, adds a corresponding line to the **borrower's own dashboard** reflecting the moved payment (display only — the borrower does not initiate it):

> *"para mag-mangyari, sa collection dashboard siguro yan, tapos may ititrigger siya doon na itong map na ito ay mag-move of payment, mag-a-add ngayon doon kay borrower na dashboard din ng isang line para doon sa bagayaran niyang move of payment."*

---

## 5. If the borrower fails to pay the shifted (moved-to) installment

Everything reverts to the original, un-shifted schedule, and a real penalty is now calculated on the missed month:

> **rovick:** *"Mawawala ito, kasi hindi ka naman nagbayad. Mawawala ito ngayong move of payment mo tapos itong lahat na ito, babalik sa dating as isware siya ulit, na mag-e-end babalik ng January, hindi February. May penalty na po yun. Penalty na ngayon ang i-calculate niya kasi nag-move of payment."*
> **Conference:** *"So babalik lahat ito sa dati, makakaroon na siya ng penalty."*

The added ledger line itself is removed/undone, and the original amortization line returns in its place:

> **rovick:** *"Ito pala. Buburain itong line na ito, tapos ito, babalik na sa dating amortization."*

There is a partially-garbled but relevant line about a hard cutoff/deadline for paying the shifted installment before it reverts — worth clarifying, see §7 below:

> *"May due date din yan na kailangan mong bayaran ng within within umabot dito sa month na ito. As due date mong next... Kasi pag hindi mo rin siya nagbayaran doon sa due date na inalat sa ano, hanggang dito yun siya sa ano... yung sumunod na mat na due date or minsan kasi pinipilit na nilang mabayad ka. Ang ibig kong sabi ng catch, pag hindi niya yan binayaran, lahat ito babalik sa dati."*

---

## 6. Scope — confirmed for all loan types, with one confirmed exclusion

**Confirmed to apply to all loan types, not Seafarer-only** — asked and answered directly, twice:

> **Conference:** *"Iyan po, yung move of payment po yan, si Ferro lang yan or peb sesame individual?"*
> **rovick:** *"Pwede yan sa lahat eh."*
> **Conference:** *"Lahat."*

**Explicitly excluded: Invoice (Weekly) loans.** Same underlying reason Invoice is also excluded from the Add-on Month feature — Invoice's schedule is dictated by the client's own invoice/payment timing, not a movable monthly cadence:

> *"Ano po paano sa invoice? Di ba invoice po, weekly? Kasi ang add-on yung invoice kasi fiction eh. Naka-different siya doon sa pag-release ng payment ni client nila. So, alam mo na na may ano nito. **Wala siyang move of payment. Wala siyang add-on po. Wala din siya.** Hindi siya pwedeng mag-add-on kasi nag-determine na kaagad kung kailan papasok yung invoice mo eh."*

No other loan type is named as excluded anywhere in the reviewed transcript.

---

## 7. What the transcript leaves genuinely unresolved — do not guess these

1. **Who records/owns the transaction — Collections or ER (AR)?** Asked directly; the answer given is short and somewhat ambiguous about which team it's assigning ownership to:
   > *"ang mag-record ko niyan, si Collection o si ER? Oo, sila na, kasi sa release na yun siya nangyayari. Wala siyang pinagkat dito sa calculator."*
   This needs a direct follow-up with Rovick before implementation — do not assume Collections or AR based on this line alone.

2. **Exact deadline mechanics for the shifted installment.** §5 above shows the transcript gesturing at "a due date you must pay by, or it reverts," but the exact rule (is it the shifted month's own new due date? a hard N-day window?) is not stated in unambiguous, quotable terms in the reviewed excerpt. Needs clarification before a due-date engine can be built for the revert path.

3. **Whether the one-time limit is truly unconditional, or implicitly expected to be used early.** §3 shows real-world usage is typically at the start of the loan, but no quote restricts eligibility to a specific window — treat it as "once, ever, at any point in the loan" unless told otherwise.

4. **Any required Collections-side approval workflow beyond "Collections decides."** The transcript confirms Collections (not the borrower) triggers it, but does not describe whether a single Collector can act alone or whether a supervisor/second approval is expected — no quote addresses this either way.

---

## 8. Current state of the codebase (checked 2026-08-31)

**Nothing has been built.** A repo-wide, case-insensitive search for `moveOfPayment`, `move_of_payment`, and "Move of Payment" returns zero matches anywhere in `src/`. There is no schema column, no API route, no UI, no ledger handling, and no one-time-use tracking of any kind.

Relevant existing patterns worth knowing about before designing this, since they solve adjacent problems and may be reusable:
- The **origination discount** feature (`src/lib/computation/discount-units.ts`, `originationDiscounts` on `computations`) already has a notion of "per-installment, future-due-date-only" eligibility and a due-date cutoff check — structurally similar to what a "shift the schedule, only for not-yet-due installments" feature would need.
- The **30-day rollover** logic in `src/lib/ar/posting.ts` (`refreshMasterlistAging`) already folds one installment's balance into the next installment and marks the original `'rolled'` — structurally the closest existing precedent in this codebase for "one installment's obligation moves onto another," though its trigger (91-day delinquency) and effect (adds the old balance on top) are the opposite of what Move of Payment needs (a **voluntary, penalty-avoiding** shift with **no added balance**).
- The account ledger (`src/components/ledger/AccountLedger.tsx` and `src/lib/ledger/build-account-ledger-rows.ts`) already renders debit/credit/target/status columns per row — the "blank target, interest-only debit=credit line" described in §2.3 would be a new row *type* on this existing ledger, not a new ledger.

None of the above were built with Move of Payment in mind — they are cited only as prior art that a future implementation plan should look at, not as a design decision already made.
