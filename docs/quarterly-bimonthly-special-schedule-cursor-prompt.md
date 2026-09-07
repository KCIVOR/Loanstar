# Cursor Implementation Prompt — Quarterly/Two-Monthly Special Schedule

Copy everything below the line into Cursor as your instruction.

---

You are implementing a plan written by another AI (Claude) for this codebase. Follow it exactly. Do not improvise, do not "improve" it, do not invent file paths, function names, or line numbers that are not either (a) already in the plan, or (b) something you have just opened and read yourself in this repo.

**Plan document (read this file in full before writing any code):**
`loanstar/docs/quarterly-bimonthly-special-schedule-implementation-plan.md`

## Hard rules

1. **Read the plan file first, completely, before touching any code.** Do not start from your own understanding of "how loan schedules probably work" — this codebase has non-obvious conventions (e.g. `payment_schedule` and `payment_frequency` are two different columns with two different value sets, translated via a specific function). The plan documents the real, verified current behavior.

2. **Before editing any file the plan references, open and read that exact file yourself first.** Line numbers in the plan were correct as of validation, but if they've drifted, locate the described code by the function/variable names in the plan, not by blindly trusting the line number. If you cannot find what the plan describes at or near the cited location, **stop and report the mismatch instead of guessing** what it meant.

3. **Do not invent new files, functions, columns, or types that the plan does not mention.** If you believe something is missing from the plan (e.g. a call site the plan didn't list), say so explicitly in your output as a flagged gap — do not silently add your own file to cover it without flagging it.

4. **Implement phases in order (Phase 1 → Phase 8 as listed in the plan).** Do not skip ahead or combine phases. After each phase, run `npm run typecheck` (or the repo's equivalent — check `package.json` scripts, do not assume) and fix any errors before moving to the next phase.

5. **Scope discipline — touch only what the plan lists.** Do not refactor, rename, reformat, or "clean up" surrounding code you encounter while editing these files. Do not add comments explaining what the code does — only add a comment if there's a genuinely non-obvious reason (matching this repo's existing comment style — read a few examples in `src/lib/ar/schedule.ts` before writing any).

6. **Exact naming — no synonyms.** The two new schedule values are exactly `quarterly_special` and `two_monthly_special` (snake_case, matching every other value in the same enum: `mpl`, `salary`, `monthly`, `weekly`, `bi_monthly`, `quarterly`, `two_monthly`, `daily`). Do not use `balloon`, `interest_only`, or any other label anywhere in code, migration, UI copy, or comments — the client's own term for this was just "special arrangement," and "Special" is the label we're standardizing on. UI display labels may say e.g. "Quarterly (Special)" but the underlying value must be `quarterly_special`.

7. **Bi-Monthly (`bi_monthly`, the every-15-days schedule) is explicitly OUT OF SCOPE.** Do not add a special variant for it. Do not modify `generateBiMonthlySchedule` in `src/lib/ar/schedule.ts` at all. If you notice something that makes you think Bi-Monthly should also get this treatment, stop and ask — do not add it unprompted.

8. **Do not modify the "even" (existing) code paths.** `generateQuarterlySchedule`, `generateTwoMonthlySchedule`, and the default/even branch of `generateInterestPrincipalSplitSchedule` must produce byte-identical output after your changes as before. If your diff touches any line inside those that isn't strictly additive (e.g. adding an optional parameter with a default that preserves old behavior), stop and reconsider your approach.

9. **Migrations**: write the migration file described in Phase 1, but do **not** apply it yourself via CLI (`supabase db push`) — this repo applies migrations via the Supabase MCP tool (`apply_migration`), a separate step the human operator runs. Just create the `.sql` file in `supabase/migrations/` with a correct timestamp prefix (check the most recent existing migration filename for the timestamp format) and stop there — flag that it's ready to apply.

10. **Testing**: add unit tests for the two new generator functions following the existing pattern in `src/lib/ar/__tests__/schedule.test.ts` (read that file first to match its style exactly). Test cases are listed in the plan's "Testing checklist" section — implement all of them, don't skip any.

11. **If anything in the plan conflicts with what you actually observe in the code**, stop, report the specific conflict (quote both the plan's claim and what you found), and wait for a decision rather than resolving the conflict yourself.

12. **When you finish all 8 phases**, produce a summary report listing: every file you changed, a one-line description of the change per file, which tests you added/ran and their result, and any deviations from the plan (with justification) or open flags raised per rule 11.

## Commit message (if you are asked to commit)

Use a message describing the actual change (new `quarterly_special`/`two_monthly_special` schedule types), and end it with:

```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

Do not commit unless explicitly asked to.
