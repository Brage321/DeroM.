# 06 — public website (`derom.surge.sh`)

## What is published

The public site is the dashboard UI itself, served as static files by Surge:

| Published file | Bytes | Role |
| --- | --- | --- |
| `index.html` | 9,215 | Dashboard structure and dialogs |
| `styles.css` | 11,991 | Layout, cards, panels |
| `forms.css` | 986 | Dialogs, inputs, buttons |
| `app.js` | 9,838 | Dashboard logic |

Nothing else is uploaded: no `data/`, no `wallet-app/`, no `.env`, no chain
database, no private or public keys, no `server.js`. The page pulls its two
fonts from `fonts.googleapis.com`/`fonts.gstatic.com`; that is the only
third-party request the page makes.

## How to deploy

`surge` replaces the whole snapshot on every publish, so the project directory
must contain only those four files:

```powershell
git archive --format=zip -o work/site.zip HEAD index.html styles.css forms.css app.js
Expand-Archive work/site.zip -DestinationPath work/site-push -Force
surge work/site-push derom.surge.sh
```

The zip form is deliberate: piping `git archive --format=tar` into `tar -x`
through the Windows PowerShell pipeline corrupts the bytes ("Unrecognized
archive format"), because the pipeline decodes the stream as text.

Passing the domain on the command line is what selects the target site; a
`CNAME` file is not needed. Surge writes its own `CNAME` into the project
directory *after* a successful publish, so delete it before the next deploy from
that same directory or it will start being served at `/CNAME`.

## What visitors actually see

`app.js` calls its API with same-origin relative paths (`fetch('/api/state')`),
which is correct when the node serves the dashboard from
`http://127.0.0.1:8080`. Surge only serves static files, so on
`derom.surge.sh` those requests 404, `refreshState()` takes its error branch,
and the page renders exactly the same offline state a stopped local node
produces: node dot grey, height `0`, "No miner authorized yet".

Consequences to keep in mind:

- The published page shows no live chain data, because none is published.
- "Create wallet" cannot work there; `POST /api/wallet/create` has no backend.
  Wallet creation happens on a self-hosted node or in the Windows wallet app.
- No visitor's wallet data can reach this site — there is no endpoint to accept
  it, and the API stays loopback-only in `server.js`.

## Verification performed (2026-09-30)

Deployed from commit `d57cc0e`, then fetched back through Surge with cache
busting. The four files were also re-extracted from the `git` tree with
`git archive` and hash-compared, so what is live equals what is committed:

- `index.html`, `styles.css`, `forms.css`, `app.js` all returned HTTP 200 with
  SHA-256 digests identical to the repository copies, stable across two
  rounds of fetches.
- `http://derom.surge.sh/` and `https://derom.surge.sh/` both return the
  dashboard markup.
- The previous multi-page static site is gone: `/explorer`, `/rich-list`,
  `/pools`, `/connect`, `/assets/derom-mark.svg` and `/CNAME` all return 404.
- `/.git/config` returns 404 (no repository metadata published).
