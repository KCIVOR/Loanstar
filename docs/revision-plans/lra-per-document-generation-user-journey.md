# LRA per-document generation — validation walkthrough

Non-technical step-by-step to confirm the feature works. Each step has an
**Expected** result — tick it or note what actually happened.

## Before you start

- Dev server running (`npm run dev`), open `http://localhost:3000`.
- The login page has **quick-login buttons** (seed accounts): you'll use
  **Super Admin**, **LRA**, and **Borrower**.
- You need one loan sitting at the **"Generate"** step of LRA release:
  - Quickest: **AN300458** (SME, With PDC) is already there.
  - For the seafarer check you need a seafarer loan at the same step — if you
    don't have one, take any seafarer application through Committee approval →
    LRA path selection → PDC encoding until its release file says
    *"Pending: document generation"*.
- To sign out between roles: top-right user menu → **Sign out**.

---

## Scenario A — Admin sets which documents appear (Option B)

1. Log in with **Super Admin**. Go to **Admin → Doc Templates**.
   - **Expected:** the template list loads. Release-category rows include BLRI,
     Promissory Note, vouchers, Deed of Chattel Mortgage, Real Estate Mortgage,
     Acknowledgement Receipt, Endorsement Letter, etc.

2. Open **BLRI (Loan Release Information)**.
   - **Expected:** a new **"Document generation"** box appears above the editor
     with two dropdowns — *Seafarer document generation* and *SME & Individual
     document generation* — both set to **Always**. Helper text explains
     Always / Optional / Hidden.

3. Open a **non-release** template (e.g. *Demand Letter*, category "collection").
   - **Expected:** **no** "Document generation" box (it only shows for release
     templates).

4. Back on **BLRI**, change *Seafarer document generation* to **Optional**.
   - **Expected:** green **"Generation settings updated"** banner. Reload the
     page — the dropdown still reads **Optional** (it saved).

5. Change it **back to Always**.
   - **Expected:** saved again. (Leave it on Always so Scenario B matches.)

6. Open **Acknowledgement Receipt**.
   - **Expected:** *Seafarer* = **Hidden**, *SME & Individual* = **Optional**.

7. Open **Deed of Chattel Mortgage**.
   - **Expected:** *Seafarer* = **Hidden**, *SME & Individual* = **Always**.

---

## Scenario B — LRA generates documents on an SME loan (the main flow)

Log in with **LRA**. Open the release workspace for **AN300458**
(LRA → Release queue → AN300458), scroll to **"Generate documents"**.

8. **Expected:** instead of the old single "Generate release documents" button
   you see a **"Choose documents to generate"** button. Because AN300458 is SME,
   there is **no** "Generate all" button next to it.

9. Click **Choose documents to generate**.
   - **Expected:** a **wide** pop-up **"Generate release documents"** with a
     **search box**, two dropdowns (**Requirement**: All / Required / Optional,
     **Status**: All / Not generated / Generated / Signed), and a **table**
     (**Document · Status · Action**). It shows **6 rows per page** — page 1 is
     BLRI, Promissory Note, Disclosure Statement, Letter of Intent, Loan
     Agreement, Check Voucher — with a **"1–6 of 10"** summary and **page
     numbers 1 2** at the bottom.
   - **Expected — NOT in the list at all:** Cash Voucher and AR ATM Voucher
     (this loan is *With PDC*), and Deed of Chattel Mortgage / Real Estate
     Mortgage (no collateral).

10. Click page **2**.
    - **Expected:** AR Check Voucher, AR Cash Voucher, Acknowledgement Receipt,
      Endorsement Letter (**"7–10 of 10"**). AR Cash Voucher / Acknowledgement
      Receipt / Endorsement Letter show a small **"optional"** tag.
      **Endorsement Letter's** Generate button is **greyed out** ("Template not
      published yet").

11. Test the search and filters (each one re-queries the server):
    - Type **voucher** in the search box → table shows only the 3 voucher rows,
      summary **"1–3 of 3"**. Clear it.
    - Set **Requirement → Optional** → only AR Cash Voucher, Acknowledgement
      Receipt, Endorsement Letter. Set it back to **All**.
    - Set **Status → Not generated** → all 10 (nothing generated yet). Set back
      to **All**.
    - Combine: **search "voucher" + Requirement "Required"** → only Check
      Voucher + AR Check Voucher (AR Cash Voucher is optional, so excluded).

12. Clear the filters, go to page 1, click **Generate** on **BLRI**.
    - **Expected:** the button shows a spinner for a few seconds (it's building a
      PDF), then the BLRI row changes to a green **"Generated <today>"** tag, a
      **PDF** link appears, and the button now says **Regenerate**.

13. Close the pop-up (× top-right). Scroll down on the page.
    - **Expected:** a **"Generated documents"** section is now visible (it wasn't
      before), listing **Blri** with **PDF**, **Mark signed**, **Regenerate**,
      and **Remove** buttons. The release file has moved to the **Sign** step.

14. Open the pop-up again, click **Generate** on **Promissory Note** and
    **Disclosure Statement** (wait for each).
    - **Expected:** both appear in the "Generated documents" section. Pop-up rows
      show "Generated / Regenerate" for them.

15. In the **"Generated documents"** section, click **Regenerate** on **Blri**.
    - **Expected:** a confirmation dialog ("Regenerate this document?"). Confirm.
      The row refreshes (new "Generated" timestamp), still unsigned.

16. Click **Mark signed** on **Promissory Note** → confirm.
    - **Expected:** row shows "Signed <time>". The counter near the section
      heading goes to **1/3**.

17. Click **Regenerate** on the **signed** Promissory Note.
    - **Expected:** the confirm dialog now warns that regenerating **clears the
      signature**. Confirm → the row goes back to unsigned, counter back to 0/3.

18. Click **Remove** on **Disclosure Statement** → confirm ("Yes, remove").
    - **Expected:** the row disappears from the list. If you reopen the pop-up,
      Disclosure Statement is back to **"Not generated" / Generate**.

19. Click **Remove** on the remaining docs one by one until none are left.
    - **Expected:** when the last one is removed, the **"Generated documents"
      section disappears entirely** and the release file drops back to the
      **Generate** step ("Pending: document generation").

---

## Scenario C — LRA on a seafarer loan (curated list + "Generate all")

Open a **seafarer** loan that's at the Generate step.

20. Scroll to **"Generate documents"**.
    - **Expected:** the **"Choose documents to generate"** button **and** a
      secondary **"Generate all"** button (seafarer only).

21. Click **Choose documents to generate**.
    - **Expected:** the same wide pop-up (search + filters + table), but only
      **7 documents total** (**"1–6 of 7"**, 2 pages): BLRI, Promissory Note,
      Disclosure Statement, Letter of Intent, Loan Agreement, and the voucher
      pair for this loan's path (Check Voucher + AR Check Voucher for With PDC,
      or Cash Voucher + AR ATM Voucher for Without PDC). **No** mortgages, **no**
      Acknowledgement Receipt, **no** Endorsement Letter.

22. Close the pop-up. Click **Generate all**.
    - **Expected:** after a short wait, **all 7** documents appear in the
      "Generated documents" section and the file moves to the **Sign** step —
      i.e. exactly the old behaviour, just triggered by a differently-named
      button.

---

## Scenario D — nothing else broke

23. **Close gate still enforced.** On a seafarer loan where you've generated the
    packet, mark everything signed, do the briefing, record the release, then try
    to **Close** without uploading the signed scans.
    - **Expected:** still blocked with *"Upload the following signed scan(s)…
      signed check voucher, signed/notarized promissory note, signed disclosure
      statement"*. (This feature did not touch the close gate.)

24. **Borrower upload page.** Log in as **Borrower**, open an application that's
    in release signing, find the "Upload supporting files for this release path"
    card.
    - **Expected:** it still lists the same non-auto-generated upload slots as
      before; the auto-generated PDFs (BLRI, PN, DS, vouchers, mortgages) are not
      offered as borrower uploads.

25. **Combined signed-docs upload (LRA).** On a loan in signing, use
    *"Scan all signed papers… upload once"*.
    - **Expected:** still works; the combined upload still targets the same
      required non-generated document types.

26. **A finalized/closed release.** Open a loan whose release is already
    **closed**.
    - **Expected:** no Regenerate / Remove buttons on its generated documents
      (they're locked once finalized), and no "Choose documents to generate"
      button.

---

## If anything fails

Note the **scenario + step number**, what you expected, and what actually
happened (screenshot helps). Common things to check first:
- Signed in as the right role (Admin needs Super Admin; generation needs LRA).
- The loan is actually at the **Generate** or **Sign** step (not earlier/later).
- PDF generation takes a few seconds per document — wait for the spinner.

---

## Modal redesign (2026-09-10, follow-up)

The generate pop-up was reworked with design-system components:
- **Wider** — `!max-w-2xl` (~672px, was ~440px).
- **Table layout** (`Table`/`Th`/`Td`): **Document · Status · Action** columns.
- **Search bar always visible** (was SME-only) — `Input type="search"`.
- Rows in canonical packet order (core docs → path vouchers → extras), not
  DB order. Page size 10, `Pagination` shows only when it overflows.
- Verified live: width 672px, table renders, search filters
  ("voucher" → 3 rows), Endorsement Letter button disabled (unpublished).
