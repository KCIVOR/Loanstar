# Disclosure Source-Faithful Preview Plan

**Goal:** Produce a non-published Chromium/Gotenberg preview of the Disclosure Statement that matches the retained SF disclosure original.

**Approach:** Build a dedicated source-faithful HTML body with local CSS that overrides the shared defaults only inside the Disclosure form. The preview keeps original field underlines, fixed monetary columns, Item 10 ruled columns, certification lines, and borrower/co-borrower signature rows. It is rendered with representative data through the configured Gotenberg service. No database record changes until the user approves the rendered comparison.

**Acceptance criteria:**
- One long-bond page.
- Sans-serif 9pt-scale source form geometry.
- Borrower, company, and address displayed as three underlined rows in that order.
- Underline-based amount, rate, checkbox, Item 10, signatory, borrower, and co-borrower fields.
- No grid/table borders used as substitutes for underlines.
- No Page 1 of 1 footer in the preview.
- Generated preview is compared at full size against the source render.

**Tasks:**
1. Write failing structural tests for required source-form components and one-page rendering.
2. Implement the local Disclosure HTML/CSS preview body and a renderer script using configured Chromium/Gotenberg.
3. Render populated output and inspect it against the original.
4. Review the output with the user before creating a published template version.

