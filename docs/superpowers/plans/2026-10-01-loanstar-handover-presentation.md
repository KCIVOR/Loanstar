# Loanstar Handover Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a verified 12-slide final handover presentation for the Loanstar Seafarer Lending Platform.

**Architecture:** Copy the supplied Final Project Handover template, retain its reusable visual system, and adapt 12 existing layouts into a practical operational handover story. Populate only UAT-supported facts from the Loan Star UAT record, and label unsupported operational details as confirmation items.

**Tech Stack:** JavaScript ES modules, `@oai/artifact-tool`, supplied PPTX template, bundled Node.js runtime, and bundled slide rendering and inspection tools.

---

### Task 1: Inspect source materials and establish content controls

**Files:**

- Read: `C:\Users\Rovick\Downloads\StartupLab_Final_Project_Handover_Presentation_Template (4).pptx`
- Read: `C:\Users\Rovick\Downloads\Loan Star-System-UAT-POL006.docx`
- Read: `docs/superpowers/specs/2026-10-01-loanstar-handover-presentation-design.md`
- Create: `tmp/presentations/loanstar-handover-content.json`

- [ ] **Step 1: Inspect every template layout and render the source deck**

Run the bundled presentation inspection and rendering workflow to record layouts, masters, text placeholders, colors, and fonts. Confirm the source contains 17 slides and use its existing title, table, and decision-slide patterns.

- [ ] **Step 2: Extract verified UAT information**

Create `tmp/presentations/loanstar-handover-content.json` with the project, client, Project Owner, CEO, UAT version and period, Accepted decision, September 25 2026 acceptance date, 109 passed test cases, production URL, and three documented limitations from the UAT record.

- [ ] **Step 3: Define controlled confirmation labels**

Use exactly `To be confirmed during handover` for client administrator names, ownership assignments, warranty dates, support hours, support channel, access-transfer evidence, training evidence, and the final handover date.

### Task 2: Build the 12-slide deck from the template

**Files:**

- Create: `tmp/presentations/build-loanstar-handover.mjs`
- Create: `output/presentations/Loanstar_Final_Project_Handover.pptx`

- [ ] **Step 1: Copy and import the template deck**

Create the output directory and duplicate the supplied template before modification. Import the copy with `@oai/artifact-tool` so the output retains the template's masters, theme, fonts, footer, and slide-number styling.

- [ ] **Step 2: Retain and populate 12 template-compatible slides**

Populate these slides in order: cover; handover purpose; completion summary; final scope and UAT acceptance; delivered workflows; live production walkthrough; access and ownership transfer; documents, training, and responsibilities; support, warranty, and escalation; remaining actions and known limitations; final decision and sign-off; closure and post-handover review.

- [ ] **Step 3: Apply verified content and confirmation labels**

Use the source facts from Task 1. Preserve all verified UAT details. Keep the system walkthrough centered on the production URL and controlled checks for availability, login and roles, core lending workflow, reporting output, and logout. Do not claim data migration, account transfer, training completion, warranty terms, or client ownership have already occurred.

- [ ] **Step 4: Remove unused slides and renumber**

Delete the five unused template slides, ensure the output contains exactly 12 slides, and update visible slide numbers to run from 01 through 12 without gaps.

### Task 3: Verify the presentation visually and structurally

**Files:**

- Read: `output/presentations/Loanstar_Final_Project_Handover.pptx`
- Create: `tmp/presentations/loanstar-handover-render/`

- [ ] **Step 1: Run structural checks**

Inspect the final deck for exactly 12 slides, required slide titles, the production URL, the UAT Accepted decision, the 109 passed-test-case statement, and all three known limitations.

- [ ] **Step 2: Render every output slide**

Render the deck to slide images. Inspect all 12 images for clipped text, table overflow, overlap, missing slide numbers, broken footer treatment, and template-style drift.

- [ ] **Step 3: Correct and re-render if needed**

If a slide has a visual defect, revise only the affected text or layout, then re-render the entire deck. Deliver only after every slide is legible and the template fidelity is preserved.

- [ ] **Step 4: Commit the generated deck and build script**

Run:

```powershell
git add output/presentations/Loanstar_Final_Project_Handover.pptx tmp/presentations/build-loanstar-handover.mjs docs/superpowers/plans/2026-10-01-loanstar-handover-presentation.md
git commit -m "docs: create loanstar final handover presentation"
```

Expected result: Git records the build plan, build script, and final 12-slide deck.
