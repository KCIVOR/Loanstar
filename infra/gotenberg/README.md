# Gotenberg render service

Headless-Chromium HTML→PDF for the document renderer. Replaces the in-process
`pdfmake` path so the editor preview and the generated PDF use the **same engine**.

Plan: `docs/revision-plans/tiptap-gotenberg-implementation-plan.md`.

---

## 1. Deploy (Fly.io)

Prereqs: a Fly.io account, `flyctl` installed and `fly auth login`.

```bash
cd infra/gotenberg
fly launch --no-deploy --copy-config --name loanstar-gotenberg --region sin
fly secrets set \
  GOTENBERG_API_BASIC_AUTH_USERNAME=loanstar \
  GOTENBERG_API_BASIC_AUTH_PASSWORD="$(openssl rand -hex 24)"
fly deploy
fly status
curl -u loanstar:<password> https://loanstar-gotenberg.fly.dev/health   # if public
# or, from a machine on the Fly private net:
curl -u loanstar:<password> http://loanstar-gotenberg.internal:3000/health
```

`fly.toml` pins `gotenberg/gotenberg:8.11.1`. **Do not** change the tag without
regenerating the golden hashes (see §4).

### Network options

| Option | `GOTENBERG_URL` in Vercel | Notes |
|---|---|---|
| **Fly private + Vercel–Fly WireGuard** (preferred) | `http://loanstar-gotenberg.internal:3000` | No public surface. Requires the Vercel functions to reach the Fly private net (Fly's `fly-replay` / a connector, or a small Fly proxy). |
| **Fly public app + basic auth** | `https://loanstar-gotenberg.fly.dev` | Simpler. Relies solely on the basic-auth credentials + `--chromium-deny-list`. Acceptable given JS is disabled and no user input reaches Chromium. |

Pick one at deploy time and set the Vercel env vars accordingly (§3).

---

## 2. Fonts

The renderer attaches the document font to **every** request (keeps determinism
independent of the container image). Provide **Liberation Sans** as WOFF2 at:

```
src/lib/documents/render/assets/doc.woff2
```

Get it from the `fonts-liberation` package (SIL Open Font License):

```bash
# Debian/Ubuntu:  /usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf
# then convert ttf -> woff2 (one of):
npx ttf2woff2 < LiberationSans-Regular.ttf > src/lib/documents/render/assets/doc.woff2
# or: pip install fonttools brotli ; fonttools ttLib.woff2 compress LiberationSans-Regular.ttf
```

A single variable/regular face is enough; `PRINT_CSS` declares `font-weight: 400 700`
and Chromium synthesises bold. If crisper bold is wanted, also ship
`LiberationSans-Bold` and split the `@font-face`. Record the exact source file +
sha256 below.

| File | Source | sha256 |
|---|---|---|
| `doc.woff2` | `LiberationSans-Regular.ttf` v_____ | `_____` |

---

## 3. Vercel environment variables

Set on the `loanstar` Vercel project (all environments):

| Var | Value |
|---|---|
| `GOTENBERG_URL` | the URL chosen in §1 (no trailing slash) |
| `GOTENBERG_BASIC_AUTH_USER` | `loanstar` |
| `GOTENBERG_BASIC_AUTH_PASS` | the secret from §1 |
| `DOC_RENDER_ENGINE` | `pdfmake` until Phase 5 flips it to `chromium` |

The renderer reads these in `src/lib/documents/render/gotenberg.ts` and
`src/lib/documents/render/index.ts`. With `DOC_RENDER_ENGINE` unset or `pdfmake`
the new path is completely dormant.

---

## 4. Determinism tests

`src/lib/documents/render/__tests__/chromium.integration.test.mts` is **skipped
unless `GOTENBERG_URL` is set**. To run it locally against the deployed service:

```bash
GOTENBERG_URL=https://loanstar-gotenberg.fly.dev \
GOTENBERG_BASIC_AUTH_USER=loanstar GOTENBERG_BASIC_AUTH_PASS=... \
npm test -- --test-name-pattern="chromium"
```

It renders representative templates repeatedly (and after a forced Gotenberg
restart) and asserts a stable `hashPdf`, plus per-template golden hashes. When the
Gotenberg image tag or `doc.woff2` changes, regenerate the goldens intentionally
and note why in the test file.

There is **no CI pipeline** in this repo (no `.github/workflows`), so these run
manually / on a schedule against the dev service.
