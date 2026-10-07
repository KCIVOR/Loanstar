# Legacy Import Horizontal Mapping Grid

## Goal

Make the mapping step feel like a spreadsheet so an administrator can see each uploaded column, a few values from that column, and its LoanStar destination together.

## Scope

Only the `Map columns` area in the Legacy Import wizard changes. Uploading, mapping suggestions, saved mappings, validation, and imports keep their existing behavior.

## Layout

The current vertical table becomes one horizontally scrollable grid.

| Grid row | Purpose |
| --- | --- |
| Source column | Displays the spreadsheet column number and uploaded header. |
| Sample values | Shows up to three non-empty values from that source column. |
| Maps to | Contains the existing LoanStar-field dropdown for that source column. |

Each source column is one fixed-width grid column. The grid has a visible horizontal scrollbar so wide sheets remain usable on smaller screens. The source column and mapping control remain vertically aligned.

## Feedback and behavior

- Existing automatic suggestions remain selected in each dropdown.
- `Ignore` remains available in every dropdown.
- A duplicate LoanStar destination keeps the existing red-border treatment on its dropdown.
- Existing required-field and duplicate warnings remain above the grid.
- Mapped-column counts, saved mappings, Back, and Validate controls remain unchanged.

## Accessibility

The grid uses semantic table markup. Every mapping dropdown has an accessible label containing its source-header name. Long text wraps or truncates within each fixed-width column without changing the data or mapping.

## Verification

- A source-level test asserts that the page renders the three spreadsheet grid row labels and an overflow container.
- Existing legacy-import tests continue to pass.
- Targeted linting covers the updated page and test.
