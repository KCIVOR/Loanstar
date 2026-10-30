# Website Content operations

The Website Content module edits landing, login and registration content plus shared public branding. All three pages publish as **one release**. Publishing and restoring require an active Super Admin. Saving a draft never changes the public site.

## Environment and rollout

- Develop locally on branch `staging` using Supabase `ddsvqjaknuniekygpbdr`.
- Apply and verify only the reviewed CMS migrations in `supabase/migrations`. Record the actual remote versions in the implementation evidence, not an assumed filename match.
- `WEBSITE_CMS_ENABLED=true` enables published-content reads locally. Restart the local Next server after changing environment flags. Disabled reads use checked-in default presentation.
- Do not configure Vercel, change Auth settings, or mutate production `acopcwlhkovssjnrqygk` as part of this rollout.

## Edit, preview and publish

1. Open **Website Content** in the admin navigation.
2. Edit Landing, Login, Register, Branding and SEO tabs. The History tab lists releases.
3. Save the shared draft. Validation explains unsafe destinations, broken links to hidden sections, invalid fields or oversized content. Fix these before continuing.
4. Open the saved-page preview in another tab. Preview does not display unsaved input. Its login and registration controls are inert and it never creates an account.
5. Review all three previews and branding. Only Super Admin can use **Publish all three pages**. The confirmation shows affected content areas and release identities.
6. Refresh the public pages after success. Publication does not require rebuilding the app; an already-open browser tab does not automatically refresh.

Header/footer stay fixed and the hero stays first. The editor offers supported content sections and list items, not arbitrary HTML or layouts. Hide/order controls do not remove the requirement to maintain valid navigation anchors.

Authentication and registration validation, request payloads, field definitions, role assignment, confirmation behavior and destinations remain application code. Registration success messages are code-owned. CMS edits cannot replace the credential submission endpoint.

## Conflicts and recovery

A 409 means another save, publication or restore changed the expected state. The editor retains local input and does not automatically overwrite the newer state. Copy any unsaved content needed for comparison, then deliberately reload the saved state. Never blindly retry against a new version.

If a publish response is lost, retry the identical intent. Its request ID resolves the same successful revision; it must not create another release. Changing content or publication intent creates a new request ID.

Restore creates a new whole-site release copied from retained history; it does not delete history. The separate draft is retained with an older baseline. Before publishing that draft, explicitly choose either **Replace draft with live release** or **Keep draft and acknowledge live release**. Review all three pages again after keeping the draft.

Turning `WEBSITE_CMS_ENABLED` off returns public views to checked-in defaults and leaves CMS schema/history untouched. It does not roll back account or loan data. A content rollback uses an audited restore, not SQL deletion or migration-history repair.

## Media

Only upload approved PNG, JPEG or WebP branding images, within 5 MiB and 16 megapixels. The server decodes/normalizes images. Draft originals are private and viewed through an authenticated preview stream.

Publishing prepares immutable public copies before the database switch. These prepared files may become accessible before the content commit. Never upload confidential customer data as website media. Existing public images are not overwritten. Referenced historic images are retained so restoration works.

There is no automatic media deletion or cleanup in this release. Failed preparation may leave unreferenced objects; inspect them through an explicitly reviewed maintenance process rather than deleting objects during a concurrent publication.

Missing approved logo/favicon files are not fabricated or copied from production. Until approved files are uploaded, the public renderer uses the deliberate text-brand fallback.

## Verification and limitations

Before declaring rollout complete, record actual migration IDs, grants/RLS/RPC checks, active-role publication restrictions, atomic failure and conflict/idempotency tests, local UI/mobile preview checks, auth/registration regressions and the unchanged registration API checksum in implementation evidence.

This runbook describes intended and implemented operations; it is not test evidence by itself. Consult the implementation evidence for observed checks and any remaining failures. New section types, legal-policy pages, global portal rebranding, scheduling and multilingual editing are outside this module's initial scope.
