"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  ConfirmDialog,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { DEFAULT_WEBSITE } from "@/lib/website/default-content";
import { websiteSchema, type WebsiteContent } from "@/lib/website/schema";
import { ContentFields } from "./ContentFields";
import { SectionList } from "./SectionList";
import { AssetPicker } from "./AssetPicker";
import { RevisionHistory } from "./RevisionHistory";
import {
  RequestFailure,
  websiteRequest,
  type AdminState,
  type Draft,
  type Revision,
} from "./types";

const TABS = [
  "Landing",
  "Login",
  "Register",
  "Branding",
  "SEO",
  "History",
] as const;
type Tab = (typeof TABS)[number];
type PendingOperation =
  | { kind: "publish" }
  | { kind: "restore"; revision: Revision }
  | { kind: "reset" }
  | { kind: "rebase" };

export function WebsiteEditor() {
  const [state, setState] = useState<AdminState | null>(null);
  const [content, setContent] = useState<WebsiteContent | null>(null);
  const [tab, setTab] = useState<Tab>("Landing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [operation, setOperation] = useState<PendingOperation | null>(null);
  const [summary, setSummary] = useState("");
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const dirty = Boolean(
    state &&
    content &&
    JSON.stringify(state.draft.content) !== JSON.stringify(content),
  );

  const reload = useCallback(async () => {
    const next = await websiteRequest<AdminState>("");
    setState(next);
    setContent(structuredClone(next.draft.content));
    setConflict(false);
  }, []);
  useEffect(() => {
    let active = true;
    websiteRequest<AdminState>("")
      .then((next) => {
        if (active) {
          setState(next);
          setContent(structuredClone(next.draft.content));
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    function unload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    function navigate(event: MouseEvent) {
      const link = (event.target as Element).closest("a[href]");
      if (
        link &&
        !link.hasAttribute("data-cms-preview") &&
        !window.confirm("You have unsaved website changes. Leave this editor?")
      )
        event.preventDefault();
    }
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);

  function handleError(error: unknown) {
    setError(
      error instanceof Error ? error.message : "Website operation failed",
    );
    if (error instanceof RequestFailure && error.status === 409)
      setConflict(true);
    if (
      error instanceof RequestFailure &&
      (error.status === 403 || error.status === 409)
    ) {
      void websiteRequest<AdminState>("")
        .then((current) => {
          setState((previous) =>
            previous
              ? { ...previous, capabilities: current.capabilities }
              : previous,
          );
        })
        .catch(() => {});
    }
    // Keep unsaved content and expected versions. Never automatically retry a conflicting operation.
  }

  async function save(): Promise<boolean> {
    if (!state || !content) return false;
    const parsed = websiteSchema.safeParse(content);
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      );
      return false;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await websiteRequest<{ draft: Draft }>("/draft", {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: state.draft.lock_version,
          content: parsed.data,
        }),
      });
      setState({ ...state, draft: next.draft });
      setContent(structuredClone(next.draft.content));
      setNotice("Draft saved. The published website has not changed.");
      setConflict(false);
      return true;
    } catch (error) {
      handleError(error);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmOperation() {
    if (!state || !operation) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const body = {
      expectedVersion: state.draft.lock_version,
      expectedPublishedRevisionId: state.publication.revision_id,
    };
    try {
      if (operation.kind === "reset" || operation.kind === "rebase") {
        await websiteRequest("/draft/reconcile", {
          method: "POST",
          body: JSON.stringify({ ...body, mode: operation.kind }),
        });
      } else {
        const intent =
          operation.kind === "publish"
            ? { ...body, summary }
            : { ...body, targetRevisionId: operation.revision.id };
        const fingerprint = JSON.stringify({ kind: operation.kind, ...intent });
        if (request.current?.fingerprint !== fingerprint)
          request.current = { fingerprint, id: crypto.randomUUID() };
        await websiteRequest(`/${operation.kind}`, {
          method: "POST",
          body: JSON.stringify({ ...intent, requestId: request.current.id }),
        });
        request.current = null;
      }
      setOperation(null);
      await reload();
      setNotice(
        operation.kind === "publish"
          ? "Landing, login, registration and branding were published together."
          : operation.kind === "restore"
            ? "Release restored. Your saved draft is preserved; reconcile before publishing again."
            : "Draft reconciliation completed.",
      );
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  if (!state || !content)
    return (
      <div>
        {error ? (
          <Alert>{error}</Alert>
        ) : (
          <Spinner label="Loading website content…" />
        )}
      </div>
    );
  const stale = state.draft.base_revision_id !== state.publication.revision_id;
  // JSONB object key order is not the schema's order. Normalize before comparing.
  const parsedLive = websiteSchema.safeParse(state.publication.public_content?.content);
  const live = parsedLive.success ? parsedLive.data : null;
  const changed = (["landing", "login", "register", "site"] as const).filter(
    (key) =>
      !live || JSON.stringify(live[key]) !== JSON.stringify(content[key]),
  );
  const editable = state.capabilities.canEdit && !busy;
  const authKey = tab === "Register" ? "register" : "login";
  const { seo: authSeo, ...authFields } = content[authKey];
  const authTemplate = { ...DEFAULT_WEBSITE[authKey] };
  // Registration has no staff hint/recovery UI, so do not expose fields its renderer cannot display.
  const visibleAuthFields =
    tab === "Register"
      ? Object.fromEntries(
          Object.entries(authFields).filter(
            ([key]) =>
              !["forgotLabel", "staffTitle", "staffHint"].includes(key),
          ),
        )
      : authFields;
  const { logoAssetId, iconAssetId, ...siteFields } = content.site;
  const previewPage =
    tab === "Register" ? "register" : tab === "Login" ? "login" : "landing";

  return (
    <div className="website-cms-editor max-w-5xl">
      <PageHeader
        title="Website Content"
        description="One release for landing, login, registration and public branding."
      />
      <div className="mb-4 rounded border bg-white p-4">
        <p className="text-sm">
          Draft version {state.draft.lock_version} ·{" "}
          {dirty ? "Unsaved changes" : "Saved"} · Published{" "}
          {new Date(state.publication.published_at).toLocaleString()}
        </p>
        <p className="mt-1 break-all text-xs text-slate-500">
          Live release: {state.publication.revision_id}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() => void save()}
            disabled={!editable || !dirty || conflict}
          >
            Save draft
          </Button>
          <a
            data-cms-preview
            href={`/website-preview/${previewPage}`}
            target="_blank"
            rel="noreferrer"
            className="rounded border px-3 py-2 text-sm"
          >
            Preview saved {previewPage}
          </a>
          <Button
            variant="accent"
            disabled={
              !state.capabilities.canPublish ||
              busy ||
              dirty ||
              stale ||
              conflict
            }
            onClick={() => setOperation({ kind: "publish" })}
          >
            Publish all three pages
          </Button>
        </div>
        {dirty && (
          <p className="mt-2 text-xs text-amber-800">
            Save before previewing or publishing. Preview shows only the last
            saved draft.
          </p>
        )}
        {!state.capabilities.canPublish && (
          <p className="mt-2 text-sm">
            Publishing and restoring require an active Super Admin.
          </p>
        )}
      </div>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert variant="success">{notice}</Alert>
        </div>
      )}
      {conflict && (
        <div className="mb-4 rounded border border-amber-300 p-4">
          <p className="mb-2 text-sm">
            Another operation changed the saved draft or live release. Your
            local input is preserved. Reloading discards this local input.
          </p>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "Discard local input and load the current saved state?",
                )
              )
                void reload().catch(handleError);
            }}
          >
            Discard local input and reload
          </button>
        </div>
      )}
      {stale && (
        <div className="mb-4 rounded border border-amber-300 p-4">
          <p className="mb-2 text-sm">
            The live release changed after this draft&apos;s baseline. Reconcile
            before publishing. Save or discard unsaved input first.
          </p>
          <div className="flex gap-3">
            <Button
              disabled={!editable || dirty}
              onClick={() => setOperation({ kind: "reset" })}
            >
              Replace draft with live release
            </Button>
            <Button
              disabled={!editable || dirty}
              onClick={() => setOperation({ kind: "rebase" })}
            >
              Keep draft and acknowledge live release
            </Button>
          </div>
        </div>
      )}
      <div
        role="tablist"
        aria-label="Website content areas"
        className="mb-4 flex flex-wrap gap-2"
      >
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={`rounded border px-3 py-2 text-sm ${tab === name ? "bg-navy-900 text-white" : "bg-white"}`}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <fieldset disabled={!editable} className="min-w-0">
        {tab === "Landing" && (
          <>
            <SectionList
              sections={content.landing.sections}
              onChange={(sections) =>
                setContent({
                  ...content,
                  landing: { ...content.landing, sections },
                })
              }
            />
            <ContentFields
              label="Header and navigation"
              value={{
                navigation: content.landing.navigation,
                loginLabel: content.landing.loginLabel,
                applyLabel: content.landing.applyLabel,
              }}
              template={DEFAULT_WEBSITE.landing}
              onChange={(next) =>
                setContent({
                  ...content,
                  landing: {
                    ...content.landing,
                    ...(next as Pick<
                      WebsiteContent["landing"],
                      "navigation" | "loginLabel" | "applyLabel"
                    >),
                  },
                })
              }
            />
            <ContentFields
              nullableHref
              label="Footer"
              value={content.landing.footer}
              template={DEFAULT_WEBSITE.landing.footer}
              onChange={(next) =>
                setContent({
                  ...content,
                  landing: {
                    ...content.landing,
                    footer: next as WebsiteContent["landing"]["footer"],
                  },
                })
              }
            />
          </>
        )}
        {(tab === "Login" || tab === "Register") && (
          <>
            <p className="mb-4 text-sm text-slate-600">
              Only presentation copy is editable. Field definitions, validation,
              passwords, account creation, confirmation messages and
              destinations remain controlled by application code.
            </p>
            <ContentFields
              value={visibleAuthFields}
              template={authTemplate}
              onChange={(next) =>
                setContent({
                  ...content,
                  [authKey]: {
                    ...content[authKey],
                    ...(next as Partial<typeof authFields>),
                    seo: authSeo,
                  },
                })
              }
            />
            {tab === "Register" && (
              <aside className="rounded border bg-slate-50 p-3 text-sm">
                <strong>Code-owned registration result</strong>
                <p>Check your email</p>
                <p>
                  We sent a confirmation link to your inbox. Open it to confirm
                  your email — you will be signed in automatically.
                </p>
                <p className="mt-2">
                  If no confirmation was sent, the existing alternate
                  account-created guidance is shown. These states are selected
                  by the API, not CMS content.
                </p>
              </aside>
            )}
          </>
        )}
        {tab === "Branding" && (
          <>
            <ContentFields
              value={siteFields}
              onChange={(next) =>
                setContent({
                  ...content,
                  site: {
                    ...(next as typeof siteFields),
                    logoAssetId,
                    iconAssetId,
                  },
                })
              }
            />
            <AssetPicker
              disabled={!editable}
              site={content.site}
              onChange={(site) => setContent({ ...content, site })}
            />
          </>
        )}
        {tab === "SEO" &&
          (["landing", "login", "register"] as const).map((key) => (
            <ContentFields
              key={key}
              label={`${key} metadata`}
              value={content[key].seo}
              onChange={(seo) =>
                setContent({ ...content, [key]: { ...content[key], seo } })
              }
            />
          ))}
      </fieldset>
      {tab === "History" && (
        <RevisionHistory
          currentId={state.publication.revision_id}
          canRestore={state.capabilities.canPublish && !dirty && !conflict}
          busy={busy}
          onRestore={(revision) => setOperation({ kind: "restore", revision })}
        />
      )}
      <ConfirmDialog
        open={operation !== null}
        title={
          operation?.kind === "publish"
            ? "Publish the whole website?"
            : operation?.kind === "restore"
              ? "Restore the whole website?"
              : "Reconcile saved draft?"
        }
        loading={busy}
        onCancel={() => {
          if (!busy) setOperation(null);
        }}
        onConfirm={() => void confirmOperation()}
        confirmLabel={
          operation?.kind === "publish"
            ? "Publish all three pages"
            : operation?.kind === "restore"
              ? "Restore as new release"
              : "Confirm reconciliation"
        }
      >
        {operation?.kind === "publish" ? (
          <>
            <p>
              Landing, login, registration and shared public branding will
              switch together.
            </p>
            <p className="mt-2 text-sm">
              Changed areas:{" "}
              {changed
                .map((key) => (key === "site" ? "Branding" : key))
                .join(", ") || "No content changes"}
              .
            </p>
            <p className="mt-2 text-xs">
              Draft version {state.draft.lock_version}; live release{" "}
              {state.publication.revision_id}.
            </p>
            <label className="mt-3 block text-sm">
              Release summary
              <input
                className="mt-1 w-full rounded border p-2"
                maxLength={500}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </label>
          </>
        ) : operation?.kind === "restore" ? (
          <p>
            Restore release {operation.revision.revision_no} as a new release
            for all three pages and branding. Your saved draft is retained and
            must be reconciled afterward.
          </p>
        ) : (
          <p>
            {operation?.kind === "reset"
              ? "Replace the saved draft with the live release. This discards saved draft content."
              : "Keep the saved draft content and explicitly acknowledge the current live release as its baseline. Review all three pages before publishing."}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
